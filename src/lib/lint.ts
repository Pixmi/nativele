import { basename, dirname, join, relative, resolve } from "node:path";
import { parseFragment } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";
import { checkA11y } from "./a11y.ts";
import type { A11yChild, A11yChildren } from "./a11y.ts";
import { analyze, listHtml } from "./codegen.ts";
import type { Analysis, Diagnostic } from "./codegen.ts";
import { componentIndex, matchClose, Workspace } from "./components.ts";
import { ELEMENT_EVENT_NAMES } from "./events.ts";
import type { ComponentIndex } from "./components.ts";
import { manifestsAt } from "./manifest.ts";
import type { ManifestElement } from "./manifest.ts";
import { NOT_DEFINED, UNREAD, and, detailOf, unreadFixes } from "./unread.ts";
import type { Unread } from "./unread.ts";

export type { Diagnostic };

/** A diagnostic attached to the HTML file it refers to. */
export interface LintIssue extends Diagnostic {
  file: string;
}

const esc = (s: string) => s.replace(/[$]/g, "\\$&");

/** Marker that ownerCode() adds when it sees `Component(tpl, { state | props | derive })`. */
const STATEFUL_MARK = "/*ts-dom:stateful*/";

const EMIT_NAME = /this\.emit\(\s*["']([^"']*)["']/g;

const DATA_OPTION = /\b(?:state|props|derive)\b\s*[:,}]/;

export interface ComponentClass {
  /** Full text of the `Component(tpl, {...})` call, parentheses included. */
  call: string;
  /** Text of the class body, braces included. */
  body: string;
}

/**
 * The code that uses a template: the bodies of the component classes that pass it to Component(), marked when their options have state, props or derive.
 * A template no class uses is used by the modules that import it, so their whole text counts.
 */
function ownerCode(classes: readonly ComponentClass[], importers: readonly string[]): string {
  if (classes.length) return classes.map((c) => `${DATA_OPTION.test(c.call) ? `${STATEFUL_MARK}\n` : ""}${c.body}`).join("\n");
  return importers.map((code) => (/Component\s*\([^;]*?\b(?:state|props|derive)\b\s*[:,}]/s.test(code) ? `${STATEFUL_MARK}\n${code}` : code)).join("\n");
}

// ---------------------------------------------------------------------------
// unused-markup: things the HTML declares but the component class never uses
// ---------------------------------------------------------------------------

export const UNUSED_MARKUP_RULES = {
  "unused-ref": "data-ref is never used by the component class",
  "unused-if": "data-if is never toggled",
  "unused-text": "{{ hole }} is never filled",
  "unused-list": "data-each is never rendered",
  "unused-item-name": "a name inside a data-each template is never referenced",
  "no-importer": "no component class or module uses this template",
} as const;

const at = (a: Analysis, key: string) => a.locs.get(key) ?? { line: 1, col: 1 };

/** Markup that the HTML declares but `code` (the component class text) does not use. `a` is the template's analysis when the caller already has it. */
export function unusedMarkup(html: string, code: string, a: Analysis = analyze(html)): Diagnostic[] {
  const used = (re: string) => new RegExp(re).test(code);
  const out: Diagnostic[] = [];
  const add = (rule: keyof typeof UNUSED_MARKUP_RULES, message: string, key: string) =>
    out.push({ rule, severity: "error", message, ...at(a, key) });
  // Dynamic access (refs[k], text[k], lists[k]) or an alias (const r = this.refs) hides which names are used: treat everything as used.
  const dynamic = (obj: string) => used(`\\b${obj}\\[\\s*[^"'\\s\\]]`) || used(`[\\w$]\\s*=\\s*this\\.${obj}\\s*[;,)\\n]|[(,]\\s*this\\.${obj}\\s*[,)]`);
  const dynRefs = dynamic("refs");
  const dynText = dynamic("text");
  const dynLists = dynamic("lists");
  // With a state/props/derive option, {{ }} and data-if bind to same-named fields (names are checked by tsc),
  // so they do not have to appear in the code.
  const stateful = code.includes(STATEFUL_MARK);

  for (const n of dynRefs ? [] : a.scope.refs.keys()) {
    if (!used(`refs\\.${esc(n)}\\b|refs\\[\\s*["']${esc(n)}["']|\\b${esc(n)}\\b\\s*[,}][^;]*=\\s*this\\.refs`)) {
      add("unused-ref", `data-ref="${n}" is never used by the component class. Fix: use this.refs.${n}, or remove the attribute if the element needs no TypeScript access.`, `ref:${n}`);
    }
  }
  for (const n of stateful ? [] : a.scope.ifs) {
    if (!used(`show\\(\\s*["']${esc(n)}["']`)) {
      add(
        "unused-if",
        `data-if="${n}" is never toggled, and data-if content is hidden by default, so it will never appear. Fix: call this.show("${n}", true) when it should be visible, or declare "${n}" in state/props/derive so it binds automatically.`,
        `if:${n}`,
      );
    }
  }
  for (const n of dynText || stateful ? [] : a.scope.text) {
    if (!used(`text\\.${esc(n)}\\b|text\\[\\s*["']${esc(n)}["']`)) {
      add("unused-text", `{{ ${n} }} is never filled and will render empty. Fix: assign this.text.${n} = value, or declare "${n}" in state/props/derive so it binds automatically.`, `text:${n}`);
    }
  }
  for (const [list, s] of a.lists) {
    if (!dynLists && !used(`lists\\.${esc(list)}\\b|lists\\[\\s*["']${esc(list)}["']`)) {
      const fix = a.boundLists.has(list) ? `assign this.lists.${list}.items = items` : `call this.lists.${list}.replace(items, (item) => item.id, (item, ctx) => { ... })`;
      add("unused-list", `data-each="${list}" is never rendered, so the list stays empty. Fix: ${fix}, for example inside render().`, `each:${list}`);
      continue;
    }
    // Names inside a list item: any appearance of the identifier counts as use (lenient on purpose, to avoid false positives).
    const items: [string, string][] = [
      ...[...s.refs.keys()].map((n): [string, string] => [n, `ref:${list}/${n}`]),
      ...[...s.text].map((n): [string, string] => [n, `text:${list}/${n}`]),
      ...[...s.ifs].map((n): [string, string] => [n, `if:${list}/${n}`]),
    ];
    for (const [n, key] of items) {
      if (!used(`\\b${esc(n)}\\b`)) {
        add("unused-item-name", `"${n}" inside data-each="${list}" is never referenced in the class. Fix: use it in the update callback of this.lists.${list}.replace(...) (refs.${n}, text.${n} or show("${n}", ...)), or remove it from the template.`, key);
      }
    }
  }
  return out;
}

export function lintUsage(dirs: string[], tsFiles: string[], cwd = process.cwd()): LintIssue[] {
  const ws = new Workspace();
  return lintRun(dirs, { cwd, ws, index: componentIndex(tsFiles, ws), groups: ["unused-markup"] }).issues;
}

const noImporter = (file: string, html: string): LintIssue => ({
  file,
  rule: "no-importer",
  severity: "error",
  line: 1,
  col: 1,
  message: `No component class passes this template to Component(), and no TypeScript file imports it (a module that only re-exports it does not use it). Fix: add \`import tpl from "./${basename(html)}.js"\` and \`class X extends Component(tpl)\` next to it, or delete the file; if it is not a Nativele template, this folder is not meant to be scanned: scan only the folder with the Nativele templates.`,
});

// ---------------------------------------------------------------------------
// data-flow: keep props flowing down and events flowing up, one level at a time
// ---------------------------------------------------------------------------

export const DATA_FLOW_RULES = {
  "prop-forwarding": "do not pass your own prop straight through to a child component (prop drilling)",
  "emit-forwarding": "do not re-emit a child's event unchanged (emit chain)",
  "props-mutation": "do not modify props inside the component",
  "custom-event-on-native": "a custom event belongs on the child component tag that emits it, not on a native element",
  "unknown-prop": "the attribute is not a declared prop of the child component",
  "invalid-prop-value": "the attribute value cannot be converted to the prop's type",
  "unknown-event": "the child component does not emit this event",
  "unknown-slot": "the child component or library element has no slot of this name, so the element is not shown",
  "unknown-custom-element": "the tag is not defined anywhere lint looks, while a known tag with the same prefix is one or two letters away",
  "unguarded-input-value": "render() writes a form control's value without comparing it first, which moves the caret while the user types",
  "unchecked-custom-elements": "custom element tags in the templates that lint has no single definition for, so their props, events and click-semantics are not checked",
} as const;

const WINDOW_EVENT_NAMES = ["afterprint", "beforeprint", "beforeunload", "gamepadconnected", "gamepaddisconnected", "hashchange", "languagechange", "message", "messageerror", "offline", "online", "pagehide", "pagereveal", "pageshow", "pageswap", "popstate", "rejectionhandled", "storage", "unhandledrejection", "unload"] as const;

/**
 * The event names an element fires natively beyond ELEMENT_EVENT_NAMES, by tag: the `on*` properties its lib.dom interface adds to those of HTMLElement, SVGElement or MathMLElement,
 * the same properties the types read the event of a `data-on-*` from (test/native-events-types.ts proves the lists equal to them for every tag). Kept out of events.ts, which the runtime imports.
 */
export const TAG_EVENT_NAMES = {
  audio: ["encrypted", "waitingforkey"],
  video: ["encrypted", "waitingforkey", "enterpictureinpicture", "leavepictureinpicture"],
  body: WINDOW_EVENT_NAMES,
  frameset: WINDOW_EVENT_NAMES,
  svg: WINDOW_EVENT_NAMES,
} as const;

const ELEMENT_EVENTS: ReadonlySet<string> = new Set(ELEMENT_EVENT_NAMES);
const TAG_EVENTS: ReadonlyMap<string, ReadonlySet<string>> = new Map(Object.entries(TAG_EVENT_NAMES).map(([tag, names]) => [tag, new Set(names)]));
const NATIVE_EVENTS: ReadonlySet<string> = new Set([...ELEMENT_EVENT_NAMES, ...Object.values(TAG_EVENT_NAMES).flat()]);
const firesNatively = (tag: string, name: string) => ELEMENT_EVENTS.has(name) || !!TAG_EVENTS.get(tag)?.has(name);

/** Attributes that are valid on any element and are never props. */
const GLOBAL_ATTRS = new Set(
  "class id style slot title hidden lang dir tabindex role contenteditable draggable inert part exportparts is translate spellcheck autofocus accesskey nonce popover itemprop itemscope itemtype itemid".split(" "),
);

interface Entry {
  key: string;
  value: string;
}

/** Entries (key and raw value text) at the top level of an object literal (braces included). */
function topLevelEntries(obj: string): Entry[] {
  const out: Entry[] = [];
  let depth = 0;
  let expectKey = false;
  let current: { key: string; start: number } | null = null;
  const close = (end: number) => {
    if (current) out.push({ key: current.key, value: obj.slice(current.start, end).trim() });
    current = null;
  };
  for (let i = 0; i < obj.length; i++) {
    const c = obj[i] as string;
    if (depth === 1 && expectKey && !/\s/.test(c)) {
      expectKey = false;
      const m = /^(?:([A-Za-z_$][\w$]*)|"([^"]*)"|'([^']*)')\s*(?=[:,}(])/.exec(obj.slice(i));
      if (m) {
        const key = m[1] ?? m[2] ?? m[3] ?? "";
        i += m[0].length - 1;
        // The value starts after the colon (shorthand and method entries have no plain value).
        const rest = obj.slice(i + 1);
        const colon = /^\s*:/.exec(rest);
        current = { key, start: colon ? i + 1 + colon[0].length : i + 1 };
        continue;
      }
    }
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < obj.length && obj[i] !== c; i++) if (obj[i] === "\\") i++;
    } else if (c === "{" || c === "[" || c === "(") {
      depth++;
      if (depth === 1) expectKey = true;
    } else if (c === "}" || c === "]" || c === ")") {
      if (depth === 1 && c === "}") close(i);
      depth--;
    } else if (c === "," && depth === 1) {
      close(i);
      expectKey = true;
    }
  }
  return out;
}

/** Entries of the `name: { ... }` option inside a `Component(tpl, { ... })` call. */
function optionEntries(call: string, name: string): Entry[] {
  const m = new RegExp(`\\b${name}\\s*:\\s*\\{`).exec(call);
  if (!m) return [];
  const start = call.indexOf("{", m.index);
  const end = matchClose(call, start, "{", "}");
  return end > 0 ? topLevelEntries(call.slice(start, end + 1)) : [];
}
const optionKeys = (call: string, name: string): string[] => optionEntries(call, name).map((e) => e.key);

/** Body text of a method (braces included), or null when the method is not found. */
function methodBody(body: string, name: string): string | null {
  const m = new RegExp(`(?:^|[\\s;{}])(?:(?:public|override|async)\\s+)*${esc(name)}\\s*\\(`, "m").exec(body);
  if (!m) return null;
  const open = body.indexOf("(", m.index);
  const close = matchClose(body, open, "(", ")");
  if (close < 0) return null;
  const start = body.indexOf("{", close);
  if (start < 0) return null;
  const end = matchClose(body, start, "{", "}");
  return end > 0 ? body.slice(start, end + 1) : null;
}

// ---- child component contracts (declared props and emitted events) ----

/** `any` is an attribute a custom elements manifest declares with a type lint does not check, which can still be set from HTML; `other` is a Nativele prop that cannot. */
export type PropKind = "string" | "number" | "boolean" | "other" | "any";

export interface Contract {
  props: Map<string, PropKind>;
  /** The string literals a prop allows: all of its values for kind string, and those allowed beside numbers for kind number. */
  values?: ReadonlyMap<string, readonly string[]>;
  /** The attribute name of each prop, as the manifest writes it. */
  attrs?: ReadonlyMap<string, string>;
  emits: Set<string>;
  /** The emitted events declared with `bubbles: true`. */
  bubbles: Set<string>;
  /** The slot names ("" is the default slot); undefined when lint cannot know them. */
  readonly slots?: ReadonlySet<string> | null;
  /** The package whose custom elements manifest the contract is read from. */
  readonly manifest?: string;
  /** What the manifest may leave out: attributes, events, or both, which are then not reported as unknown. */
  readonly open?: { props: boolean; events: boolean };
  /** The component's template, when its `import x from "./x.html.js"` can be found and the file exists: path relative to the `cwd` given to contractsFor, and its current text. */
  readonly template?: { file: string; readonly html: string };
  /** Why there is no `template`, when there is none. */
  readonly unread?: Unread;
}

function kindOf(valueText: string): PropKind {
  const v = valueText.replace(/\s+as\s[\s\S]*$/, "").trim();
  if (/^(["'`])/.test(v)) return "string";
  if (/^-?\d/.test(v)) return "number";
  if (/^(true|false)$/.test(v)) return "boolean";
  return "other";
}

/** Every definition of each tag found by contractsFor, with the folder of the package that defines it; `contract` is null when define() passes a class that is not a `Component(...)` class the index can follow to. */
export class Contracts extends Map<string, { pkg: string; contract: Contract | null; at: string }[]> {
  /** What contractsAt and childrenAt have worked out for each package. */
  readonly byPackage = new Map<string, PackageView>();
  /** The nearest folder at or above a folder that holds a package.json, or "" when there is none, as the run the contracts were read in finds it. */
  readonly packageOf: (dir: string) => string;
  /** The folder the paths in messages are relative to. */
  readonly cwd: string;
  /** The custom elements manifests that apply to the templates of a package (see manifestsAt). */
  readonly manifests: (pkg: string) => ReturnType<typeof manifestsAt>;
  /** Tags the scanned TypeScript names without a define(): customElements.define("tag", ...) and HTMLElementTagNameMap keys. */
  readonly declared: ReadonlySet<string>;
  constructor(packageOf: (dir: string) => string, cwd: string, manifests: (pkg: string) => ReturnType<typeof manifestsAt> = () => [], declared: ReadonlySet<string> = new Set()) {
    super();
    this.packageOf = packageOf;
    this.cwd = cwd;
    this.manifests = manifests;
    this.declared = declared;
  }
}

/** Where a tag a template may use is known from: define() in the scanned folders, a declaration in the scanned TypeScript, or the manifest of a package. */
type Known = { from: "folders" } | { from: "declared" } | { from: "manifest"; pkg: string };

interface PackageView {
  contracts: ReadonlyMap<string, Contract>;
  children: A11yChildren;
  known: ReadonlyMap<string, Known>;
  definitions: Map<string, string>;
}

const manifestContracts = new WeakMap<ManifestElement, Contract>();

function manifestContract(el: ManifestElement, pkg: string): Contract {
  let c = manifestContracts.get(el);
  if (c) return c;
  const props = new Map<string, PropKind>();
  const values = new Map<string, readonly string[]>();
  const attrs = new Map<string, string>();
  for (const a of el.attrs.values()) {
    const key = camel(a.name);
    props.set(key, a.kind);
    attrs.set(key, a.name);
    if (a.values) values.set(key, a.values);
  }
  const emits = new Set(el.events ?? []);
  c = { props, values, attrs, emits, bubbles: emits, slots: el.slots ? new Set(el.slots) : null, manifest: pkg, ...(el.openAttrs || !el.events ? { open: { props: el.openAttrs, events: !el.events } } : {}), unread: { cause: "third-party", pkg } };
  manifestContracts.set(el, c);
  return c;
}

type Element = DefaultTreeAdapterMap["element"];
const slotNames = (html: string): Set<string> => {
  const out = new Set<string>();
  const walk = (nodes: DefaultTreeAdapterMap["childNode"][]) => {
    for (const n of nodes) {
      if (!("tagName" in n)) continue;
      if (n.tagName === "slot") out.add((n as Element).attrs.find((a) => a.name === "name")?.value ?? "");
      walk(n.tagName === "template" ? (n as DefaultTreeAdapterMap["template"]).content.childNodes : n.childNodes);
    }
  };
  walk(parseFragment(html).childNodes);
  return out;
}

type Declared = Pick<Contract, "props" | "emits" | "bubbles">;

function declared(call: string): Declared {
  const emits = optionEntries(call, "emits");
  return {
    props: new Map(optionEntries(call, "props").map((e) => [e.key, kindOf(e.value)])),
    emits: new Set(emits.map((e) => e.key)),
    bubbles: new Set(emits.filter((e) => /\bbubbles\s*:\s*true\b/.test(e.value)).map((e) => e.key)),
  };
}

/** The nearest folder at or above `dir` that holds a package.json, or "" when there is none. */
function packageOf(ws: Workspace, dir: string): string {
  return ws.text(join(dir, "package.json")) !== null ? dir : dirname(dir) === dir ? "" : packageOf(ws, dirname(dir));
}

/**
 * Read the declared props, emitted events and template of every component defined (via define("tag", Class)) under `dirs`.
 * This is what lets the linter check the attributes and data-on-* written on a child tag in a parent template.
 */
export function contractsFor(dirs: string[], cwd = process.cwd(), ws = new Workspace(), index: ComponentIndex = ws.index(dirs)): Contracts {
  const pkgs = new Map<string, string>();
  const pkgOf = (dir: string) => pkgs.get(dir) ?? (pkgs.set(dir, packageOf(ws, resolve(dir))).get(dir) as string);
  const declaredTags = new Set([...index.modules.values()].flatMap((m) => m.tags));
  const out = new Contracts(pkgOf, cwd, (pkg) => (pkg ? manifestsAt(ws, pkg) : []), declaredTags);
  for (const def of index.defines) {
    const c = def.component;
    let contract: Contract | null = null;
    const template = c?.template;
    if (c) {
      const declaredKind = `declared:${c.name ?? `${c.line}:${c.col}`}`;
      const own = template ? { get file() { return relative(cwd, template); }, get html() { return ws.text(template) ?? ""; } } : undefined;
      const unfollowed: Unread = { cause: "template-unfollowed", get at() { return `${relative(cwd, c.file)}:${c.line}`; } };
      contract = {
        ...((ws.memo.get(c.file, declaredKind, [c.call]) as Declared | undefined) ?? ws.memo.set(c.file, declaredKind, [c.call], declared(c.call))),
        get template() {
          return template && ws.text(template) !== null ? own : undefined;
        },
        get unread(): Unread | undefined {
          if (!template) return unfollowed;
          return ws.text(template) === null ? { cause: "template-missing", file: relative(cwd, template) } : undefined;
        },
      };
      // Not enumerable: the memo compares contracts by their content, which the template's text already holds.
      Object.defineProperty(contract, "slots", {
        get() {
          const text = template && ws.text(template);
          if (!template || text === null || text === undefined) return undefined;
          return (ws.memo.get(template, "slots", [text]) as Set<string> | undefined) ?? ws.memo.set(template, "slots", [text], slotNames(text));
        },
      });
    }
    out.set(def.tag, [...(out.get(def.tag) ?? []), { pkg: pkgOf(dirname(def.file)), contract, get at() { return `${relative(cwd, def.file)}:${def.line}`; } }]);
  }
  return out;
}

/**
 * The contracts that apply to a template in `file`. A tag defined once uses that definition. A tag defined several times
 * (separate apps or packages in one folder) uses the one in the same package as `file`, and is left out when that is not
 * exactly one, so a template is never checked against a component it does not use.
 */
export function contractsAt(all: Contracts, file: string): ReadonlyMap<string, Contract> {
  return atPackage(all, file).contracts;
}

/** The components a template in `file` can hold, as checkA11y reads them: the contract of each tag contractsAt has, and why each other tag defined in the scanned folders has none. */
export function childrenAt(all: Contracts, file: string): A11yChildren {
  return atPackage(all, file).children;
}

/**
 * The contracts, children and known tags at the package of `file`, and the text of what `children` and `known` hold for each tag (or all of it), as lintTemplate compares it.
 * A tag defined in the scanned folders uses that definition; a tag only an applicable manifest defines uses the manifest's.
 */
function atPackage(all: Contracts, file: string): PackageView {
  const pkg = all.packageOf(dirname(file));
  let out = all.byPackage.get(pkg);
  if (!out) {
    const contracts = new Map<string, Contract>();
    const children = new Map<string, A11yChild>();
    const known = new Map<string, Known>();
    for (const tag of all.keys()) known.set(tag, { from: "folders" });
    for (const tag of all.declared) if (!known.has(tag)) known.set(tag, { from: "declared" });
    for (const [tag, defs] of all) {
      const here = defs.length === 1 ? defs : defs.filter((d) => d.pkg === pkg);
      const one = here.length === 1 ? here[0] : undefined;
      if (one?.contract) {
        contracts.set(tag, one.contract);
        children.set(tag, one.contract);
      } else if (one) children.set(tag, { unread: { cause: "not-component", at: one.at } });
      else children.set(tag, { unread: { cause: "ambiguous", packages: defs.map((d) => relative(all.cwd, d.pkg) || ".") } });
    }
    const fromManifests = new Map<string, { pkg: string; el: ManifestElement }[]>();
    const files = new Set<string>();
    for (const m of all.manifests(pkg)) {
      if (!("elements" in m) || files.has(m.file)) continue;
      files.add(m.file);
      for (const [tag, el] of m.elements) fromManifests.set(tag, [...(fromManifests.get(tag) ?? []), { pkg: m.pkg, el }]);
    }
    for (const [tag, found] of fromManifests) {
      if (!known.has(tag)) known.set(tag, { from: "manifest", pkg: (found[0] as { pkg: string }).pkg });
      if (all.has(tag)) continue;
      const one = found.length === 1 ? found[0] : undefined;
      if (one) {
        const c = manifestContract(one.el, one.pkg);
        contracts.set(tag, c);
        children.set(tag, c);
      } else children.set(tag, { unread: { cause: "ambiguous", packages: found.map((f) => f.pkg) } });
    }
    all.byPackage.set(pkg, (out = { contracts, children, known, definitions: new Map() }));
  }
  return out;
}

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array.from({ length: b.length }, () => 0)]);
  for (let j = 1; j <= b.length; j++) (d[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      (d[i] as number[])[j] = Math.min(
        (d[i - 1] as number[])[j]! + 1,
        (d[i] as number[])[j - 1]! + 1,
        (d[i - 1] as number[])[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return (d[a.length] as number[])[b.length] as number;
}
const nearest = (name: string, options: readonly string[]): string | undefined => {
  const best = options.map((o) => ({ o, d: distance(name, o) })).sort((x, y) => x.d - y.d)[0];
  return best && best.d <= 2 ? best.o : undefined;
};
const suggest = (name: string, options: readonly string[]): string => {
  const best = nearest(name, options);
  return best === undefined ? "" : ` Did you mean "${best}"?`;
};
const manifestOf = (pkg: string) => `the custom elements manifest of ${pkg}`;
const knownBy = (k: Known): string => (k.from === "folders" ? "a define() in the scanned folders" : k.from === "declared" ? "a customElements.define() or HTMLElementTagNameMap entry in the scanned TypeScript" : manifestOf(k.pkg));

/**
 * Data-flow checks (suggestions, not errors).
 * - prop-forwarding: a child's prop is assigned straight from one of this component's own props
 * - emit-forwarding: the handler of a child's event only emits the event again
 * - props-mutation: a prop is assigned inside the component
 * - custom-event-on-native: a custom event is written on a native element's data-on-*
 * - unknown-prop / invalid-prop-value / unknown-event / unknown-slot: the attributes, events and slot names written on a child tag do not match
 *   what the child component or the library element's manifest declares (needs `contracts`, see contractsFor)
 * - unknown-custom-element: a tag nothing defines is close to one of the `known` tags
 */
export function dataFlow(
  html: string,
  classes: ComponentClass[],
  contracts: ReadonlyMap<string, Contract> = new Map(),
  a: Analysis = analyze(html),
  known: ReadonlyMap<string, Known> = new Map(),
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const report = (rule: keyof typeof DATA_FLOW_RULES, message: string, key?: string, loc?: { line: number; col: number }) => {
    out.push({ rule, severity: "warning", message, ...(loc ?? (key ? at(a, key) : { line: 1, col: 1 })) });
  };

  for (const site of a.eventSites) {
    if (site.tag.includes("-") || firesNatively(site.tag, site.event)) continue;
    const emitters = [...contracts].filter(([, c]) => c.emits.has(site.event));
    if (!emitters.length || emitters.some(([, c]) => c.bubbles.has(site.event))) continue;
    const tags = emitters.map(([tag]) => `<${tag}>`).join(", ");
    report(
      "custom-event-on-native",
      `data-on-${site.event} is on the native element <${site.tag}>, but "${site.event}" is an event that ${tags} emits without bubbles: true, so only the tag of the component that emits it receives it. Fix: put data-on-${site.event} on ${emitters.length === 1 ? tags : "the tag of the component that emits it"}, or declare the event with event<...>({ bubbles: true }) in its emits.`,
      `event:${site.method}`,
    );
  }

  const unknownTags = new Set<string>();
  for (const use of a.customUses) {
    const contract = contracts.get(use.tag);
    if (!contract) {
      if (unknownTags.has(use.tag) || known.has(use.tag)) continue;
      unknownTags.add(use.tag);
      const prefix = use.tag.slice(0, use.tag.indexOf("-") + 1);
      const near = nearest(use.tag, [...known.keys()].filter((t) => t.startsWith(prefix)));
      if (near === undefined) continue;
      const manifests = [...new Set([...known.values()].flatMap((k) => (k.from === "manifest" ? [manifestOf(k.pkg)] : [])))];
      report(
        "unknown-custom-element",
        `<${use.tag}> is not defined in the scanned folders${manifests.length ? ` or by ${and(manifests)}` : ""}, so the browser leaves it an undefined element that shows only its children; <${near}>, defined by ${knownBy(known.get(near) as Known)}, is close to it. Did you mean "${near}"? Fix: correct the tag name; if another package defines it, import that package (it is not in this package's dependencies, or declares no custom elements manifest).`,
        undefined,
        use,
      );
      continue;
    }
    const lib = contract.manifest;
    const nameOf = (p: string) => contract.attrs?.get(p) ?? kebab(p);
    const propNames = [...contract.props.keys()];
    use.attrs.forEach((attrName, i) => {
      if (attrName.startsWith("data-") || attrName.startsWith("aria-") || attrName.startsWith("on") || GLOBAL_ATTRS.has(attrName)) return;
      const prop = camel(attrName);
      const kind = contract.props.get(prop);
      const value = use.values[i] ?? "";
      const allowed = contract.values?.get(prop);
      if (kind === undefined) {
        if (contract.open?.props) return;
        if (lib) {
          const names = propNames.map(nameOf);
          report(
            "unknown-prop",
            `<${use.tag} ${attrName}> is not an attribute ${manifestOf(lib)} declares for <${use.tag}>. ${names.length ? `Attributes: ${names.join(", ")}.` : "It declares no attributes."}${suggest(attrName, names)} Fix: correct the attribute name, or set the property from TypeScript (this.refs.x.name = value) if it has no attribute.`,
            undefined,
            use,
          );
          return;
        }
        const declared = propNames.length ? `Declared props: ${propNames.map((p) => kebab(p)).join(", ")}.` : "It declares no props.";
        report(
          "unknown-prop",
          `<${use.tag} ${attrName}> is not a declared prop of <${use.tag}>. ${declared}${suggest(prop, propNames)} Fix: declare "${prop}" in the child's props option, or remove the attribute.`,
          undefined,
          use,
        );
      } else if (kind === "other") {
        report(
          "invalid-prop-value",
          `The prop "${prop}" of <${use.tag}> is not a string, number or boolean, so it cannot be set from the HTML attribute ${attrName}. Fix: assign it from TypeScript, e.g. this.refs.x.${prop} = value.`,
          undefined,
          use,
        );
      } else if (value.includes("{{")) {
        return;
      } else if (kind === "boolean" && lib && value.trim().toLowerCase() === "false") {
        report(
          "invalid-prop-value",
          `<${use.tag} ${attrName}="${value}"> sets ${attrName} to true: a boolean attribute of a library element is true whenever it is present, whatever its value. Fix: remove the attribute, or set the property from TypeScript (this.refs.x.${prop} = false).`,
          undefined,
          use,
        );
      } else if (kind === "number" && Number.isNaN(Number(value)) && !allowed?.includes(value)) {
        const also = allowed?.length ? `, or one of ${allowed.map((v) => `"${v}"`).join(", ")}` : "";
        report(
          "invalid-prop-value",
          lib
            ? `<${use.tag} ${attrName}="${value}">: ${manifestOf(lib)} declares ${attrName} a number${also}, and "${value}" is not, so the element reads it as NaN. Fix: write a number, such as ${attrName}="5"${also}.`
            : `<${use.tag} ${attrName}="${value}">: the prop "${prop}" is a number, and "${value}" is not one, so the component warns at run time and keeps the default value. Fix: write a number, such as ${attrName}="5".`,
          undefined,
          use,
        );
      } else if (kind === "string" && allowed && !allowed.includes(value)) {
        report(
          "invalid-prop-value",
          `<${use.tag} ${attrName}="${value}">: "${value}" is not a value ${lib ? manifestOf(lib) : `<${use.tag}>`} declares for ${attrName}: ${allowed.join(", ")}.${suggest(value, allowed)} Fix: use one of the listed values.`,
          undefined,
          use,
        );
      }
    });
    if (!contract.open?.events) {
      for (const ev of use.events) {
        if (contract.emits.has(ev) || NATIVE_EVENTS.has(ev)) continue;
        const emitted = [...contract.emits];
        report(
          "unknown-event",
          lib
            ? `The custom elements manifest of ${lib} lists no event "${ev}" for <${use.tag}>, so data-on-${ev} will never fire. ${emitted.length ? `Events: ${emitted.join(", ")}.` : "It lists no events for it."}${suggest(ev, emitted)} Fix: correct the event name.`
            : `<${use.tag}> does not emit "${ev}", so data-on-${ev} will never fire. ${emitted.length ? `It emits: ${emitted.join(", ")}.` : "It declares no events."}${suggest(ev, emitted)} Fix: declare the event in the child's emits option (emits: { "${ev}": event<...>() }), or fix the name.`,
          undefined,
          use,
        );
      }
    }
    const slots = use.slotted.length ? contract.slots : undefined;
    if (!slots) continue;
    const named = [...slots].filter((n) => n);
    const source = lib ? manifestOf(lib) : `its template (${contract.template?.file})`;
    for (const s of use.slotted) {
      if (!s.name || slots.has(s.name)) continue;
      report(
        "unknown-slot",
        `<${use.tag}> has no slot "${s.name}" in ${source}, so this element is not shown. ${named.length ? `Slots: ${named.join(", ")}.` : "It has no named slots."}${suggest(s.name, named)} Fix: use one of the slot names, or remove the slot attribute.`,
        undefined,
        s,
      );
    }
  }

  const customRefs = new Map<string, string>();
  for (const refs of [a.scope.refs, ...[...a.lists.values()].map((l) => l.refs)]) {
    for (const [name, type] of refs) {
      const tag = /El<"([^"]+)">/.exec(type)?.[1];
      if (tag?.includes("-")) customRefs.set(name, tag);
    }
  }

  const formControls = new Set([...a.scope.refs].filter(([, type]) => /^El<"(input|textarea|select)">$/.test(type)).map(([name]) => name));
  for (const { body } of classes) {
    const render = methodBody(body, "render");
    if (!render || !formControls.size) continue;
    const lines = render.split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/\brefs\.(\w+)\.value\s*=(?!=)/g)) {
        const ref = m[1] as string;
        if (!formControls.has(ref)) continue;
        const guarded = [line, lines[i - 1] ?? ""].some((l) => new RegExp(`refs\\.${esc(ref)}\\.value\\s*!==?`).test(l));
        if (guarded) continue;
        report(
          "unguarded-input-value",
          `render() assigns this.refs.${ref}.value without comparing it first. Writing a form control's value while the user types moves the caret to the end. Fix: if (this.refs.${ref}.value !== next) this.refs.${ref}.value = next;`,
          `ref:${ref}`,
        );
      }
    });
  }

  for (const { call, body } of classes) {
    const props = optionKeys(call, "props");
    for (const k of props) {
      if (new RegExp(`\\bthis\\.${esc(k)}\\s*(?:[-+*/%]?=(?!=)|\\+\\+|--)`).test(body)) {
        report(
          "props-mutation",
          `The prop "${k}" is controlled by the parent component; do not assign this.${k} inside the component. Fix: emit an event so the parent changes it, or keep the value in state instead.`,
        );
      }
    }
    const view = /\brender\s*\(\s*([A-Za-z_$][\w$]*)/.exec(body)?.[1];
    for (const m of body.matchAll(/\brefs\.(\w+)\.(\w+)\s*=\s*([^;\n]+)/g)) {
      const [, ref, target, rhsRaw] = m as unknown as [string, string, string, string];
      const tag = customRefs.get(ref);
      if (!tag) continue;
      const rhs = rhsRaw.trim().replace(/,$/, "");
      const prop =
        /^this\.props\.(\w+)$/.exec(rhs)?.[1] ??
        /^this\.(\w+)$/.exec(rhs)?.[1] ??
        (view ? new RegExp(`^${esc(view)}\\.(\\w+)$`).exec(rhs)?.[1] : undefined);
      if (prop && props.includes(prop)) {
        report(
          "prop-forwarding",
          `The prop "${prop}" is passed unchanged to <${tag}> (${ref}.${target}). Passing data through intermediate components makes the data flow hard to follow. Fix: for data needed several levels down, share a createStore from a module and bind to it where it is used (this.bind(store, fn)); keep passing props only one level.`,
          `ref:${ref}`,
        );
      }
    }
    const methods = new Map<string, { fn: string | null; emitted: Set<string | undefined> }>();
    for (const site of a.eventSites) {
      if (!site.tag.includes("-")) continue;
      let known = methods.get(site.method);
      if (!known) {
        const fn = methodBody(body, site.method);
        methods.set(site.method, (known = { fn, emitted: new Set(fn ? [...fn.matchAll(EMIT_NAME)].map((m) => m[1]) : []) }));
      }
      const fn = known.fn;
      if (!fn) continue;
      const inner = fn.slice(1, -1).trim();
      const forwardsSame = known.emitted.has(site.event);
      const pureRelay = /^this\.emit\([\s\S]*\);?$/.test(inner) && (inner.match(/this\.emit\(/g) ?? []).length === 1 && inner.split(";").filter((x) => x.trim()).length === 1;
      if (forwardsSame || pureRelay) {
        report(
          "emit-forwarding",
          `${site.method}() only forwards the "${site.event}" event of <${site.tag}>. Re-emitting events level by level hides where they are handled. Fix: handle the event in this component, or let the component that needs it subscribe to a shared store instead.`,
          `event:${site.method}`,
        );
      }
    }
  }
  return out;
}

export function lintDataFlow(dirs: string[], tsFiles: string[], cwd = process.cwd()): LintIssue[] {
  const ws = new Workspace();
  return lintRun(dirs, { cwd, ws, index: componentIndex(tsFiles, ws), contracts: contractsFor(dirs, cwd, ws), groups: ["data-flow"] }).issues;
}

export type Group = "unused-markup" | "data-flow" | "a11y";

/** What lint finds in one template; a group that was not run has no findings. */
export interface TemplateFindings {
  /** The template's own diagnostics, as ts-dom gen reports them. */
  diagnostics: Diagnostic[];
  /** unused-markup; null when no class or module uses the template. */
  usage: Diagnostic[] | null;
  flow: Diagnostic[];
  a11y: Diagnostic[];
  /** The first use of each custom element tag in the template. */
  uses: { tag: string; line: number; col: number }[];
}

/** What the lint of the templates of one project reads: the files, the index and the child contracts. */
export interface LintProject {
  ws: Workspace;
  index: ComponentIndex;
  contracts: Contracts;
  cwd: string;
}

/** The project of the TypeScript files under `dirs`, as the run of `ws` reads it. */
export function lintProject(ws: Workspace, dirs: readonly string[], cwd = process.cwd(), index = ws.index(dirs)): LintProject {
  return { ws, index, contracts: contractsFor([...dirs], cwd, ws, index), cwd };
}

const ALL = "*";

/** A view of `map` that adds each key it is asked about to `uses`, and ALL when it is read whole. */
function recording<V>(map: ReadonlyMap<string, V>, uses: Set<string>): ReadonlyMap<string, V> {
  const all = () => (uses.add(ALL), map);
  return {
    get: (k) => (uses.add(k), map.get(k)),
    has: (k) => (uses.add(k), map.has(k)),
    get size() {
      return all().size;
    },
    forEach: (fn, thisArg) => all().forEach(fn, thisArg),
    entries: () => all().entries(),
    keys: () => all().keys(),
    values: () => all().values(),
    [Symbol.iterator]: () => all()[Symbol.iterator](),
  };
}

const contents = (value: unknown): string => JSON.stringify(value, (_, v: unknown) => (v instanceof Map || v instanceof Set ? [...v] : v));

/**
 * The findings of one template for `groups`. They depend only on the template's text, the code of the classes and modules that use it, and the definitions of the tags they look up,
 * so the workspace's memo keeps them for the template with all of these, and they are used again while each is the same in the run that asks.
 * `parse` is how the template is analyzed when the memo does not have its findings.
 */
export function lintTemplate(p: LintProject, html: string, groups: readonly Group[], parse = analyze): TemplateFindings {
  const file = resolve(html);
  const text = p.ws.text(file) ?? "";
  const classes = (p.index.byTemplate.get(file) ?? []).map(({ call, body }) => ({ call, body }));
  const importers = (p.index.importers.get(file) ?? []).map((i) => p.ws.text(i.file) ?? "");
  const { contracts, children, known, definitions } = atPackage(p.contracts, file);
  // A key in `known` starts with a character no tag starts with.
  const definition = (key: string): string => {
    let d = definitions.get(key);
    if (d === undefined) {
      const [map, tag] = key.startsWith("\0") ? [known, key.slice(1)] : [children, key];
      definitions.set(key, (d = contents(tag === ALL ? [...map] : [map.get(tag)])));
    }
    return d;
  };
  const kind = `findings:${[...groups].sort().join(",")}`;
  const from = [text, classes.length, ...classes.flatMap((c) => [c.call, c.body]), ...importers];
  const kept = p.ws.memo.get(file, kind, from) as { definitions: [string, string][]; value: TemplateFindings } | undefined;
  if (kept?.definitions.every(([tag, d]) => definition(tag) === d)) return kept.value;
  const tags = new Set<string>();
  const knownTags = new Set<string>();
  const analysis = parse(text);
  const uses = new Map<string, { tag: string; line: number; col: number }>();
  for (const u of analysis.customUses) if (!uses.has(u.tag)) uses.set(u.tag, { tag: u.tag, line: u.line, col: u.col });
  const value: TemplateFindings = {
    diagnostics: analysis.diagnostics,
    usage: !groups.includes("unused-markup") ? [] : classes.length || importers.length ? unusedMarkup(text, ownerCode(classes, importers), analysis) : null,
    flow: groups.includes("data-flow") ? dataFlow(text, classes, recording(contracts, tags), analysis, recording(known, knownTags)) : [],
    a11y: groups.includes("a11y") ? checkA11y(text, [], recording(children, tags), analysis.root) : [],
    uses: [...uses.values()],
  };
  const keys = [...tags, ...[...knownTags].map((tag) => `\0${tag}`)];
  return p.ws.memo.set(file, kind, from, { definitions: keys.map((key) => [key, definition(key)]), value }).value;
}

/** `unchecked-custom-elements`: the tags the templates use that `contracts` has no contract of, reported once at the first use. */
function uncheckedTags(found: readonly { file: string; html: string; uses: TemplateFindings["uses"] }[], contracts: Contracts): LintIssue[] {
  const unchecked = new Map<string, { first: LintIssue; unread: Unread }>();
  for (const { file, html, uses } of found) {
    const here = contractsAt(contracts, html);
    const children = childrenAt(contracts, html);
    for (const use of uses) {
      if (here.has(use.tag) || unchecked.has(use.tag)) continue;
      unchecked.set(use.tag, { first: { file, line: use.line, col: use.col, rule: "unchecked-custom-elements", severity: "warning", message: "" }, unread: children.get(use.tag)?.unread ?? NOT_DEFINED });
    }
  }
  const all = [...unchecked];
  const head = [...all.filter(([, u]) => u.unread.cause === "undefined"), ...all.filter(([, u]) => u.unread.cause !== "undefined")][0]?.[1].first;
  if (!head) return [];
  const groups = (["undefined", "not-component", "ambiguous"] as const).flatMap((cause) => {
    const tags = all.filter(([, u]) => u.unread.cause === cause).map(([tag, u]) => (detailOf(u.unread) ? `<${tag}> (${detailOf(u.unread)})` : `<${tag}>`));
    return tags.length ? [`${tags.join(", ")}: ${UNREAD[cause].what}`] : [];
  });
  const fixes = unreadFixes(new Map(all.map(([tag, u]) => [tag, u.unread])));
  return [
    {
      ...head,
      message: `Lint has no single definition to read for ${unchecked.size === 1 ? "one custom element" : `${unchecked.size} custom elements`} used in the templates, so their attributes and events (unknown-prop, invalid-prop-value, unknown-event) and data-on-click on them (click-semantics) are not checked. ${groups.join(". ")}. This is reported once per run, at the first use of the first tag. Fix: nothing needs to change for elements that are not Nativele components, such as another library's (pass --ignore=unchecked-custom-elements to silence this); otherwise ${fixes.join("; ")}.`,
    },
  ];
}

export interface LintOptions {
  /** Also run the accessibility checks. */
  a11y?: boolean;
  /** The folder issue paths are relative to. Default: the working directory. */
  cwd?: string;
  /** The files of this run. Default: a new workspace. */
  ws?: Workspace;
  /** The groups to run instead of those `a11y` selects. */
  groups?: readonly Group[];
  index?: ComponentIndex;
  contracts?: Contracts;
}

/**
 * The lint of the templates under `dirs`: unused markup, data flow and, with `a11y`, the accessibility checks, and the templates' own diagnostics.
 * Each template is parsed once for all of them, and not at all when the workspace's memo has its findings.
 */
export function lintRun(dirs: string[], { a11y = false, cwd = process.cwd(), ws = new Workspace(), groups = ["unused-markup", "data-flow", ...(a11y ? (["a11y"] as const) : [])], ...given }: LintOptions = {}): { issues: LintIssue[]; templates: { dir: string; file: string; diagnostics: Diagnostic[] }[] } {
  const index = given.index ?? ws.index(dirs);
  const p: LintProject = given.contracts ? { ws, index, contracts: given.contracts, cwd } : lintProject(ws, dirs, cwd, index);
  const usage: LintIssue[] = [];
  const flow: LintIssue[] = [];
  const checks: LintIssue[] = [];
  const found: { file: string; html: string; uses: TemplateFindings["uses"] }[] = [];
  const templates: { dir: string; file: string; diagnostics: Diagnostic[] }[] = [];
  for (const dir of dirs) {
    for (const html of listHtml(dir, ws)) {
      const file = relative(cwd, html);
      const r = lintTemplate(p, html, groups);
      templates.push({ dir, file: html, diagnostics: r.diagnostics });
      if (r.usage === null) usage.push(noImporter(file, html));
      else for (const d of r.usage) usage.push({ file, ...d });
      for (const d of r.flow) flow.push({ file, ...d });
      for (const d of r.a11y) checks.push({ file, ...d });
      const typos = r.flow.filter((d) => d.rule === "unknown-custom-element");
      found.push({ file, html, uses: typos.length ? r.uses.filter((u) => !typos.some((d) => d.line === u.line && d.col === u.col)) : r.uses });
    }
  }
  if (groups.includes("data-flow")) flow.push(...uncheckedTags(found, p.contracts));
  return { issues: [...usage, ...flow, ...checks], templates };
}

export const runLint = (dirs: string[], options?: LintOptions): LintIssue[] => lintRun(dirs, options).issues;

export function formatIssue(i: LintIssue): string {
  return `${i.file}:${i.line}:${i.col} ${i.severity} [${i.rule}] ${i.message}`;
}
