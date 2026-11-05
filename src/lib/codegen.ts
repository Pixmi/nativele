import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, watch, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseFragment } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { HOLE_ANY, holeName, IDENT } from "./holes.ts";
import { RESERVED_NAMES } from "./reserved.ts";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Template = DefaultTreeAdapterMap["template"];
type Parent = DefaultTreeAdapterMap["parentNode"];

export interface Diagnostic {
  /** Stable rule id, e.g. "duplicate-ref". Used for `ignore` lists and documentation. */
  rule: string;
  severity: "error" | "warning";
  /** What is wrong, why it matters, and how to fix it. */
  message: string;
  line: number;
  col: number;
}

/** Every diagnostic that `ts-dom gen` can report while analyzing a template. */
export const CODEGEN_RULES = {
  "invalid-hole": "a {{ hole }} must be a single identifier (no paths or expressions)",
  "attr-hole": "{{ }} is only supported in text, not in attributes",
  "invalid-event-name": "the event name in data-on-<event> must be lowercase",
  "invalid-handler": "data-on-* must be a plain method name (no calls or expressions)",
  "reserved-handler": "the handler name would override a DOM or ts-dom member",
  "empty-ref": "data-ref must not be empty",
  "duplicate-ref": "data-ref names must be unique within a scope",
  "empty-if": "data-if must not be empty",
  "if-on-item-root": "data-if cannot be on the root element of a data-each item",
  "slot-in-list": "<slot> cannot be inside a data-each template",
  "style-not-top-level": "<style> must be a top-level element of the template",
  "duplicate-slot": "slot names should be unique (warning)",
  "each-not-template": "data-each only works on <template>",
  "empty-each": "data-each must not be empty",
  "nested-each": "data-each templates cannot be nested",
  "duplicate-each": "data-each names must be unique",
  "each-binding-incomplete": "data-key and data-prop go together on a data-each template",
  "invalid-each-binding": "data-key and data-prop must each be a single identifier",
  "each-binding-root": "with data-key and data-prop the item must be one custom element",
  "each-root-count": "a data-each template needs exactly one root element",
  "document-tag": "<html>, <head> and <body> cannot be in a template (the browser drops them from fragments)",
  "forbidden-tag": "<script> cannot be in a template (it would run code)",
  "forbidden-attribute": "on* event attributes and srcdoc cannot be in a template (they run code or are blocked by Trusted Types)",
  "unsafe-url": "href / src / action / formaction cannot start with javascript:",
  "duplicate-define": "a custom element tag can be defined only once across the scanned directories",
} as const;

export interface Loc {
  line: number;
  col: number;
}

interface Scope {
  refs: Map<string, string>;
  text: Set<string>;
  ifs: Set<string>;
}
export interface Analysis {
  scope: Scope;
  lists: Map<string, Scope>;
  slots: Set<string>;
  /** The `data-each` lists that have `data-key` and `data-prop`: their items are components assigned through `items`. */
  boundLists: Map<string, { tag: string; prop: string; key: string }>;
  /** Method names referenced by data-on-* (including inside list items). */
  events: Set<string>;
  /** Every data-on-* occurrence: event type, handler method, element tag (used by data-flow checks). */
  eventSites: { event: string; method: string; tag: string; attrs: string[] }[];
  /** Custom element tags used by the template; codegen imports the modules that define them. */
  customTags: Set<string>;
  /** Attributes of every custom element occurrence (used by prop/event contract checks). */
  customUses: { tag: string; attrs: string[]; events: string[]; line: number; col: number }[];
  /**
   * First source location of each marker, keyed by kind and name:
   * `ref:name`, `if:name`, `text:name`, `each:name`, `event:method`, and for list items `ref:list/name`, `if:list/name`, `text:list/name`.
   */
  locs: Map<string, Loc>;
  diagnostics: Diagnostic[];
}

const RESERVED_ELEMENT_NAMES = new Set(["annotation-xml", "color-profile", "font-face", "font-face-src", "font-face-uri", "font-face-format", "font-face-name", "missing-glyph"]);
const isCustomElementName = (tag: string): boolean => /^[a-z][a-z0-9._]*-[a-z0-9._-]*$/.test(tag) && !RESERVED_ELEMENT_NAMES.has(tag);
const URL_ATTRS = /^(href|src|action|formaction|xlink:href)$/i;
const HTML_NS = "http://www.w3.org/1999/xhtml";
const newScope = (): Scope => ({ refs: new Map(), text: new Set(), ifs: new Set() });
const attr = (el: Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
const isEl = (n: Node): n is Element => "tagName" in n;
const isRaw = (n: Element) => n.tagName === "style" || n.tagName === "script";
const locOf = (n: Node): Loc => {
  const loc = (n as { sourceCodeLocation?: { startLine: number; startCol: number } | null }).sourceCodeLocation;
  return { line: loc?.startLine ?? 1, col: loc?.startCol ?? 1 };
};

/** Scan an HTML template for data-ref / data-each / data-if / <slot name> / {{ name }} / data-on-* and collect diagnostics. */
export function analyze(html: string): Analysis {
  const root = parseFragment(html, { sourceCodeLocationInfo: true });
  const a: Analysis = {
    scope: newScope(),
    lists: new Map(),
    slots: new Set(),
    boundLists: new Map(),
    events: new Set(),
    eventSites: [],
    customTags: new Set(),
    customUses: [],
    locs: new Map(),
    diagnostics: [],
  };
  const report = (rule: string, severity: Diagnostic["severity"], message: string, n: Node) => {
    a.diagnostics.push({ rule, severity, message, ...locOf(n) });
  };
  const blanked = html.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
  for (const m of blanked.matchAll(/<(html|head|body)(?=[\s/>])/gi)) {
    const before = blanked.slice(0, m.index);
    a.diagnostics.push({
      rule: "document-tag",
      severity: "error",
      message: `<${m[1]?.toLowerCase()}> cannot be in a template: a template is a fragment of a component, and the browser drops <html>, <head> and <body> from fragments, so nothing you put on them has any effect. Fix: remove the tag and keep its content. If this file is a whole page, start it with <!doctype html> and it is treated as a page entry and skipped (or leave it out with --exclude).`,
      line: before.split("\n").length,
      col: m.index - before.lastIndexOf("\n"),
    });
  }
  const mark = (key: string, n: Node) => {
    if (!a.locs.has(key)) a.locs.set(key, locOf(n));
  };

  function holesIn(value: string, scope: Scope, listName: string | null, at: Node): void {
    for (const m of value.matchAll(HOLE_ANY)) {
      const name = holeName(m[1] ?? "");
      if (name) {
        scope.text.add(name);
        mark(listName ? `text:${listName}/${name}` : `text:${name}`, at);
      } else {
        const inner = (m[1] ?? "").trim();
        report(
          "invalid-hole",
          "error",
          `{{ ${inner} }} is not a valid hole: a hole must be a single identifier, paths and expressions are not supported. Fix: compute the value in TypeScript (state, derive or this.text) and use a named hole such as {{ name }}. If the file is another framework's template, this folder is not meant to be scanned: scan only the folder with the Nativele templates, or leave the file out with --exclude.`,
          at,
        );
      }
    }
  }

  function walk(parent: Parent, scope: Scope, listName: string | null, itemRoot = false, top = false): void {
    const children = "content" in parent && parent.nodeName === "template" ? parent.content.childNodes : parent.childNodes;
    for (const n of children) {
      if (n.nodeName === "#text") {
        const p = (n as { parentNode?: Node | null }).parentNode;
        if (!(p && isEl(p) && isRaw(p))) holesIn((n as { value: string }).value, scope, listName, n);
        continue;
      }
      if (!isEl(n)) continue;
      const tag = n.tagName;
      const isCustom = tag.includes("-") && n.namespaceURI === HTML_NS;
      if (isCustom) a.customTags.add(tag);
      for (const at of n.attrs) {
        if (at.value.includes("{{")) {
          report(
            "attr-hole",
            "error",
            `Attribute ${at.name} contains {{ }}, which is only supported in text. Fix: add data-ref to the element and set the attribute from TypeScript (e.g. this.refs.x.setAttribute(...)).`,
            n,
          );
        }
      }
      if (tag === "script" && n.namespaceURI === HTML_NS) {
        report("forbidden-tag", "error", "<script> cannot be in a template. Fix: put the code in TypeScript and attach it with a data-on-* handler or a component.", n);
      }
      for (const at of n.attrs) {
        if (/^on/i.test(at.name) || at.name === "srcdoc") {
          report("forbidden-attribute", "error", `${at.name} cannot be in a template: it runs code or is blocked when Trusted Types is enforced. Fix: ${at.name === "srcdoc" ? "load the document with a component that sets it from TypeScript" : `use data-on-${at.name.slice(2).toLowerCase()}="method" and a public method`}.`, n);
        } else if (URL_ATTRS.test(at.name) && /^\s*javascript:/i.test(at.value)) {
          report("unsafe-url", "error", `${at.name}="${at.value}" starts with javascript:, which runs code. Fix: use a data-on-click handler, or a real URL.`, n);
        }
      }
      const handlers: string[] = [];
      for (const at of n.attrs) {
        if (!at.name.startsWith("data-on-")) continue;
        const type = at.name.slice("data-on-".length);
        const method = at.value.trim();
        if (!/^[a-z][\w-]*$/.test(type)) {
          report("invalid-event-name", "error", `${at.name} has an invalid event name. Fix: use a lowercase event name such as data-on-click or data-on-field-input (HTML attributes are case-insensitive).`, n);
        } else if (!IDENT.test(method)) {
          report(
            "invalid-handler",
            "error",
            `${at.name}="${at.value}" must be a plain method name; expressions, calls and paths are not supported. Fix: write data-on-${type}="methodName" and read extra data in the method from hit.el.dataset (data-* attributes).`,
            n,
          );
        } else if (RESERVED_NAMES.has(method)) {
          report(
            "reserved-handler",
            "error",
            `${at.name}="${method}" would override a built-in DOM method or a ts-dom member of the same name on the element. Fix: rename the method (for example remove -> removeItem, click -> onClick).`,
            n,
          );
        } else {
          a.events.add(method);
          mark(`event:${method}`, n);
          a.eventSites.push({ event: type, method, tag, attrs: n.attrs.map((x) => x.name) });
          handlers.push(type);
        }
      }
      if (isCustom) {
        a.customUses.push({ tag, attrs: n.attrs.map((x) => x.name), events: handlers, ...locOf(n) });
      }
      const ref = attr(n, "data-ref");
      if (ref !== undefined) {
        if (!ref.trim()) report("empty-ref", "error", 'data-ref is empty. Fix: give it a name, e.g. data-ref="title".', n);
        else if (scope.refs.has(ref)) {
          report("duplicate-ref", "error", `data-ref="${ref}" is used more than once in the same scope, so this.refs.${ref} would be ambiguous. Fix: use a different name (names inside different data-each templates may repeat).`, n);
        } else {
          scope.refs.set(ref, n.namespaceURI === HTML_NS ? `El<${JSON.stringify(tag)}>` : "SVGElement");
          mark(listName ? `ref:${listName}/${ref}` : `ref:${ref}`, n);
        }
      }
      const cond = attr(n, "data-if");
      if (cond !== undefined) {
        if (!cond.trim()) report("empty-if", "error", 'data-if is empty. Fix: give it a name, e.g. data-if="open".', n);
        else if (itemRoot) {
          report(
            "if-on-item-root",
            "error",
            `data-if="${cond}" is on the root element of data-each="${listName}". Removing the root would break the list ordering. Fix: wrap the content in one more element and put data-if on the inner element.`,
            n,
          );
        } else {
          scope.ifs.add(cond);
          mark(listName ? `if:${listName}/${cond}` : `if:${cond}`, n);
        }
      }
      if (tag === "slot" && listName) {
        report(
          "slot-in-list",
          "error",
          `<slot> is inside data-each="${listName}". The list repeats the slot but the user provides its content only once. Fix: move the slot outside the list, or fill each item from TypeScript in the update callback.`,
          n,
        );
      }
      if (tag === "style" && n.namespaceURI === HTML_NS && !top) {
        report("style-not-top-level", "error", "<style> must be a top-level element of the template (not nested in another element, <template data-each> or a data-if element). Fix: move it to the first level of the HTML file.", n);
      }
      if (tag === "slot") {
        const name = attr(n, "name") ?? "";
        if (a.slots.has(name)) report("duplicate-slot", "warning", `slot "${name}" appears more than once; only one of them can receive the content. Fix: give each slot a distinct name.`, n);
        a.slots.add(name);
      }
      const each = attr(n, "data-each");
      if (each !== undefined && tag !== "template") {
        report("each-not-template", "error", `data-each is on <${tag}> but it only works on <template>. Fix: write <template data-each="${each || "items"}"><li>...</li></template>.`, n);
      }
      if (tag === "template" && each !== undefined) {
        if (!each.trim()) report("empty-each", "error", 'data-each is empty. Fix: give it a name, e.g. <template data-each="items">.', n);
        else if (listName) {
          report("nested-each", "error", `data-each="${each}" is nested inside data-each="${listName}". Lists cannot be nested; an inner list belongs to its own template. Fix: move the inner list and its item markup into a separate .html file (a child component with its own data-each) and use that component's tag inside the outer item.`, n);
        } else if (a.lists.has(each)) {
          report("duplicate-each", "error", `data-each="${each}" is used more than once, so this.lists.${each} would be ambiguous. Fix: use a different name.`, n);
        } else {
          const items = (n as Template).content.childNodes.filter((c: Node) => isEl(c) || (c.nodeName === "#text" && (c as { value: string }).value.trim()));
          if (items.length !== 1 || !isEl(items[0] as Node)) {
            report("each-root-count", "error", `data-each="${each}" must contain exactly one root element (found ${items.length} root nodes). Fix: wrap the item content in a single element such as <li>.`, n);
          }
          const key = attr(n, "data-key");
          const prop = attr(n, "data-prop");
          if ((key === undefined) !== (prop === undefined)) {
            report("each-binding-incomplete", "error", `data-each="${each}" has ${key === undefined ? "data-prop" : "data-key"} but not ${key === undefined ? "data-key" : "data-prop"}. Fix: write both, e.g. <template data-each="${each}" data-key="id" data-prop="item">, or neither to fill the items yourself with replace().`, n);
          } else if (key !== undefined && prop !== undefined) {
            if (!IDENT.test(key.trim()) || !IDENT.test(prop.trim())) {
              report("invalid-each-binding", "error", `data-key="${key}" and data-prop="${prop}" must each be a single identifier: the item field that identifies it, and the property of the item element that receives the item. Fix: write data-key="id" data-prop="item".`, n);
            } else if (items.length === 1 && isEl(items[0] as Node)) {
              const root = items[0] as Element;
              if (root.namespaceURI === HTML_NS && isCustomElementName(root.tagName)) {
                a.boundLists.set(each, { tag: root.tagName, prop: prop.trim(), key: key.trim() });
              } else {
                report("each-binding-root", "error", `data-each="${each}" has data-key and data-prop, so each item is one component that receives the item as a property, but its root is <${root.tagName}>. Fix: make the item a custom element such as <${each}-row></${each}-row> and put the item's markup in that component's own .html.`, n);
              }
            }
          }
          const s = newScope();
          a.lists.set(each, s);
          mark(`each:${each}`, n);
          walk(n, s, each, true, false);
        }
        continue;
      }
      walk(n, scope, listName, false, false);
    }
  }
  walk(root, a.scope, null, false, true);
  return a;
}

const q = (s: string) => JSON.stringify(s);
const union = (xs: Iterable<string>) => {
  const arr = [...new Set(xs)];
  return arr.length ? arr.map(q).join(" | ") : "never";
};
const EMPTY_OBJECT = "Record<never, never>";
const members = (entries: readonly string[]) => (entries.length ? `{ ${entries.join("; ")} }` : EMPTY_OBJECT);
const obj = (m: Map<string, string>) => members([...m].map(([n, t]) => `${q(n)}: ${t}`));

/** The type of the template's only top-level element (a `<style>` does not count); `never` when there is not exactly one, or other text sits beside it. */
function rootElementType(html: string): string {
  const tops = parseFragment(html).childNodes.filter((n) => n.nodeName !== "#comment" && !(n.nodeName === "#text" && !(n as { value: string }).value.trim()));
  const elements = tops.filter((n): n is Element => isEl(n) && !(n.tagName === "style" && n.namespaceURI === HTML_NS) && !(n.tagName === "template" && n.attrs.some((a) => a.name === "data-each")));
  const others = tops.filter((n) => !(isEl(n) && (n.tagName === "style" || n.tagName === "template")));
  if (elements.length !== 1 || others.length !== 1) return "never";
  const el = elements[0] as Element;
  return el.namespaceURI === HTML_NS ? `El<${JSON.stringify(el.tagName)}>` : "SVGElement";
}

/** The whitespace mode an existing generated module was written with; "preserve" when there is none. */
function recordedWhitespace(out: string): "preserve" | "collapse" {
  try {
    return readFileSync(out, "utf8").split("\n", 3).includes(COLLAPSE_MARK) ? "collapse" : "preserve";
  } catch {
    return "preserve";
  }
}

/** What `ts-dom gen` writes; both fields are optional. */
export interface GenerateOptions {
  /** Module name the generated files import the runtime from. Default: "@nativele/ts-dom" */
  runtime?: string;
  /**
   * How text nodes keep their whitespace. "preserve" keeps it as written; without the option, the mode an existing generated module was written with is kept ("preserve" for a new one).
   * "collapse" keeps only the whitespace the browser renders: every run of whitespace becomes one space, and it is dropped next to a block-level element (`<div>`, `<p>`, `<li>`, table parts, ...) and at the start and end of a block or inline-block element's content, so a formatter's line breaks and indentation change nothing; `<pre>`, `<textarea>`, `<style>` and `<script>` are left alone.
   */
  whitespace?: "preserve" | "collapse";
  /** Glob patterns, relative to the scanned directory, of the `.html` files to generate. Default: every template. */
  include?: readonly string[];
  /** Glob patterns, relative to the scanned directory, of `.html` files to leave out (applied after `include`). `*` matches within a folder, `**` across folders. */
  exclude?: readonly string[];
}

function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      re += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** Whether `file` (under `dir`) is one of the templates `options.include` / `options.exclude` select. */
export function isSelected(dir: string, file: string, options: GenerateOptions = {}): boolean {
  const rel = relative(dir, file).split(sep).join("/");
  const hit = (globs: readonly string[]) => globs.some((g) => globToRegExp(g).test(rel));
  return (!options.include?.length || hit(options.include)) && !(options.exclude?.length && hit(options.exclude));
}

const KEEPS_WHITESPACE = new Set(["pre", "textarea", "style", "script"]);
const SVG_NS = "http://www.w3.org/2000/svg";
// The browser's default display of each element, as formatters (Prettier, oxfmt) assume it: whitespace next to a block-level element, or at the start or end of a block or inline-block element's content, is not rendered, so a formatter adds and removes it there freely.
const BLOCK_LEVEL = new Set(["address", "article", "aside", "blockquote", "body", "caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "html", "legend", "li", "listing", "main", "menu", "nav", "ol", "optgroup", "option", "p", "param", "plaintext", "pre", "script", "search", "section", "source", "style", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "track", "ul", "xmp"]);
const INLINE_BLOCK = new Set(["audio", "button", "input", "marquee", "meter", "object", "progress", "select", "video"]);
const HTML_WHITESPACE = /[ \t\n\f\r]+/g;

// In SVG, only the content of a <text> element is rendered text, and it is laid out inline: <tspan>, <textPath> and <a> inside it are inline elements.
const inSvgText = (n: Element): boolean => {
  for (let p = n.parentNode; p && isEl(p) && p.namespaceURI === SVG_NS; p = p.parentNode) if (p.tagName === "text") return true;
  return false;
};
const isBlockLevel = (n: Node | undefined): boolean => !!n && isEl(n) && (n.namespaceURI === SVG_NS ? n.tagName !== "svg" && !inSvgText(n) : n.namespaceURI === HTML_NS && BLOCK_LEVEL.has(n.tagName));
const trimsEdges = (n: Element): boolean => isBlockLevel(n) || (n.namespaceURI === SVG_NS ? n.tagName === "svg" : n.namespaceURI === HTML_NS && INLINE_BLOCK.has(n.tagName));

/** In `collapse`, `edges` says whether whitespace at the start and end of `parent`'s content is not rendered. */
export function toNodes(parent: Parent, collapse = false, edges = true): unknown[] {
  const children = ("content" in parent && parent.nodeName === "template" ? parent.content.childNodes : parent.childNodes).filter((n) => n.nodeName === "#text" || n.nodeName === "#comment" || isEl(n));
  const out: unknown[] = [];
  children.forEach((n, i) => {
    if (n.nodeName === "#text") {
      let value = (n as { value: string }).value;
      if (collapse) {
        const prev = children.slice(0, i).reverse().find((c) => c.nodeName !== "#comment");
        const next = children.slice(i + 1).find((c) => c.nodeName !== "#comment");
        value = value.replace(HTML_WHITESPACE, " ");
        if (prev ? isBlockLevel(prev) : edges) value = value.replace(/^ /, "");
        if (next ? isBlockLevel(next) : edges) value = value.replace(/ $/, "");
      }
      if (value) out.push(value);
    } else if (n.nodeName === "#comment") out.push(["#comment", (n as { data: string }).data]);
    else if (isEl(n)) {
      const attrs = Object.fromEntries(n.attrs.map((a) => [a.name, a.value]));
      const inner = toNodes(n, collapse && !KEEPS_WHITESPACE.has(n.tagName), n.tagName === "template" || trimsEdges(n));
      out.push(n.namespaceURI === HTML_NS ? [n.tagName, attrs, inner] : [n.tagName, attrs, inner, n.namespaceURI]);
    }
  });
  return out;
}

/**
 * Generate `x.html.ts`: a real TypeScript module that contains both the template markup (as DOM-building data, never parsed from a string at runtime) and its types.
 * tsc (or any bundler) can compile it directly: no plugin and no allowArbitraryExtensions needed.
 * Consumers import it as `import tpl from "./x.html.js"` (TypeScript maps it to x.html.ts).
 */
export function generateModule(html: string, options: GenerateOptions = {}, imports: readonly string[] = [], defs: readonly DefineDef[] = []): string {
  const runtime = options.runtime ?? "@nativele/ts-dom";
  const a = analyze(html);
  const lists = [...a.lists]
    .map(([n, s]) => {
      const bound = a.boundLists.get(n);
      const def = bound && defs.find((d) => d.tag === bound.tag);
      const source = !def ? "external" : def.exported ? "local" : "unexported";
      const item = bound ? `; item: { tag: ${q(bound.tag)}; prop: ${q(bound.prop)}; key: ${q(bound.key)}; source: ${q(source)} }` : "";
      return `${q(n)}: { refs: ${obj(s.refs)}; text: ${union(s.text)}; ifs: ${union(s.ifs)}${item} }`;
    });
  const type = `{
  refs: ${obj(a.scope.refs)};
  lists: ${members(lists)};
  ifs: ${union(a.scope.ifs)};
  slots: ${union(a.slots)};
  rootElement: ${rootElementType(html)};
  text: ${union(a.scope.text)};
  events: ${union(a.events)};
}`;
  const needsEl = type.includes("El<");
  // Child components used by the template: import the modules that define them
  // (otherwise, referencing them only through `import type` would leave the elements unregistered)
  const side = imports.map((i) => `import ${q(i)};\n`).join("");
  return `// Generated by ts-dom. Do not edit.${options.whitespace === "collapse" ? `\n${COLLAPSE_MARK}` : ""}
${side}import { template } from ${q(runtime)};
${needsEl ? `import type { El } from ${q(runtime)};\n` : ""}export default template<${type}>(${JSON.stringify(toNodes(parseFragment(html), options.whitespace === "collapse"))});
`;
}

/** x.html → x.html.ts */
export function modulePathFor(htmlPath: string): string {
  return `${htmlPath}.ts`;
}

/** A full page (starting with a doctype or <html>) is a page entry, not a template. */
export function isFullPage(html: string): boolean {
  return /^\s*(<!--[\s\S]*?-->\s*)*<(!doctype|html)\b/i.test(html);
}

/** `file:line:col severity [rule] message` — one line per diagnostic. */
export function formatDiagnostics(file: string, ds: Diagnostic[]): string {
  return ds.map((d) => `${file}:${d.line}:${d.col} ${d.severity} [${d.rule}] ${d.message}`).join("\n");
}

export class CodegenError extends Error {}

/** What `generateFile` would write for a template, without writing it; throws CodegenError when the template has error diagnostics. */
export function renderFile(htmlPath: string, options: GenerateOptions = {}, defs?: string | readonly DefineDef[]): { out: string; next: string } {
  const html = readFileSync(htmlPath, "utf8");
  if (options.whitespace === undefined) options = { ...options, whitespace: recordedWhitespace(modulePathFor(htmlPath)) };
  const analysis = analyze(html);
  const errors = analysis.diagnostics.filter((d) => d.severity === "error");
  if (errors.length) throw new CodegenError(formatDiagnostics(htmlPath, errors));
  const known = typeof defs === "string" ? scanDefines(defs) : (defs ?? []);
  const here = dirname(htmlPath);
  const imports = [...new Set(known.filter((d) => analysis.customTags.has(d.tag)).map((d) => relImport(here, d.file)))].sort();
  return { out: modulePathFor(htmlPath), next: generateModule(html, options, imports, known) };
}

/**
 * Generate a single `x.html.ts`; throws CodegenError (and writes nothing) when there are error diagnostics.
 * `defs` is either a directory to scan or a precomputed scan result: custom elements used by the template
 * are imported automatically from the modules that define them.
 */
export function generateFile(htmlPath: string, options: GenerateOptions = {}, defs?: string | readonly DefineDef[]): string {
  const { out, next } = renderFile(htmlPath, options, defs);
  let prev = "";
  try {
    prev = readFileSync(out, "utf8");
  } catch {
    /* first generation */
  }
  if (prev !== next) writeFileSync(out, next);
  return out;
}

export function listHtml(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listHtml(full));
    else if (name.endsWith(".html") && !isFullPage(readFileSync(full, "utf8"))) out.push(full);
  }
  return out;
}

const TAGS_FILE = "ts-dom-tags.ts";
const TAGS_HEADER = "// Generated by ts-dom. Do not edit.";
// Recorded in a module generated with whitespace "collapse", so a later run without the option keeps the project's choice.
const COLLAPSE_MARK = "// whitespace: collapse";

export interface TagDef {
  tag: string;
  className: string;
  /** Import path relative to the scanned directory, starting with ./ and ending in .js */
  from: string;
  isDefault: boolean;
}

export function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTs(full));
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts") && !name.endsWith(".html.ts") && name !== TAGS_FILE) out.push(full);
  }
  return out;
}

export interface DefineDef {
  tag: string;
  className: string;
  /** The .ts file containing the define() call (absolute, or relative to the working directory) */
  file: string;
  /** The class is exported, so a type can be generated for it */
  exported: boolean;
  isDefault: boolean;
  /** Position of the define() call */
  line?: number;
  col?: number;
}

/** Ranges [start, end) of the string literals, template literals and comments of a piece of TypeScript source. */
function nonCodeRanges(code: string): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < code.length; i++) {
    const c = code[i] as string;
    if (c === '"' || c === "'" || c === "`") {
      const start = i;
      for (i++; i < code.length && code[i] !== c; i++) if (code[i] === "\\") i++;
      out.push([start, i + 1]);
    } else if (c === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      out.push([i, end < 0 ? code.length : end]);
      i = end < 0 ? code.length : end;
    } else if (c === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      out.push([i, end < 0 ? code.length : end + 2]);
      i = end < 0 ? code.length : end + 1;
    }
  }
  return out;
}

/**
 * Scan one or more directories for every `define("my-tag", MyClass)` call; a file under two of them is read once.
 * Calls that only appear inside a string or a comment (for example sample code in a test or in documentation) are ignored.
 */
export function scanDefines(dirs: string | readonly string[]): DefineDef[] {
  const defs: DefineDef[] = [];
  const re = /\bdefine\(\s*(["'])([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\1\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
  const files = new Map<string, string>();
  for (const dir of typeof dirs === "string" ? [dirs] : dirs) for (const f of listTs(dir)) if (!files.has(resolve(f))) files.set(resolve(f), f);
  for (const file of files.values()) {
    const code = readFileSync(file, "utf8");
    const skip = nonCodeRanges(code);
    const inCode = (pos: number) => !skip.some(([a, b]) => pos >= a && pos < b);
    const has = (re: RegExp) => [...code.matchAll(re)].some((m) => inCode(m.index));
    for (const m of code.matchAll(re)) {
      if (!inCode(m.index)) continue;
      const [, , tag, className] = m as unknown as [string, string, string, string];
      const named = has(new RegExp(`export\\s+class\\s+${className}\\b`, "g")) || has(new RegExp(`export\\s*\\{[^}]*\\b${className}\\b[^}]*\\}`, "g"));
      const isDefault = has(new RegExp(`export\\s+default\\s+class\\s+${className}\\b`, "g"));
      const before = code.slice(0, m.index);
      defs.push({ tag, className, file, exported: named || isDefault, isDefault, line: before.split("\n").length, col: m.index - before.lastIndexOf("\n") });
    }
  }
  return defs.sort((a, b) => a.tag.localeCompare(b.tag));
}

const relImport = (fromDir: string, file: string) => {
  const r = relative(fromDir, file).split(sep).join("/").replace(/\.ts$/, ".js");
  return r.startsWith(".") ? r : `./${r}`;
};

/**
 * A tag that two of the directories define with different classes, reported at its second define() call.
 * A tag defined twice within one directory is reported by `generateTags` instead.
 */
export function crossDirDuplicates(dirs: readonly string[]): (Diagnostic & { file: string })[] {
  const byTag = new Map<string, DefineDef[]>();
  for (const d of scanDefines(dirs)) byTag.set(d.tag, [...(byTag.get(d.tag) ?? []), d]);
  const inside = (dir: string, file: string) => resolve(file).startsWith(resolve(dir) + sep);
  const out: (Diagnostic & { file: string })[] = [];
  for (const [tag, defs] of byTag) {
    const [first, second] = defs as [DefineDef, DefineDef];
    if (defs.length < 2 || dirs.some((dir) => defs.every((d) => inside(dir, d.file)))) continue;
    const at = (d: DefineDef) => `${relative(process.cwd(), d.file)}:${d.line ?? 1}`;
    out.push({ file: second.file, line: second.line ?? 1, col: second.col ?? 1, severity: "error", rule: "duplicate-define", message: `The tag <${tag}> is defined more than once in the scanned folders (${at(first)} and ${at(second)}), so at runtime only the class whose define() runs first is registered, and the other define() is skipped without an error. Fix: each custom element name can be defined only once; rename one of them.` });
  }
  return out;
}

/** Scan `define("my-tag", MyClass)` calls and return the components a type can be generated for (the class must be exported). */
export function scanTags(dir: string): TagDef[] {
  return scanDefines(dir)
    .filter((d) => d.exported)
    .map((d) => ({ tag: d.tag, className: d.className, from: relImport(dir, d.file), isDefault: d.isDefault }));
}

/**
 * Generate `ts-dom-tags.ts`: register every `define("tag", Class)` component in HTMLElementTagNameMap
 * so that `refs.x` for `<tag data-ref="x">` in a template is fully typed (props, methods and emitted events).
 */
export function generateTags(dir: string): string | null {
  const { out, next } = renderTags(dir);
  if (next === null) {
    if (existsSync(out) && readFileSync(out, "utf8").startsWith(TAGS_HEADER)) unlinkSync(out);
    return null;
  }
  let prev = "";
  try {
    prev = readFileSync(out, "utf8");
  } catch {
    /* first generation */
  }
  if (prev !== next) writeFileSync(out, next);
  return out;
}

/** What `generateTags` would write, without writing it; `next` is null when the directory defines no exported component. */
export function renderTags(dir: string): { out: string; next: string | null } {
  const defs = scanTags(dir);
  const out = join(dir, TAGS_FILE);
  const seen = new Map<string, TagDef>();
  for (const d of defs) {
    const prev = seen.get(d.tag);
    if (prev && (prev.from !== d.from || prev.className !== d.className)) {
      throw new CodegenError(`${dir}: [duplicate-define] the tag <${d.tag}> is defined more than once (${prev.from} and ${d.from}), so at runtime only the class whose define() runs first is registered, and the other define() is skipped without an error. Fix: each custom element name can be defined only once; rename one of them.`);
    }
    seen.set(d.tag, d);
  }
  if (!defs.length) return { out, next: null };
  const alias = (d: TagDef) => `Tag${[...seen.keys()].indexOf(d.tag)}`;
  const imports = [...seen.values()].map((d) => `import type { ${d.isDefault ? "default" : d.className} as ${alias(d)} } from ${JSON.stringify(d.from)};`);
  const entries = [...seen.values()].map((d) => `    ${JSON.stringify(d.tag)}: ${alias(d)};`);
  return { out, next: `${TAGS_HEADER}\n${imports.join("\n")}\n\ndeclare global {\n  interface HTMLElementTagNameMap {\n${entries.join("\n")}\n  }\n}\n` };
}

/** A generated file that does not match what `ts-dom gen` would write now. */
export interface StaleFile {
  file: string;
  /** missing: not generated yet; outdated: its template or a define() changed since; orphan: its template was deleted, or a ts-dom-tags.ts sits in a folder that is not scanned */
  reason: "missing" | "outdated" | "orphan";
}

/**
 * Everything `generateAll` would write for a directory, in memory: generated path to content, or null for a file that should not exist.
 * Templates with error diagnostics are left out and their messages returned in `errors`.
 * `scanned` are all the directories of the run: a ts-dom-tags.ts in a subfolder is an orphan unless that subfolder is one of them.
 */
export function planGenerated(dir: string, options: GenerateOptions = {}, defs: readonly DefineDef[] = scanDefines(dir), scanned: readonly string[] = [dir]): { files: Map<string, string | null>; errors: string[] } {
  const files = new Map<string, string | null>();
  const errors: string[] = [];
  for (const f of listHtml(dir)) {
    if (!isSelected(dir, f, options)) continue;
    try {
      const { out, next } = renderFile(f, options, defs);
      files.set(out, next);
    } catch (e) {
      if (e instanceof CodegenError) errors.push(e.message);
      else throw e;
    }
  }
  try {
    const tags = renderTags(dir);
    files.set(tags.out, tags.next);
  } catch (e) {
    if (e instanceof CodegenError) errors.push(e.message);
    else throw e;
  }
  for (const f of listGenerated(dir, scanned)) if (!files.has(f) && !existsSync(f.slice(0, -3))) files.set(f, null);
  return { files, errors };
}

/** Generated files under `dir` that differ from what `ts-dom gen` would write now. */
export function staleGenerated(dir: string, options: GenerateOptions = {}, defs?: readonly DefineDef[], scanned?: readonly string[]): StaleFile[] {
  return checkGenerated(dir, options, defs, scanned).stale;
}

/** `staleGenerated`, plus the errors that would make `ts-dom gen` fail (template diagnostics, a tag defined twice). */
export function checkGenerated(dir: string, options: GenerateOptions = {}, defs?: readonly DefineDef[], scanned?: readonly string[]): { stale: StaleFile[]; errors: string[] } {
  const plan = planGenerated(dir, options, defs, scanned);
  const out: StaleFile[] = [];
  for (const [file, next] of plan.files) {
    const prev = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (next === null) {
      if (prev !== null && prev.startsWith(TAGS_HEADER)) out.push({ file, reason: file === join(dir, TAGS_FILE) ? "outdated" : "orphan" });
    } else if (prev === null) out.push({ file, reason: "missing" });
    else if (prev !== next) out.push({ file, reason: "outdated" });
  }
  return { stale: out.sort((a, b) => a.file.localeCompare(b.file)), errors: plan.errors };
}

function listGenerated(dir: string, scanned: readonly string[], top = true): string[] {
  const out: string[] = [];
  const ownTags = top || scanned.some((d) => resolve(d) === resolve(dir));
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listGenerated(full, scanned, false));
    else if ((name.endsWith(".html.ts") || (name === TAGS_FILE && !ownTags)) && readFileSync(full, "utf8").startsWith(TAGS_HEADER)) out.push(full);
  }
  return out;
}

/**
 * Generate every `x.html.ts` (and the tag map) under a directory; collects all errors and throws them together.
 * `defs` are the define() calls templates import child components from (default: those under `dir`).
 */
export function generateAll(dir: string, options: GenerateOptions = {}, defs: readonly DefineDef[] = scanDefines(dir), scanned: readonly string[] = [dir]): string[] {
  const written: string[] = [];
  const errors: string[] = [];
  for (const f of listHtml(dir)) {
    if (!isSelected(dir, f, options)) continue;
    try {
      written.push(generateFile(f, options, defs));
    } catch (e) {
      if (e instanceof CodegenError) errors.push(e.message);
      else throw e;
    }
  }
  try {
    const tags = generateTags(dir);
    if (tags) written.push(tags);
  } catch (e) {
    if (e instanceof CodegenError) errors.push(e.message);
    else throw e;
  }
  for (const f of listGenerated(dir, scanned)) if (!existsSync(f.slice(0, -3))) unlinkSync(f);
  if (errors.length) throw new CodegenError(errors.join("\n"));
  return written;
}

/** `generateAll` for every directory, with the define() calls of all of them: a template imports a child component defined in another directory. */
export function generateDirs(dirs: readonly string[], options: GenerateOptions = {}): string[] {
  const defs = scanDefines(dirs);
  const written: string[] = [];
  const errors: string[] = [];
  for (const dir of dirs) {
    try {
      written.push(...generateAll(dir, options, defs, dirs));
    } catch (e) {
      if (e instanceof CodegenError) errors.push(e.message);
      else throw e;
    }
  }
  for (const d of crossDirDuplicates(dirs)) errors.push(formatDiagnostics(d.file, [d]));
  if (errors.length) throw new CodegenError(errors.join("\n"));
  return written;
}

/** Watch .html (and define() calls in .ts) under the directories and regenerate; returns a stop function. Errors go to onError and never stop the watcher. */
export function watchAll(dirs: string[], opts: GenerateOptions & { onGenerate?: (file: string) => void; onError?: (message: string) => void } = {}): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const watchers = dirs.map((dir) =>
    watch(dir, { recursive: true }, (_event, name) => {
      if (!name || name.includes("node_modules")) return;
      if (name.endsWith(".ts") && !name.endsWith(".html.ts") && !name.endsWith(".d.ts") && !name.endsWith(TAGS_FILE)) {
        clearTimeout(timers.get("tags"));
        timers.set("tags", setTimeout(() => {
          try {
            for (const f of generateDirs(dirs, opts)) opts.onGenerate?.(f);
          } catch (e) {
            if (e instanceof CodegenError) opts.onError?.(e.message);
            else throw e;
          }
        }, 100));
        return;
      }
      if (!name.endsWith(".html")) return;
      const file = join(dir, name);
      clearTimeout(timers.get(file));
      timers.set(
        file,
        setTimeout(() => {
          try {
            if (!existsSync(file) || !isSelected(dir, file, opts) || isFullPage(readFileSync(file, "utf8"))) return;
            opts.onGenerate?.(generateFile(file, opts, scanDefines(dirs)));
          } catch (e) {
            if (e instanceof CodegenError) opts.onError?.(e.message);
            else throw e;
          }
        }, 50),
      );
    }),
  );
  return () => {
    for (const w of watchers) w.close();
    for (const t of timers.values()) clearTimeout(t);
  };
}
