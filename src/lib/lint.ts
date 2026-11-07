import { existsSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { checkA11y } from "./a11y.ts";
import { analyze, listHtml } from "./codegen.ts";
import type { Analysis, Diagnostic } from "./codegen.ts";
import { componentIndex, matchClose, Workspace } from "./components.ts";
import type { ComponentIndex, Sources } from "./components.ts";

export type { Diagnostic };

/** A diagnostic attached to the HTML file it refers to. */
export interface LintIssue extends Diagnostic {
  file: string;
}

const esc = (s: string) => s.replace(/[$]/g, "\\$&");

/** Marker that ownerCode() adds when it sees `Component(tpl, { state | props | derive })`. */
const STATEFUL_MARK = "/*ts-dom:stateful*/";

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

/** The unused-markup findings of one template, or null when no class or module uses it. */
export function templateUsage(html: string, text: string, analysis: Analysis, index: ComponentIndex, sources: Sources): Diagnostic[] | null {
  const classes = index.byTemplate.get(resolve(html)) ?? [];
  const importers = index.importers.get(resolve(html)) ?? [];
  if (!classes.length && !importers.length) return null;
  return unusedMarkup(text, ownerCode(classes, importers.map((i) => sources.text(i.file) ?? "")), analysis);
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
  "unguarded-input-value": "render() writes a form control's value without comparing it first, which moves the caret while the user types",
  "unchecked-custom-elements": "custom element tags in the templates that lint has no single definition for, so their props, events and click-semantics are not checked",
} as const;

/** Every event name that the element event maps of lib.dom declare (test/native-events-types.ts proves the list equal to them). */
export const NATIVE_EVENT_NAMES = ["abort", "afterprint", "animationcancel", "animationend", "animationiteration", "animationstart", "auxclick", "beforeinput", "beforematch", "beforeprint", "beforetoggle", "beforeunload", "blur", "cancel", "canplay", "canplaythrough", "change", "click", "close", "command", "compositionend", "compositionstart", "compositionupdate", "contextlost", "contextmenu", "contextrestored", "copy", "cuechange", "cut", "dblclick", "drag", "dragend", "dragenter", "dragleave", "dragover", "dragstart", "drop", "durationchange", "emptied", "encrypted", "ended", "enterpictureinpicture", "error", "focus", "focusin", "focusout", "formdata", "fullscreenchange", "fullscreenerror", "gamepadconnected", "gamepaddisconnected", "gotpointercapture", "hashchange", "input", "invalid", "keydown", "keypress", "keyup", "languagechange", "leavepictureinpicture", "load", "loadeddata", "loadedmetadata", "loadstart", "lostpointercapture", "message", "messageerror", "mousedown", "mouseenter", "mouseleave", "mousemove", "mouseout", "mouseover", "mouseup", "offline", "online", "pagehide", "pagereveal", "pageshow", "pageswap", "paste", "pause", "play", "playing", "pointercancel", "pointerdown", "pointerenter", "pointerleave", "pointermove", "pointerout", "pointerover", "pointerrawupdate", "pointerup", "popstate", "progress", "ratechange", "rejectionhandled", "reset", "resize", "scroll", "scrollend", "securitypolicyviolation", "seeked", "seeking", "select", "selectionchange", "selectstart", "slotchange", "stalled", "storage", "submit", "suspend", "timeupdate", "toggle", "touchcancel", "touchend", "touchmove", "touchstart", "transitioncancel", "transitionend", "transitionrun", "transitionstart", "unhandledrejection", "unload", "volumechange", "waiting", "waitingforkey", "webkitanimationend", "webkitanimationiteration", "webkitanimationstart", "webkittransitionend", "wheel"] as const;
const NATIVE_EVENTS: ReadonlySet<string> = new Set(NATIVE_EVENT_NAMES);

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

export type PropKind = "string" | "number" | "boolean" | "other";

export interface Contract {
  props: Map<string, PropKind>;
  emits: Set<string>;
  /** The emitted events declared with `bubbles: true`. */
  bubbles: Set<string>;
  /** The component's template, when its `import x from "./x.html.js"` can be found: path relative to the `cwd` given to contractsFor, and its current text. */
  template?: { file: string; readonly html: string };
}

function kindOf(valueText: string): PropKind {
  const v = valueText.replace(/\s+as\s[\s\S]*$/, "").trim();
  if (/^(["'`])/.test(v)) return "string";
  if (/^-?\d/.test(v)) return "number";
  if (/^(true|false)$/.test(v)) return "boolean";
  return "other";
}

/**
 * Every definition of each tag found by contractsFor, with the folder of the package that defines it; `contract` is null when define() passes a class that is not a `Component(...)` class the index can follow to.
 * `files` are the define() file, the class file and the template, and `template` the template (absolute), which the checks of a parent template read.
 */
export type Contracts = Map<string, { pkg: string; contract: Contract | null; at: string; files: string[]; template?: string }[]>;

/** The nearest folder at or above `dir` that holds a package.json, or "" when there is none; `folders` keeps the answer for every folder on the way. */
function packageOf(dir: string, folders: Map<string, string>): string {
  let pkg = folders.get(dir);
  if (pkg === undefined) {
    pkg = existsSync(join(dir, "package.json")) ? dir : dirname(dir) === dir ? "" : packageOf(dirname(dir), folders);
    folders.set(dir, pkg);
  }
  return pkg;
}

/** What contractsAt has worked out for one Contracts object: the package of each folder, and the contracts of each package. */
const lookups = new WeakMap<Contracts, { folders: Map<string, string>; byPackage: Map<string, ReadonlyMap<string, Contract>> }>();
function lookupOf(all: Contracts) {
  let l = lookups.get(all);
  if (!l) lookups.set(all, (l = { folders: new Map(), byPackage: new Map() }));
  return l;
}

/**
 * Read the declared props, emitted events and template of every component defined (via define("tag", Class)) under `dirs`.
 * This is what lets the linter check the attributes and data-on-* written on a child tag in a parent template.
 */
export function contractsFor(dirs: string[], cwd = process.cwd(), ws = new Workspace(), index: ComponentIndex = ws.index(dirs)): Contracts {
  const out: Contracts = new Map();
  const { folders } = lookupOf(out);
  for (const def of index.defines) {
    const c = def.component;
    let contract: Contract | null = null;
    const template = c?.template;
    if (c) {
      const emits = optionEntries(c.call, "emits");
      contract = { props: new Map(optionEntries(c.call, "props").map((e) => [e.key, kindOf(e.value)])), emits: new Set(emits.map((e) => e.key)), bubbles: new Set(emits.filter((e) => /\bbubbles\s*:\s*true\b/.test(e.value)).map((e) => e.key)) };
      if (template && ws.text(template) !== null) contract.template = { file: relative(cwd, template), get html() { return ws.text(template) ?? ""; } };
    }
    const files = [resolve(def.file), ...(def.class ? [def.class.file] : []), ...(template ? [template] : [])];
    out.set(def.tag, [...(out.get(def.tag) ?? []), { pkg: packageOf(dirname(resolve(def.file)), folders), contract, at: `${relative(cwd, def.file)}:${def.line}`, files, ...(template ? { template } : {}) }]);
  }
  return out;
}

/**
 * The contracts that apply to a template in `file`. A tag defined once uses that definition. A tag defined several times
 * (separate apps or packages in one folder) uses the one in the same package as `file`, and is left out when that is not
 * exactly one, so a template is never checked against a component it does not use.
 */
export function contractsAt(all: Contracts, file: string): ReadonlyMap<string, Contract> {
  const { folders, byPackage } = lookupOf(all);
  const pkg = packageOf(dirname(resolve(file)), folders);
  let out = byPackage.get(pkg);
  if (!out) {
    const own = new Map<string, Contract>();
    for (const [tag, defs] of all) {
      const here = defs.length === 1 ? defs : defs.filter((d) => d.pkg === pkg);
      const contract = here.length === 1 ? here[0]?.contract : null;
      if (contract) own.set(tag, contract);
    }
    byPackage.set(pkg, (out = own));
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
const suggest = (name: string, options: string[]): string => {
  const best = options.map((o) => ({ o, d: distance(name, o) })).sort((x, y) => x.d - y.d)[0];
  return best && best.d <= 2 ? ` Did you mean "${best.o}"?` : "";
};

/**
 * Data-flow checks (suggestions, not errors).
 * - prop-forwarding: a child's prop is assigned straight from one of this component's own props
 * - emit-forwarding: the handler of a child's event only emits the event again
 * - props-mutation: a prop is assigned inside the component
 * - custom-event-on-native: a custom event is written on a native element's data-on-*
 * - unknown-prop / invalid-prop-value / unknown-event: the attributes and events written on a child tag do not match
 *   what the child component declares (needs `contracts`, see contractsFor)
 */
export function dataFlow(
  html: string,
  classes: ComponentClass[],
  contracts: ReadonlyMap<string, Contract> = new Map(),
  a: Analysis = analyze(html),
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const report = (rule: keyof typeof DATA_FLOW_RULES, message: string, key?: string, loc?: { line: number; col: number }) => {
    out.push({ rule, severity: "warning", message, ...(loc ?? (key ? at(a, key) : { line: 1, col: 1 })) });
  };

  for (const site of a.eventSites) {
    if (site.tag.includes("-") || NATIVE_EVENTS.has(site.event)) continue;
    const emitters = [...contracts].filter(([, c]) => c.emits.has(site.event));
    if (!emitters.length || emitters.some(([, c]) => c.bubbles.has(site.event))) continue;
    const tags = emitters.map(([tag]) => `<${tag}>`).join(", ");
    report(
      "custom-event-on-native",
      `data-on-${site.event} is on the native element <${site.tag}>, but "${site.event}" is an event that ${tags} emits without bubbles: true, so only the tag of the component that emits it receives it. Fix: put data-on-${site.event} on ${emitters.length === 1 ? tags : "the tag of the component that emits it"}, or declare the event with event<...>({ bubbles: true }) in its emits.`,
      `event:${site.method}`,
    );
  }

  for (const use of a.customUses) {
    const contract = contracts.get(use.tag);
    if (!contract) continue;
    const propNames = [...contract.props.keys()];
    for (const attrName of use.attrs) {
      if (attrName.startsWith("data-") || attrName.startsWith("aria-") || attrName.startsWith("on") || GLOBAL_ATTRS.has(attrName)) continue;
      const prop = camel(attrName);
      const kind = contract.props.get(prop);
      if (kind === undefined) {
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
      }
    }
    for (const ev of use.events) {
      if (contract.emits.has(ev) || NATIVE_EVENTS.has(ev)) continue;
      const emitted = [...contract.emits];
      report(
        "unknown-event",
        `<${use.tag}> does not emit "${ev}", so data-on-${ev} will never fire. ${emitted.length ? `It emits: ${emitted.join(", ")}.` : "It declares no events."}${suggest(ev, emitted)} Fix: declare the event in the child's emits option (emits: { "${ev}": event<...>() }), or fix the name.`,
        undefined,
        use,
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
    for (const site of a.eventSites) {
      if (!site.tag.includes("-")) continue;
      const fn = methodBody(body, site.method);
      if (!fn) continue;
      const inner = fn.slice(1, -1).trim();
      const forwardsSame = new RegExp(`this\\.emit\\(\\s*["']${esc(site.event)}["']`).test(fn);
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

type Unchecked = { first: LintIssue } & ({ cause: "missing" } | { cause: "unreadable"; at: string } | { cause: "ambiguous"; packages: string[] });

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

const contractsOfIndex = new WeakMap<ComponentIndex, Map<string, Contracts>>();

/** The project of the TypeScript files under `dirs`; its index is the workspace's (see Workspace.index for `maxAge`), and its contracts are built once per index. */
export function lintProject(ws: Workspace, dirs: readonly string[], cwd = process.cwd(), maxAge = 0, index = ws.index(dirs, maxAge)): LintProject {
  let byCwd = contractsOfIndex.get(index);
  if (!byCwd) contractsOfIndex.set(index, (byCwd = new Map()));
  let contracts = byCwd.get(cwd);
  if (!contracts) byCwd.set(cwd, (contracts = contractsFor([...dirs], cwd, ws, index)));
  return { ws, index, contracts, cwd };
}

/**
 * What the index says about the things a template's findings were computed from: the classes and modules that use the template, and the definitions of the tags in `tags` that were looked up,
 * with the revision of each TypeScript file as the index read it. The files that were read, the template and the templates of the components in it, are compared by Workspace.result.
 */
function indexSig(p: LintProject, file: string, tags: readonly string[]): string {
  const at = (f: string) => `${f}@${p.index.revs?.get(f) ?? ""}`;
  const owners = (p.index.byTemplate.get(file) ?? []).map((o) => `${at(o.file)}:${o.line}`);
  const importers = (p.index.importers.get(file) ?? []).map((i) => `<${at(i.file)}`);
  const defs = tags.map((tag) => `${tag}=${(p.contracts.get(tag) ?? []).map((d) => `${d.at}:${d.template ?? ""}:${d.files.map(at).join(",")}`).join(";")}`);
  return [p.cwd, ...owners, ...importers, ...defs].join("\n");
}

const keyOf = (groups: readonly Group[], file: string) => `${groups.join(",")}\0${file}`;

/** Whether a TypeScript file that the last findings of `html` were computed from through the index (a class that uses it, the definition of a tag in it) changed since the index read it. */
export function indexBehind(p: LintProject, html: string, groups: readonly Group[]): boolean {
  const file = resolve(html);
  const uses = p.ws.uses(keyOf(groups, file));
  if (!uses) return false;
  const files = [...(p.index.byTemplate.get(file) ?? []).map((o) => o.file), ...(p.index.importers.get(file) ?? []).map((i) => i.file), ...uses.flatMap((tag) => (p.contracts.get(tag) ?? []).flatMap((d) => d.files))];
  return files.some((f) => p.index.revs?.has(f) && p.ws.rev(f) !== p.index.revs.get(f));
}

/** A view of `map` that adds each key it is asked about to `uses`. */
function recording<V>(map: ReadonlyMap<string, V>, uses: Set<string>): ReadonlyMap<string, V> {
  const all = () => {
    for (const k of map.keys()) uses.add(k);
    return map;
  };
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

/** The findings of one template for `groups`, computed again only when something it was computed from changed (`computed` says whether it was). */
export function lintTemplate(p: LintProject, html: string, groups: readonly Group[]): { value: TemplateFindings; computed: boolean } {
  const file = resolve(html);
  return p.ws.result(keyOf(groups, file), file, (tags) => indexSig(p, file, tags), (tags) => {
    const text = p.ws.text(file) ?? "";
    const analysis = analyze(text);
    const here = recording(contractsAt(p.contracts, file), tags);
    const uses = new Map<string, { tag: string; line: number; col: number }>();
    for (const u of analysis.customUses) if (!uses.has(u.tag)) uses.set(u.tag, { tag: u.tag, line: u.line, col: u.col });
    return {
      diagnostics: analysis.diagnostics,
      usage: groups.includes("unused-markup") ? templateUsage(file, text, analysis, p.index, p.ws) : [],
      flow: groups.includes("data-flow") ? dataFlow(text, p.index.byTemplate.get(file) ?? [], here, analysis) : [],
      a11y: groups.includes("a11y") ? checkA11y(text, [], here, analysis.root) : [],
      uses: [...uses.values()],
    };
  });
}

/** `unchecked-custom-elements`: the tags the templates use that `contracts` has no single definition of, reported once at the first use. */
function uncheckedTags(found: readonly { file: string; html: string; uses: TemplateFindings["uses"] }[], contracts: Contracts, cwd: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const unchecked = new Map<string, Unchecked>();
  for (const { file, html, uses } of found) {
    const here = contractsAt(contracts, html);
    for (const use of uses) {
      if (here.has(use.tag) || unchecked.has(use.tag)) continue;
      const defs = contracts.get(use.tag) ?? [];
      const first: LintIssue = { file, line: use.line, col: use.col, rule: "unchecked-custom-elements", severity: "warning", message: "" };
      const pkg = defs.length === 1 ? defs : defs.filter((d) => d.pkg === packageOf(dirname(resolve(html)), lookupOf(contracts).folders));
      if (!defs.length) unchecked.set(use.tag, { first, cause: "missing" });
      else if (pkg.length === 1) unchecked.set(use.tag, { first, cause: "unreadable", at: pkg[0]?.at ?? "" });
      else unchecked.set(use.tag, { first, cause: "ambiguous", packages: defs.map((d) => relative(cwd, d.pkg) || ".") });
    }
  }
  const all = [...unchecked];
  const missing = all.filter(([, u]) => u.cause === "missing");
  const unreadable = all.flatMap(([tag, u]) => (u.cause === "unreadable" ? [`<${tag}> (${u.at})`] : []));
  const ambiguous = all.flatMap(([tag, u]) => (u.cause === "ambiguous" ? [`<${tag}> (${u.packages.join(", ")})`] : []));
  const head = [...missing, ...all.filter(([, u]) => u.cause !== "missing")][0]?.[1].first;
  if (head) {
    const groups = [
      ...(missing.length ? [`No define() in the scanned folders: ${missing.map(([tag]) => `<${tag}>`).join(", ")}`] : []),
      ...(unreadable.length ? [`define() passes a class that is not a class extending Component(...) lint can follow through the imports: ${unreadable.join(", ")}`] : []),
      ...(ambiguous.length ? [`Defined in several packages, and not exactly once in the template's package: ${ambiguous.join(", ")}`] : []),
    ];
    issues.push({
      ...head,
      message: `Lint has no single definition to read for ${unchecked.size === 1 ? "one custom element" : `${unchecked.size} custom elements`} used in the templates, so their attributes and events (unknown-prop, invalid-prop-value, unknown-event) and data-on-click on them (click-semantics) are not checked. ${groups.join(". ")}. This is reported once per run, at the first use of the first tag. Fix: nothing needs to change for elements from another library (pass --ignore=unchecked-custom-elements to silence this); for the project's own components, add their folders to the scanned folders, and keep one definition of a tag per package.`,
    });
  }
  return issues;
}

export interface LintOptions {
  /** Also run the accessibility checks. */
  a11y?: boolean;
  /** The folder issue paths are relative to. Default: the working directory. */
  cwd?: string;
  /** The files, kept between runs. Default: an empty workspace. */
  ws?: Workspace;
  /** The groups to run instead of those `a11y` selects. */
  groups?: readonly Group[];
  index?: ComponentIndex;
  contracts?: Contracts;
}

/**
 * The lint of the templates under `dirs`: unused markup, data flow and, with `a11y`, the accessibility checks, and the templates' own diagnostics.
 * Each template is parsed once for all of them; with a workspace that has run before, only the templates whose files changed are.
 */
export function lintRun(dirs: string[], { a11y = false, cwd = process.cwd(), ws = new Workspace(), groups = ["unused-markup", "data-flow", ...(a11y ? (["a11y"] as const) : [])], ...given }: LintOptions = {}): { issues: LintIssue[]; templates: { dir: string; file: string; diagnostics: Diagnostic[] }[] } {
  const index = given.index ?? ws.index(dirs);
  const p: LintProject = given.contracts ? { ws, index, contracts: given.contracts, cwd } : lintProject(ws, dirs, cwd, 0, index);
  const usage: LintIssue[] = [];
  const flow: LintIssue[] = [];
  const checks: LintIssue[] = [];
  const found: { file: string; html: string; uses: TemplateFindings["uses"] }[] = [];
  const templates: { dir: string; file: string; diagnostics: Diagnostic[] }[] = [];
  for (const dir of dirs) {
    for (const html of listHtml(dir, ws)) {
      const file = relative(cwd, html);
      const r = lintTemplate(p, html, groups).value;
      templates.push({ dir, file: html, diagnostics: r.diagnostics });
      if (r.usage === null) usage.push(noImporter(file, html));
      else for (const d of r.usage) usage.push({ file, ...d });
      for (const d of r.flow) flow.push({ file, ...d });
      for (const d of r.a11y) checks.push({ file, ...d });
      found.push({ file, html, uses: r.uses });
    }
  }
  if (groups.includes("data-flow")) flow.push(...uncheckedTags(found, p.contracts, cwd));
  return { issues: [...usage, ...flow, ...checks], templates };
}

export const runLint = (dirs: string[], options?: LintOptions): LintIssue[] => lintRun(dirs, options).issues;

export function formatIssue(i: LintIssue): string {
  return `${i.file}:${i.line}:${i.col} ${i.severity} [${i.rule}] ${i.message}`;
}
