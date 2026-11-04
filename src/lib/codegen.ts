import { existsSync, readdirSync, readFileSync, statSync, unlinkSync, watch, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
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
  "each-root-count": "a data-each template needs exactly one root element",
  "forbidden-tag": "<script> cannot be in a template (it would run code)",
  "forbidden-attribute": "on* event attributes and srcdoc cannot be in a template (they run code or are blocked by Trusted Types)",
  "unsafe-url": "href / src / action / formaction cannot start with javascript:",
  "duplicate-define": "a custom element tag can be defined only once per scanned directory",
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
          `{{ ${inner} }} is not a valid hole: a hole must be a single identifier, paths and expressions are not supported. Fix: compute the value in TypeScript (state, derive or this.text) and use a named hole such as {{ name }}.`,
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
          report("nested-each", "error", `data-each="${each}" is nested inside data-each="${listName}". Lists cannot be nested. Fix: make the inner list its own component, or render it from TypeScript.`, n);
        } else if (a.lists.has(each)) {
          report("duplicate-each", "error", `data-each="${each}" is used more than once, so this.lists.${each} would be ambiguous. Fix: use a different name.`, n);
        } else {
          const items = (n as Template).content.childNodes.filter((c: Node) => isEl(c) || (c.nodeName === "#text" && (c as { value: string }).value.trim()));
          if (items.length !== 1 || !isEl(items[0] as Node)) {
            report("each-root-count", "error", `data-each="${each}" must contain exactly one root element (found ${items.length} root nodes). Fix: wrap the item content in a single element such as <li>.`, n);
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
const obj = (m: Map<string, string>) => `{ ${[...m].map(([n, t]) => `${q(n)}: ${t}`).join("; ")} }`;

function toNodes(parent: Parent): unknown[] {
  const children = "content" in parent && parent.nodeName === "template" ? parent.content.childNodes : parent.childNodes;
  const out: unknown[] = [];
  for (const n of children) {
    if (n.nodeName === "#text") out.push((n as { value: string }).value);
    else if (n.nodeName === "#comment") out.push(["#comment", (n as { data: string }).data]);
    else if (isEl(n)) {
      const attrs = Object.fromEntries(n.attrs.map((a) => [a.name, a.value]));
      out.push(n.namespaceURI === HTML_NS ? [n.tagName, attrs, toNodes(n)] : [n.tagName, attrs, toNodes(n), n.namespaceURI]);
    }
  }
  return out;
}

/**
 * Generate `x.html.ts`: a real TypeScript module that contains both the template markup (as DOM-building data, never parsed from a string at runtime) and its types.
 * tsc (or any bundler) can compile it directly: no plugin and no allowArbitraryExtensions needed.
 * Consumers import it as `import tpl from "./x.html.js"` (TypeScript maps it to x.html.ts).
 */
export function generateModule(html: string, runtime = "ts-dom", imports: readonly string[] = []): string {
  const a = analyze(html);
  const lists = [...a.lists]
    .map(([n, s]) => `${q(n)}: { refs: ${obj(s.refs)}; text: ${union(s.text)}; ifs: ${union(s.ifs)} }`)
    .join("; ");
  const type = `{
  refs: ${obj(a.scope.refs)};
  lists: { ${lists} };
  ifs: ${union(a.scope.ifs)};
  slots: ${union(a.slots)};
  text: ${union(a.scope.text)};
  events: ${union(a.events)};
}`;
  const needsEl = type.includes("El<");
  // Child components used by the template: import the modules that define them
  // (otherwise, referencing them only through `import type` would leave the elements unregistered)
  const side = imports.map((i) => `import ${q(i)};\n`).join("");
  return `// Generated by ts-dom. Do not edit.
${side}import { template } from ${q(runtime)};
${needsEl ? `import type { El } from ${q(runtime)};\n` : ""}export default template<${type}>(${JSON.stringify(toNodes(parseFragment(html)))});
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

/**
 * Generate a single `x.html.ts`; throws CodegenError (and writes nothing) when there are error diagnostics.
 * `defs` is either a directory to scan or a precomputed scan result: custom elements used by the template
 * are imported automatically from the modules that define them.
 */
export function generateFile(htmlPath: string, runtime?: string, defs?: string | readonly DefineDef[]): string {
  const html = readFileSync(htmlPath, "utf8");
  const analysis = analyze(html);
  const errors = analysis.diagnostics.filter((d) => d.severity === "error");
  if (errors.length) throw new CodegenError(formatDiagnostics(htmlPath, errors));
  const known = typeof defs === "string" ? scanDefines(defs) : (defs ?? []);
  const here = dirname(htmlPath);
  const imports = [...new Set(known.filter((d) => analysis.customTags.has(d.tag)).map((d) => relImport(here, d.file)))].sort();
  const out = modulePathFor(htmlPath);
  const next = generateModule(html, runtime, imports);
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
    if (name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listHtml(full));
    else if (name.endsWith(".html") && !isFullPage(readFileSync(full, "utf8"))) out.push(full);
  }
  return out;
}

const TAGS_FILE = "ts-dom-tags.ts";
const TAGS_HEADER = "// Generated by ts-dom. Do not edit.";

export interface TagDef {
  tag: string;
  className: string;
  /** Import path relative to the scanned directory, starting with ./ and ending in .js */
  from: string;
  isDefault: boolean;
}

function listTs(dir: string): string[] {
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
 * Scan a directory for every `define("my-tag", MyClass)` call.
 * Calls that only appear inside a string or a comment (for example sample code in a test or in documentation) are ignored.
 */
export function scanDefines(dir: string): DefineDef[] {
  const defs: DefineDef[] = [];
  const re = /\bdefine\(\s*(["'])([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\1\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
  for (const file of listTs(dir)) {
    const code = readFileSync(file, "utf8");
    const skip = nonCodeRanges(code);
    const inCode = (pos: number) => !skip.some(([a, b]) => pos >= a && pos < b);
    const has = (re: RegExp) => [...code.matchAll(re)].some((m) => inCode(m.index));
    for (const m of code.matchAll(re)) {
      if (!inCode(m.index)) continue;
      const [, , tag, className] = m as unknown as [string, string, string, string];
      const named = has(new RegExp(`export\\s+class\\s+${className}\\b`, "g")) || has(new RegExp(`export\\s*\\{[^}]*\\b${className}\\b[^}]*\\}`, "g"));
      const isDefault = has(new RegExp(`export\\s+default\\s+class\\s+${className}\\b`, "g"));
      defs.push({ tag, className, file, exported: named || isDefault, isDefault });
    }
  }
  return defs.sort((a, b) => a.tag.localeCompare(b.tag));
}

const relImport = (fromDir: string, file: string) => {
  const r = relative(fromDir, file).split(sep).join("/").replace(/\.ts$/, ".js");
  return r.startsWith(".") ? r : `./${r}`;
};

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
  const defs = scanTags(dir);
  const out = join(dir, TAGS_FILE);
  const seen = new Map<string, TagDef>();
  for (const d of defs) {
    const prev = seen.get(d.tag);
    if (prev && (prev.from !== d.from || prev.className !== d.className)) {
      throw new CodegenError(`${dir}: [duplicate-define] the tag <${d.tag}> is defined more than once (${prev.from} and ${d.from}). Fix: each custom element name can be defined only once; rename one of them.`);
    }
    seen.set(d.tag, d);
  }
  if (!defs.length) {
    if (existsSync(out) && readFileSync(out, "utf8").startsWith(TAGS_HEADER)) unlinkSync(out);
    return null;
  }
  const alias = (d: TagDef) => `Tag${[...seen.keys()].indexOf(d.tag)}`;
  const imports = [...seen.values()].map((d) => `import type { ${d.isDefault ? "default" : d.className} as ${alias(d)} } from ${JSON.stringify(d.from)};`);
  const entries = [...seen.values()].map((d) => `    ${JSON.stringify(d.tag)}: ${alias(d)};`);
  const next = `${TAGS_HEADER}\n${imports.join("\n")}\n\ndeclare global {\n  interface HTMLElementTagNameMap {\n${entries.join("\n")}\n  }\n}\n\nexport {};\n`;
  let prev = "";
  try {
    prev = readFileSync(out, "utf8");
  } catch {
    /* first generation */
  }
  if (prev !== next) writeFileSync(out, next);
  return out;
}

/** Generate every `x.html.ts` (and the tag map) under a directory; collects all errors and throws them together. */
export function generateAll(dir: string, runtime?: string): string[] {
  const written: string[] = [];
  const errors: string[] = [];
  const defs = scanDefines(dir);
  for (const f of listHtml(dir)) {
    try {
      written.push(generateFile(f, runtime, defs));
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
  if (errors.length) throw new CodegenError(errors.join("\n"));
  return written;
}

/** Watch .html (and define() calls in .ts) under the directories and regenerate; returns a stop function. Errors go to onError and never stop the watcher. */
export function watchAll(dirs: string[], opts: { runtime?: string; onGenerate?: (file: string) => void; onError?: (message: string) => void } = {}): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const watchers = dirs.map((dir) =>
    watch(dir, { recursive: true }, (_event, name) => {
      if (!name || name.includes("node_modules")) return;
      if (name.endsWith(".ts") && !name.endsWith(".html.ts") && !name.endsWith(".d.ts") && !name.endsWith(TAGS_FILE)) {
        const key = `${dir}:tags`;
        clearTimeout(timers.get(key));
        timers.set(key, setTimeout(() => {
          try {
            // define("tag", Class) may have changed: regenerate the tag types and every template's child-component imports
            for (const f of generateAll(dir, opts.runtime)) opts.onGenerate?.(f);
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
            if (!existsSync(file) || isFullPage(readFileSync(file, "utf8"))) return;
            opts.onGenerate?.(generateFile(file, opts.runtime, dir));
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
