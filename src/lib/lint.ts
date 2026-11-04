import { readFileSync } from "node:fs";
import { basename, dirname, relative } from "node:path";
import { analyze, listHtml, scanDefines } from "./codegen.ts";
import type { Analysis, Diagnostic } from "./codegen.ts";

export type { Diagnostic };

/** A diagnostic attached to the HTML file it refers to. */
export interface LintIssue extends Diagnostic {
  file: string;
}

const esc = (s: string) => s.replace(/[$]/g, "\\$&");

/** Marker that templateCode() appends when it sees `Component(tpl, { state | props | derive })`. */
const STATEFUL_MARK = "/*nativel:stateful*/";

// ---------------------------------------------------------------------------
// Reading the component class out of TypeScript source (text based, no parser)
// ---------------------------------------------------------------------------

/** Find the local name of `import X from "<spec>"`. */
export function defaultImportName(code: string, spec: string): string | null {
  const m = new RegExp(`import\\s+([A-Za-z_$][\\w$]*)\\s+from\\s+["']${esc(spec)}["']`).exec(code);
  return m?.[1] ?? null;
}

/** From `start`, find the position that closes `open` (skipping strings and comments). */
function matchClose(code: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    const c = code[i] as string;
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < code.length && code[i] !== c; i++) if (code[i] === "\\") i++;
    } else if (c === "/" && code[i + 1] === "/") {
      i = code.indexOf("\n", i);
      if (i < 0) return -1;
    } else if (c === "/" && code[i + 1] === "*") {
      i = code.indexOf("*/", i + 2);
      if (i < 0) return -1;
      i++;
    } else if (c === open) depth++;
    else if (c === close && --depth === 0) return i;
  }
  return -1;
}

export interface ComponentClass {
  /** Full text of the `Component(tpl, {...})` call, parentheses included. */
  call: string;
  /** Text of the class body, braces included. */
  body: string;
}

/** Find every `class X extends Component(<tpl> ...)` and return its call and class body. Empty when none is found. */
export function componentClasses(code: string, htmlSpec: string): ComponentClass[] {
  const local = defaultImportName(code, htmlSpec);
  if (!local) return [];
  const re = new RegExp(`extends\\s+Component\\s*\\(\\s*${esc(local)}\\b`, "g");
  const out: ComponentClass[] = [];
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const call = code.indexOf("(", m.index);
    const callEnd = matchClose(code, call, "(", ")");
    if (callEnd < 0) continue;
    const bodyStart = code.indexOf("{", callEnd);
    if (bodyStart < 0) continue;
    const bodyEnd = matchClose(code, bodyStart, "{", "}");
    if (bodyEnd > 0) out.push({ call: code.slice(call, callEnd + 1), body: code.slice(bodyStart, bodyEnd + 1) });
  }
  return out;
}

const DATA_OPTION = /\b(?:state|props|derive)\b\s*[:,}]/;

/**
 * Return only the text of the classes that extend `Component(<tpl> ...)`,
 * so that a file importing several templates checks each one against its own class only.
 * Falls back to the whole file when no class can be found (for example when Component is wrapped in a helper).
 */
export function templateCode(code: string, htmlSpec: string): string {
  const classes = componentClasses(code, htmlSpec);
  if (classes.length) {
    // The Component(...) arguments matter too: the state / props options live there.
    return classes.map((c) => `${DATA_OPTION.test(c.call) ? `${STATEFUL_MARK}\n` : ""}${c.body}`).join("\n");
  }
  return /Component\s*\([^;]*?\b(?:state|props|derive)\b\s*[:,}]/s.test(code) ? `${STATEFUL_MARK}\n${code}` : code;
}

export function importsHtml(src: string, htmlName: string): boolean {
  return new RegExp(`from\\s+["']\\./${esc(htmlName)}\\.js["']`).test(src);
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
  "missing-handler": "data-on-* refers to a method the class does not define",
  "no-importer": "no TypeScript file imports this template",
} as const;

const at = (a: Analysis, key: string) => a.locs.get(key) ?? { line: 1, col: 1 };

/** Markup that the HTML declares but `code` (the component class text) does not use. */
export function unusedMarkup(html: string, code: string): Diagnostic[] {
  const used = (re: string) => new RegExp(re).test(code);
  const out: Diagnostic[] = [];
  const a = analyze(html);
  const add = (rule: keyof typeof UNUSED_MARKUP_RULES, message: string, key: string) =>
    out.push({ rule, severity: "error", message, ...at(a, key) });
  // Dynamic access (refs[k], text[k], lists[k]) hides which names are used: treat everything as used.
  const dynamic = (obj: string) => used(`\\b${obj}\\[\\s*[^"'\\s\\]]`);
  const dynRefs = dynamic("refs");
  const dynText = dynamic("text");
  const dynLists = dynamic("lists");
  // With a state/props/derive option, {{ }} and data-if bind to same-named fields (names are checked by tsc),
  // so they do not have to appear in the code.
  const stateful = code.includes(STATEFUL_MARK);

  const eventOf = new Map(a.eventSites.map((s) => [s.method, s.event]));
  for (const m of a.events) {
    const def = new RegExp(`(?:^|[\\s;{}])(?:(?:public|override|async|static|readonly)\\s+)*${esc(m)}\\s*[(<=]`, "m");
    if (!def.test(code)) {
      add(
        "missing-handler",
        `data-on-${eventOf.get(m)}="${m}" refers to a method the component class does not define. Fix: add a public method \`${m}(e: Event, hit: EventHit)\` to the class (it must be public so that define() can verify it).`,
        `event:${m}`,
      );
    }
  }
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
      add("unused-list", `data-each="${list}" is never rendered, so the list stays empty. Fix: call this.lists.${list}.replace(items, (item) => item.id, (item, ctx) => { ... }), for example inside render().`, `each:${list}`);
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

/** Check every HTML template under `dirs` against the TypeScript files that import it. */
export function lintUsage(dirs: string[], tsFiles: string[]): LintIssue[] {
  const sources = new Map(tsFiles.map((f) => [f, readFileSync(f, "utf8")]));
  const issues: LintIssue[] = [];
  for (const dir of dirs) {
    for (const html of listHtml(dir)) {
      const name = basename(html);
      const importers = [...sources].filter(([f, src]) => dirname(f) === dirname(html) && importsHtml(src, name));
      const file = relative(process.cwd(), html);
      if (!importers.length) {
        issues.push({
          file,
          rule: "no-importer",
          severity: "error",
          line: 1,
          col: 1,
          message: `No TypeScript file imports this template. Fix: add \`import tpl from "./${name}.js"\` and \`class X extends Component(tpl)\` next to it, or delete the file.`,
        });
        continue;
      }
      const code = importers.map(([, s]) => templateCode(s, `./${name}.js`)).join("\n");
      for (const d of unusedMarkup(readFileSync(html, "utf8"), code)) issues.push({ file, ...d });
    }
  }
  return issues;
}

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
} as const;

/** Common native events. A data-on-* on a native element whose event is not listed here is treated as a custom event. */
const NATIVE_EVENTS = new Set(
  `click dblclick auxclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave contextmenu wheel keydown keyup keypress input beforeinput change submit reset invalid select focus blur focusin focusout scroll resize load unload error abort toggle cancel close drag dragstart dragend dragenter dragleave dragover drop copy cut paste compositionstart compositionupdate compositionend touchstart touchmove touchend touchcancel pointerdown pointerup pointermove pointerover pointerout pointerenter pointerleave pointercancel gotpointercapture lostpointercapture animationstart animationend animationiteration transitionstart transitionend transitionrun transitioncancel play pause ended playing timeupdate volumechange seeking seeked loadeddata loadedmetadata canplay waiting slotchange fullscreenchange online offline hashchange popstate storage message`.split(/\s+/),
);

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

const topLevelKeys = (obj: string): string[] => topLevelEntries(obj).map((e) => e.key);

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
}

function kindOf(valueText: string): PropKind {
  const v = valueText.replace(/\s+as\s[\s\S]*$/, "").trim();
  if (/^(["'`])/.test(v)) return "string";
  if (/^-?\d/.test(v)) return "number";
  if (/^(true|false)$/.test(v)) return "boolean";
  return "other";
}

/**
 * Read the declared props and emitted events of every component defined (via define("tag", Class)) under `dirs`.
 * This is what lets the linter check the attributes and data-on-* written on a child tag in a parent template.
 */
export function contractsFor(dirs: string[]): Map<string, Contract> {
  const out = new Map<string, Contract>();
  for (const dir of dirs) {
    for (const def of scanDefines(dir)) {
      const code = readFileSync(def.file, "utf8");
      const m = new RegExp(`class\\s+${esc(def.className)}\\s+extends\\s+Component\\s*\\(`).exec(code);
      if (!m) continue;
      const open = code.indexOf("(", m.index + m[0].length - 1);
      const close = matchClose(code, open, "(", ")");
      if (close < 0) continue;
      const call = code.slice(open, close + 1);
      out.set(def.tag, {
        props: new Map(optionEntries(call, "props").map((e) => [e.key, kindOf(e.value)])),
        emits: new Set(optionKeys(call, "emits")),
      });
    }
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
  ignore: readonly string[] = [],
  contracts: ReadonlyMap<string, Contract> = new Map(),
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const skip = new Set(ignore);
  const a = analyze(html);
  const report = (rule: keyof typeof DATA_FLOW_RULES, message: string, key?: string, loc?: { line: number; col: number }) => {
    if (!skip.has(rule)) out.push({ rule, severity: "warning", message, ...(loc ?? (key ? at(a, key) : { line: 1, col: 1 })) });
  };

  for (const site of a.eventSites) {
    if (!site.tag.includes("-") && !NATIVE_EVENTS.has(site.event)) {
      report(
        "custom-event-on-native",
        `data-on-${site.event} is on the native element <${site.tag}>, but "${site.event}" is not a native event. Events emitted by a child component do not bubble by default, so only the child's own tag receives them. Fix: put data-on-${site.event} on the child component tag that emits it.`,
        `event:${site.method}`,
      );
    }
  }

  // Child components used by the template: check attributes and events against their declared contract.
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

  // Custom element refs: ref name -> tag
  const customRefs = new Map<string, string>();
  for (const refs of [a.scope.refs, ...[...a.lists.values()].map((l) => l.refs)]) {
    for (const [name, type] of refs) {
      const tag = /El<"([^"]+)">/.exec(type)?.[1];
      if (tag?.includes("-")) customRefs.set(name, tag);
    }
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

/** Run the data-flow checks on every template under `dirs` against the TypeScript files that import it. */
export function lintDataFlow(dirs: string[], tsFiles: string[]): LintIssue[] {
  const sources = new Map(tsFiles.map((f) => [f, readFileSync(f, "utf8")]));
  const contracts = contractsFor(dirs);
  const issues: LintIssue[] = [];
  for (const dir of dirs) {
    for (const html of listHtml(dir)) {
      const name = basename(html);
      const spec = `./${name}.js`;
      const file = relative(process.cwd(), html);
      let classes: ComponentClass[] = [];
      for (const [f, src] of sources) {
        if (dirname(f) === dirname(html) && importsHtml(src, name)) classes = classes.concat(componentClasses(src, spec));
      }
      for (const d of dataFlow(readFileSync(html, "utf8"), classes, [], contracts)) issues.push({ file, ...d });
    }
  }
  return issues;
}

/** `file:line:col severity [rule] message` for a lint issue. */
export function formatIssue(i: LintIssue): string {
  return `${i.file}:${i.line}:${i.col} ${i.severity} [${i.rule}] ${i.message}`;
}

export { topLevelKeys };
