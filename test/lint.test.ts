import { basename, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { componentIndex } from "../src/lib/components.ts";
import { contractsAt, contractsFor, dataFlow, formatIssue, lintRun, TAG_EVENT_NAMES, unusedMarkup } from "../src/lib/lint.ts";
import { ELEMENT_EVENT_NAMES } from "../src/lib/events.ts";
import { runCli, writeTree } from "./helpers.ts";
import type { Contract, Group } from "../src/lib/lint.ts";

const issuesOf = (dirs: string[], group: Group) => lintRun(dirs, { groups: [group] }).issues;
/** The classes of `code`, as the index reads them from a module, that pass the template `html` (a file name next to it) to Component(). */
const classesOf = (code: string, html: string) => {
  const d = writeTree({ "m.ts": code });
  return componentIndex([join(d, "m.ts")]).byTemplate.get(join(d, html)) ?? [];
};
/** The unused-markup rules lint reports for the template `html` used by the module `code`. */
const usage = (html: string, code: string) => {
  const d = writeTree({ "a.html": html, "a.ts": code });
  return issuesOf([d], "unused-markup").map((i) => i.rule);
};

describe("one file importing several templates", () => {
  const code = `
import listTpl from "./list.html.js";
import cardTpl from "./card.html.js";
class List extends Component(listTpl) {
  connected() { this.refs.title.textContent = "List"; }
}
class Card extends Component(cardTpl, { shadow: true }) {
  connected() { const s = "}{ ("; /* } */ }
}`;
  it("each template has only the body of the class that uses it", () => {
    expect(classesOf(code, "list.html").map((c) => c.body)).toEqual([`{\n  connected() { this.refs.title.textContent = "List"; }\n}`]);
    expect(classesOf(code, "card.html").map((c) => c.body)).toEqual([`{\n  connected() { const s = "}{ ("; /* } */ }\n}`]);
  });
  it("reports an unused title in Card (List must not mask it)", () => {
    const d = writeTree({
      "list.html": `<h1 data-ref="title"></h1>`,
      "card.html": `<h1 data-ref="title"></h1>`,
      "w.ts": code,
    });
    const issues = issuesOf([d], "unused-markup");
    expect(issues.map((i) => i.file.endsWith("card.html"))).toEqual([true]);
  });
  it("falls back to the whole file when no class is found", () => {
    expect(usage(`<b data-ref="x"></b><i data-ref="dead"></i>`, `import t from "./a.html.js"; make(t); refs.x`)).toEqual(["unused-ref"]);
  });
});

describe("state and data-on-*", () => {
  const html = `<h1>{{ title }}</h1><p data-if="open"></p><button data-on-click="inc"></button>`;
  it("with state, props or derive, {{ }} and data-if are auto-bound and need not appear in code", () => {
    for (const option of [`{ state: { title: "" } }`, `{ state }`, `{ state: {} }`, `{ props: { label: "" } }`, `{ derive: { x: () => 1 } }`]) {
      expect(usage(html, `import t from "./a.html.js";\nclass A extends Component(t, ${option}) { inc() {} }`)).toEqual([]);
    }
  });
  it("without state, usage is still required", () => {
    expect(usage(html, `import t from "./a.html.js";\nclass A extends Component(t, { shadow: true }) { inc() {} }`).sort()).toEqual(["unused-if", "unused-text"]);
    expect(usage(html, `import t from "./a.html.js";\nclass A extends Component(t) { inc() {} }`).sort()).toEqual(["unused-if", "unused-text"]);
  });
  it("leaves a data-on-* method that does not exist to tsc", () => {
    expect(unusedMarkup(html, `class A { render() {} /*ts-dom:stateful*/ }`)).toEqual([]);
  });
});

describe("dynamic access", () => {
  it("refs[k] / text[k] / lists[k] count as using everything, no false positives", () => {
    const html = `<b data-ref="a"></b><i data-ref="b"></i><u>{{ x }}</u><template data-each="l"><li>{{ y }}</li></template>`;
    expect(unusedMarkup(html, `for (const k of ks) { this.refs[k]; this.text[k] = 1; this.lists[k]; y }`)).toEqual([]);
    // A literal index is not dynamic
    const d = unusedMarkup(html, `this.refs["a"]; y`);
    expect(d.some((x) => x.rule === "unused-ref" && x.message.includes(`data-ref="b"`))).toBe(true);
    expect(d.some((x) => x.message.includes(`data-ref="a"`))).toBe(false);
  });
  it("refs, text or lists held in a variable count as using everything", () => {
    const html = `<b data-ref="a"></b><i data-ref="b"></i><u>{{ x }}</u><template data-each="l"><li>{{ y }}</li></template>`;
    expect(unusedMarkup(html, `const r = this.refs; r.a.focus(); const t = this.text; t.x = 1; const ls = this.lists; ls.l; y`)).toEqual([]);
    const d = unusedMarkup(html, `const { a } = this.refs; a.focus(); this.text.x = 1; this.lists.l; y`);
    expect(d.map((x) => x.message.match(/data-ref="(\w)"/)?.[1])).toEqual(["b"]);
  });
  it("counts the keys destructured from any .refs, renamed or nested, and still reports a ref no one names", () => {
    const html = `<b data-ref="a"></b><i data-ref="b"></i><s data-ref="c"></s>`;
    const unused = (code: string) => unusedMarkup(html, code).map((x) => x.message.match(/data-ref="(\w)"/)?.[1]);
    expect(unused(`const { a, b } = tpl.instantiate().refs;`)).toEqual(["c"]);
    expect(unused(`const inst = tpl.instantiate();\nconst { a } = inst.refs;`)).toEqual(["b", "c"]);
    expect(unused(`const { a: x, "b": y } = this.refs;`)).toEqual(["c"]);
    expect(unused(`const { refs: { c } } = tpl.instantiate();`)).toEqual(["a", "b"]);
    expect(unused(`const { a = null } = this.refs?.x;`)).toEqual(["a", "b", "c"]);
    expect(unused(`const { a, ...rest } = this.refs;`)).toEqual([]);
    expect(unused(`const { a, b } = this.refs\nfocus(a);`)).toEqual(["c"]);
    expect(unused(`const { a, b } = this.refs as R;`)).toEqual(["c"]);
    expect(unused(`const { a } = this.refs satisfies R;`)).toEqual(["b", "c"]);
    expect(unused(`const { a } = this.refs!;`)).toEqual(["b", "c"]);
    expect(unused(`({ a } = this.refs);`)).toEqual(["b", "c"]);
    expect(unused(`const { root, refs: { b: el } } = tpl.instantiate();`)).toEqual(["a", "c"]);
    expect(unused(`const { a } = this.refs.b;`)).toEqual(["a", "c"]);
    expect(unused(`const { a } = this.refs\n  .b;`)).toEqual(["a", "b", "c"]);
    expect(unused(`const { a } = this.refs(b);`)).toEqual(["a", "b", "c"]);
  });
  it("does not take a refs: { ... } outside a destructuring pattern for a destructured ref", () => {
    const html = `<b data-ref="a"></b><i data-ref="b"></i>`;
    const unused = (code: string) => unusedMarkup(html, code).map((x) => x.message.match(/data-ref="(\w)"/)?.[1]);
    expect(unused(`const o = { refs: { a: 1 } };`)).toEqual(["a", "b"]);
    expect(unused(`type T = { refs: { a: HTMLInputElement } };`)).toEqual(["a", "b"]);
    expect(unused(`const v: { refs: { a: HTMLInputElement } } = inst;`)).toEqual(["a", "b"]);
  });
});

describe("unused-markup", () => {
  it("finds unused markup", () => {
    const d = writeTree({
      "a.html": `<b data-ref="used"></b><i data-ref="dead"></i><p data-if="c"></p><u>{{ n }}</u><template data-each="l"><li>{{ x }}</li></template>`,
      "a.ts": `import t from "./a.html.js"; this.refs.used; this.text.n = 1;`,
    });
    const issues = issuesOf([d], "unused-markup");
    expect(issues.map((i) => i.rule).sort()).toEqual(["unused-if", "unused-list", "unused-ref"]);
    expect(issues.every((i) => i.severity === "error" && i.file.endsWith("a.html"))).toBe(true);
    const msgs = issues.map((i) => i.message);
    expect(msgs.some((m) => m.includes(`data-ref="dead"`))).toBe(true);
    expect(msgs.some((m) => m.includes(`"used"`) || m.includes("{{ n }}"))).toBe(false);
  });
  it("HTML that nobody imports", () => {
    const d = writeTree({ "o.html": `<p></p>` });
    const issue = issuesOf([d], "unused-markup")[0];
    expect(issue?.rule).toBe("no-importer");
    expect(issue?.message).toContain("Fix:");
  });
  it("finds the importer in another folder or a subfolder and checks the template against its class", () => {
    const d = writeTree({
      "views/card.html": `<b data-ref="used"></b><i data-ref="dead"></i>`,
      "views/parts/row.html": `<b data-ref="used"></b>`,
      "app/card.ts": `import t from "../views/card.html.js";\nclass Card extends Component(t) { x() { this.refs.used; } }`,
      "views/row.ts": `import t from "./parts/row.html.js";\nclass Row extends Component(t) { x() { this.refs.used; } }`,
    });
    const issues = issuesOf([d], "unused-markup");
    expect(issues.map((i) => [i.file.endsWith("card.html"), i.rule])).toEqual([[true, "unused-ref"]]);
    expect(issues[0]?.message).toContain(`data-ref="dead"`);
  });
  it("does not count an import without .js, the form of another template system, as a Nativele template import", () => {
    const d = writeTree({
      "a.html": `<b data-ref="used"></b><i data-ref="dead"></i>`,
      "a.ts": `import view from "./a.html";\nexport const a = () => view;`,
      "b.html": `<i data-ref="dead"></i>`,
      "b.html.ts": `export default template({});`,
      "b.ts": `import t from "./b.html";\nclass B extends Component(t) { x() {} }`,
    });
    const issues = issuesOf([d], "unused-markup");
    expect(issues.map((i) => [basename(i.file), i.rule])).toEqual([
      ["a.html", "no-importer"],
      ["b.html", "no-importer"],
    ]);
    expect(issues[0]?.message).toContain("scan only the folder with the Nativele templates");
  });
});

describe("reading component classes", () => {
  it("finds a class without a name and a generic class", () => {
    const code = `import t from "./a.html.js";\nexport default class extends Component(t) { a() {} }\nclass B<T extends Map<string, number>> extends Component(t) { b() {} }`;
    expect(classesOf(code, "a.html").map((c) => c.body)).toEqual(["{ a() {} }", "{ b() {} }"]);
  });
  it("reads type parameters with a default object type or a function type", () => {
    const code = `import t from "./a.html.js";\nclass A<T = {}> extends Component(t, {}) { a() {} }\nclass B<T extends (x: number) => void> extends Component(t) { b() {} }`;
    expect(classesOf(code, "a.html").map((c) => c.body)).toEqual(["{ a() {} }", "{ b() {} }"]);
  });
  it("does not count an import inside a string or a comment as the template's importer", () => {
    const d = writeTree({
      "a.html": `<p></p>`,
      "doc.ts": `export const sample = 'import tpl from "./a.html.js";';\n// import tpl from "./a.html.js";\n/* import tpl from "./a.html.js"; */\n`,
    });
    expect(issuesOf([d], "unused-markup").map((i) => i.rule)).toEqual(["no-importer"]);
  });
  it("reads the contract of a generic component", () => {
    const d = writeTree({
      "kid.html": `<p></p>`,
      "kid.ts": `import tpl from "./kid.html.js";\nexport class Kid<T> extends Component(tpl, { props: { label: "" } }) {}\ndefine("x-kid", Kid);`,
    });
    expect([...(contractsFor([d]).get("x-kid")?.[0]?.contract?.props.keys() ?? [])]).toEqual(["label"]);
  });
});

describe("data-flow checks", () => {
  const parentHtml = `<x-kid data-ref="kid" data-on-saved="onSaved"></x-kid><x-kid2 data-on-done="relay"></x-kid2>`;
  const flow = (code: string, html = parentHtml) => dataFlow(html, classesOf(`import t from "./p.html.js";\n${code}`, "p.html"));

  it("prop-forwarding: passes its own prop unchanged to a child component", () => {
    const code = `class P extends Component(t, { props: { name: "", count: 0 }, state: { s: 1 } }) {
      render(v) { this.refs.kid.name = v.name; this.refs.kid.s = v.s; }
    }`;
    const r = flow(code);
    expect(r.length).toBe(1);
    expect(r[0]?.rule).toBe("prop-forwarding");
    expect(r[0]?.severity).toBe("warning");
    expect(r[0]?.message).toMatch(/"name".*x-kid/);
    expect(r[0]?.message).toContain("Fix:");
  });
  it("prop-forwarding: this.props.x and this.x count; state or computed values do not", () => {
    const base = (rhs: string) => `class P extends Component(t, { props: { name: "" }, state: { s: "" } }) { render(v) { this.refs.kid.name = ${rhs}; } }`;
    expect(flow(base("this.props.name")).length).toBe(1);
    expect(flow(base("this.name")).length).toBe(1);
    expect(flow(base("v.s")).length).toBe(0);
    expect(flow(base("v.name.trim()")).length).toBe(0);
    expect(flow(base("`${v.name}!`")).length).toBe(0);
  });
  it("prop-forwarding: only refs to custom elements count, not native elements", () => {
    const code = `class P extends Component(t, { props: { name: "" } }) { render(v) { this.refs.inp.value = v.name; } }`;
    expect(flow(code, `<input data-ref="inp">`).filter((d) => d.rule === "prop-forwarding").length).toBe(0);
  });
  it("emit-forwarding: the handler only re-emits the same event, or is a pure relay", () => {
    const same = `class P extends Component(t, { emits: { saved: event() } }) { onSaved(e) { this.log(); this.emit("saved", e.detail); } }`;
    expect(flow(same).some((d) => d.rule === "emit-forwarding")).toBe(true);
    const relay = `class P extends Component(t, { emits: { finished: event() } }) { relay(e) { this.emit("finished", e.detail); } }`;
    expect(flow(relay).filter((d) => d.rule === "emit-forwarding").length).toBe(1);
  });
  it("emit-forwarding: own logic or emitting a different event does not count", () => {
    const code = `class P extends Component(t, { emits: { changed: event() } }) { onSaved(e) { this.set({ x: 1 }); this.emit("changed"); } relay() { this.set({ y: 1 }); } }`;
    expect(flow(code).filter((d) => d.rule === "emit-forwarding")).toEqual([]);
  });
  it("props-mutation: assigning to props inside the component", () => {
    const code = `class P extends Component(t, { props: { count: 0, label: "" } }) { inc() { this.count = 1; this.count += 2; this.count++; } same() { if (this.label === "x") {} } }`;
    const r = flow(code, `<b></b>`).filter((d) => d.rule === "props-mutation");
    expect(r.length).toBe(1);
    expect(r[0]?.message).toMatch(/"count"/);
  });
  it("constructor-host-change: the constructor gives the element an attribute, class, style or child; code it defines for later does not count", () => {
    const at = (ctor: string) => flow(`class P extends Component(t) { constructor() { super(); ${ctor} } }`).filter((d) => d.rule === "constructor-host-change");
    for (const ctor of [`this.setAttribute("role", "list");`, `this.classList.add("card");`, `this.style.color = "red";`, `this.id = "x";`, `this.ariaLabel = "x";`, `this.append(document.createElement("b"));`]) expect(at(ctor), ctor).toHaveLength(1);
    expect(at(`this.classList.add("card");`)[0]?.message).toMatch(/^The constructor runs this\.classList\.add, .*NotSupportedError.*Fix: do it in connected\(\)/);
    for (const ctor of [`queueMicrotask(() => this.setAttribute("a", ""));`, `this.on(this, "x", () => { this.classList.add("y"); });`, `this.shadowRoot!.append(x);`, `if (this.id === "a") return;`, `const s = "this.append(x)";`]) expect(at(ctor), ctor).toEqual([]);
    expect(flow(`class P extends Component(t) { override connected(): void { this.classList.add("card"); } }`).filter((d) => d.rule === "constructor-host-change")).toEqual([]);
    expect(flow(`class P extends Component(t) { /** Runs after the constructor() has returned. */ override connected(): void { this.classList.add("card"); } }`).filter((d) => d.rule === "constructor-host-change")).toEqual([]);
  });
  it("static-markup-in-code: an element created in the class and given fixed text or a fixed attribute", () => {
    const at = (code: string) => flow(`class P extends Component(t) { override render(v) { ${code} } }`).filter((d) => d.rule === "static-markup-in-code");
    for (const code of [`const b = document.createElement("button"); b.textContent = "Remove";`, `const b = document.createElement("button"); b.type = 'button';`, `const s = document.createElementNS(NS, "svg"); s.setAttribute("viewBox", "0 0 8 8");`, `const p = document.createElement("p"); p.dataset.kind = \`total\`;`, `const b: HTMLButtonElement = document.createElement("button"); b.type = "button";`, `const $el = document.createElement("b"); $el.title = "x";`, `const li = this.ownerDocument.createElement("li"); li.className = "row";`]) expect(at(code), code).toHaveLength(1);
    expect(at(`const b = document.createElement("button"); b.textContent = "Remove";`)[0]?.message).toMatch(/^The class creates <button> with document\.createElement and gives it a fixed value \(b\.textContent = "Remove"\)\..*Fix: write the element in the template/);
    for (const code of [`const td = document.createElement("td"); td.append(c.cell(v.customer));`, `const td = document.createElement("td"); td.textContent = v.name;`, `const b = document.createElement("b"); b.dataset.id = String(v.id); b.setAttribute("aria-label", \`Remove \${v.name}\`);`, `const b = document.createElement("b"); if (b.title === "x") {}`, `const b = document.createElement("button"); b.title = "Remove " + v.name;`, `const row = document.createElement("tr"); row.append(x); this.refs.row.textContent = "Loading";`, `// const b = document.createElement("b"); b.title = "x";`, `const s = 'const b = document.createElement("b"); b.title = "x"';`]) expect(at(code), code).toEqual([]);
    expect(flow(`class P extends Component(t) { render() { const td = document.createElement("td"); td.append(x); } other() { const td = this.refs.status; td.textContent = "Saving"; } }`).filter((d) => d.rule === "static-markup-in-code")).toEqual([]);
  });
  it("dom-node-in-state: state or a prop whose value is typed as DOM nodes", () => {
    const at = (options: string) => flow(`class P extends Component(t, { ${options} }) {}`).filter((d) => d.rule === "dom-node-in-state");
    for (const options of [`state: { children: [] as HTMLElement[] }`, `state: { rows: [] as readonly HTMLTableRowElement[] }`, `state: { frag: null as DocumentFragment | null }`, `state: { els: [] as Array<HTMLElement> }`, `state: { picked: new Set<HTMLElement>() }`, `state: { rows: [] as { el: HTMLElement }[] }`, `props: { items: null as NodeList | null }`]) expect(at(options), options).toHaveLength(1);
    expect(at(`state: { children: [] as HTMLElement[] }`)[0]?.message).toMatch(/^The state "children" holds HTMLElement values\..*Fix: keep the data the nodes show in state/);
    for (const options of [`state: { orders: [] as readonly Order[] }`, `props: { columns: [] as readonly Column[], customer: null as CustomerTotal | null }`, `state: { nodeCount: 0 }`, `derive: { el: (v) => v.x as Element }`, `props: { anchor: null as Element | null }`, `props: { icon: null as SVGElement | null }`, `state: { names: [] as string[] }`, `props: { cell: null as (() => Node | readonly Node[]) | null }`]) expect(at(options), options).toEqual([]);
  });
  it("callback-without-super: a Custom Elements callback or observedAttributes overridden without super", () => {
    const at = (members: string) => flow(`class P extends Component(t) { ${members} }`).filter((d) => d.rule === "callback-without-super");
    for (const members of [`static observedAttributes = ["class"];`, `static get observedAttributes() { return ["class"]; }`, `attributeChangedCallback(n, o, v) { this.sync(n); }`, `override connectedCallback(): void { this.go(); }`, `disconnectedCallback() { this.stop(); }`]) expect(at(members), members).toHaveLength(1);
    expect(at(`static observedAttributes = ["class"];`)[0]?.message).toMatch(/^The class replaces observedAttributes without super\.observedAttributes\..*Fix: static get observedAttributes\(\)/);
    for (const members of [`static get observedAttributes() { return [...super.observedAttributes, "class"]; }`, `static observedAttributes = [...super.observedAttributes, "class"];`, `attributeChangedCallback(n, o, v) { super.attributeChangedCallback(n, o, v); this.sync(n); }`, `override connectedCallback(): void { super.connectedCallback(); this.go(); }`, `override connected(): void { this.go(); }`]) expect(at(members), members).toEqual([]);
  });
  it("custom-event-on-native: an event a child emits without bubbles, written on a native element", () => {
    const kid = (bubbles: string[]): ReadonlyMap<string, Contract> => new Map([["x-kid", { props: new Map(), emits: new Set(["value-change"]), bubbles: new Set(bubbles) }]]);
    const found = dataFlow(`<div data-on-value-change="x"><x-kid></x-kid></div>`, [], kid([])).filter((d) => d.rule === "custom-event-on-native");
    expect(found.map((d) => d.message)).toEqual([expect.stringContaining(`"value-change" is an event that <x-kid> emits without bubbles: true`)]);
    expect(dataFlow(`<div data-on-value-change="x"><x-kid></x-kid></div>`, [], kid(["value-change"]))).toEqual([]);
    expect(dataFlow(`<div data-on-value-change="x"></div>`, [])).toEqual([]);
    expect(dataFlow(`<button data-on-click="x"></button><form data-on-submit="y"></form><x-kid data-on-value-change="z"></x-kid>`, [], kid([]))).toEqual([]);
  });
  it("an event named like a window or media event is read from the child's emits", () => {
    const kid = (bubbles: string[]): ReadonlyMap<string, Contract> => new Map([["x-kid", { props: new Map(), emits: new Set(["message"]), bubbles: new Set(bubbles) }]]);
    const rules = (html: string, b: string[] = []) => dataFlow(html, [], kid(b)).map((d) => d.rule);
    expect(rules(`<x-kid data-on-message="h"></x-kid>`)).toEqual([]);
    expect(rules(`<x-kid data-on-mesage="h"></x-kid>`)).toEqual(["unknown-event"]);
    expect(rules(`<div data-on-message="h"><x-kid></x-kid></div>`)).toEqual(["custom-event-on-native"]);
    expect(rules(`<div data-on-message="h"><x-kid></x-kid></div>`, ["message"])).toEqual([]);
  });
  it("custom-event-on-native: an event the element itself fires natively is its own event", () => {
    const kid: ReadonlyMap<string, Contract> = new Map([["x-kid", { props: new Map(), emits: new Set(["enterpictureinpicture", "encrypted", "afterprint"]), bubbles: new Set() }]]);
    const rules = (html: string) => dataFlow(html, [], kid).map((d) => d.rule);
    expect(rules(`<video data-on-enterpictureinpicture="h"></video><audio data-on-encrypted="h"></audio><svg data-on-afterprint="h"></svg>`)).toEqual([]);
    expect(rules(`<div data-on-enterpictureinpicture="h"></div><audio data-on-enterpictureinpicture="h"></audio><div data-on-afterprint="h"></div>`)).toEqual(["custom-event-on-native", "custom-event-on-native", "custom-event-on-native"]);
  });
  it("props / emits key parsing: skips commas inside strings and nested objects", () => {
    const code = `class P extends Component(t, { props: { a: "x, y: 1", b: { c: 1, d: 2 }, "e-f": 0, g: [1, 2] }, state: { z: 1 } }) { render(v) { this.refs.kid.a = v.a; this.refs.kid.c = v.c; this.refs.kid.d = v.d; } }`;
    const r = flow(code).filter((d) => d.rule === "prop-forwarding");
    expect(r.length).toBe(1);
    expect(r[0]?.message).toMatch(/"a"/);
  });
});

describe("unusedMarkup locations and messages", () => {
  const html = [
    `<div>`, // line 1
    `  <b data-ref="r"></b>`, // line 2
    `  <p data-if="open"></p>`, // line 3
    `  <u>{{ t }}</u>`, // line 4
    `  <template data-each="items"><li>{{ n }}</li></template>`, // line 5
    `  <button data-on-click="go"></button>`, // line 6
    `</div>`,
  ].join("\n");
  const found = unusedMarkup(html, `class A {}`);
  const byRule = (rule: string) => found.find((d) => d.rule === rule);

  it("reports the HTML line and column of each marker", () => {
    expect(byRule("unused-ref")).toMatchObject({ line: 2, col: 3 });
    expect(byRule("unused-if")).toMatchObject({ line: 3, col: 3 });
    expect(byRule("unused-text")?.line).toBe(4);
    expect(byRule("unused-list")).toMatchObject({ line: 5, col: 3 });
  });
  it("uses severity error, names the marker and contains a Fix hint", () => {
    expect(found.map((d) => d.rule).sort()).toEqual(["unused-if", "unused-list", "unused-ref", "unused-text"]);
    for (const d of found) {
      expect(d.severity).toBe("error");
      expect(d.message).toContain("Fix:");
    }
    expect(byRule("unused-ref")?.message).toContain(`data-ref="r"`);
    expect(byRule("unused-if")?.message).toContain(`data-if="open"`);
    expect(byRule("unused-text")?.message).toContain("{{ t }}");
    expect(byRule("unused-list")?.message).toContain(`data-each="items"`);
  });
  it("reports unused-item-name for names inside a list item", () => {
    const d = unusedMarkup(`<template data-each="l">\n  <li data-ref="zzz"></li>\n</template>`, `this.lists.l.replace()`);
    expect(d.map((x) => x.rule)).toEqual(["unused-item-name"]);
    expect(d[0]).toMatchObject({ line: 2, col: 3 });
    expect(d[0]?.message).toContain("Fix:");
  });
});

describe("child component contract rules", () => {
  const child = `
import tpl from "./kid.html.js";
export class Kid extends Component(tpl, {
  props: { label: "", maxCount: 0, open: false, items: [] as string[] },
  emits: { saved: event<string>(), "value-change": event<number>({ bubbles: true }) },
}) {}
define("x-kid", Kid);`;
  const dir = writeTree({
    "kid.ts": child,
    "bare.ts": `export class Bare extends Component(tpl) {}\ndefine("x-bare", Bare);`,
  });
  const contracts = contractsAt(contractsFor([dir]), join(dir, "p.html"));
  const run = (html: string, c: ReadonlyMap<string, Contract> = contracts) => dataFlow(html, [], c);

  it("contractsFor reads props (with kinds) and emits from the child's source", () => {
    const k = contracts.get("x-kid");
    expect(k).toBeDefined();
    expect([...(k?.props ?? [])]).toEqual([
      ["label", "string"],
      ["maxCount", "number"],
      ["open", "boolean"],
      ["items", "other"],
    ]);
    expect([...(k?.emits ?? [])]).toEqual(["saved", "value-change"]);
    expect([...(k?.bubbles ?? [])]).toEqual(["value-change"]);
    expect(contracts.get("x-bare")).toEqual({ props: new Map(), emits: new Set(), bubbles: new Set(), unread: { cause: "template-unfollowed", at: `${relative(process.cwd(), join(dir, "bare.ts"))}:1` } });
    expect(contracts.has("x-other")).toBe(false);
  });
  it("accepts declared props (kebab-case maps to camelCase) and declared events", () => {
    expect(run(`<x-kid label="a" max-count="3" open data-on-saved="s" data-on-value-change="v"></x-kid>`)).toEqual([]);
  });
  it("unknown-prop: reports an undeclared attribute with its location and a suggestion", () => {
    const d = run(`<p></p>\n  <x-kid labl="a"></x-kid>`);
    expect(d.length).toBe(1);
    expect(d[0]).toMatchObject({ rule: "unknown-prop", severity: "warning", line: 2, col: 3 });
    expect(d[0]?.message).toContain("labl");
    expect(d[0]?.message).toContain(`Did you mean "label"?`);
    expect(d[0]?.message).toContain("Fix:");
  });
  it("unknown-prop: no suggestion when nothing is close; lists declared props", () => {
    const d = run(`<x-kid zzzzzzzz="1"></x-kid>`);
    expect(d[0]?.rule).toBe("unknown-prop");
    expect(d[0]?.message).not.toContain("Did you mean");
    expect(d[0]?.message).toContain("label");
  });
  it("unknown-prop: says so when the child declares no props", () => {
    const d = run(`<x-bare foo="1"></x-bare>`);
    expect(d[0]?.rule).toBe("unknown-prop");
    expect(d[0]?.message).toContain("no props");
  });
  it("invalid-prop-value: a non-primitive prop set via attribute", () => {
    const d = run(`<x-kid items="a,b"></x-kid>`);
    expect(d.map((x) => x.rule)).toEqual(["invalid-prop-value"]);
    expect(d[0]?.severity).toBe("warning");
    expect(d[0]?.message).toContain("items");
    expect(d[0]?.message).toContain("Fix:");
  });
  it("unknown-event: an event the child does not emit, with a suggestion", () => {
    const d = run(`<x-kid data-on-savd="s"></x-kid>`);
    expect(d.length).toBe(1);
    expect(d[0]).toMatchObject({ rule: "unknown-event", severity: "warning", line: 1, col: 1 });
    expect(d[0]?.message).toContain("savd");
    expect(d[0]?.message).toContain(`Did you mean "saved"?`);
    expect(d[0]?.message).toContain("Fix:");
  });
  it("unknown-event: says so when the child declares no events", () => {
    const d = run(`<x-bare data-on-ping="p"></x-bare>`);
    expect(d[0]?.rule).toBe("unknown-event");
    expect(d[0]?.message).toContain("no events");
  });
  it("does not warn for native events on a child tag", () => {
    expect(run(`<x-kid data-on-click="a" data-on-keydown="b" data-on-focus="c"></x-kid>`)).toEqual([]);
  });
  it("does not warn for data-*, aria-*, class, id and slot attributes", () => {
    expect(run(`<x-kid data-ref="k" data-foo="1" aria-label="x" class="c" id="i" slot="s" style="color:red" title="t"></x-kid>`)).toEqual([]);
  });
  it("does not warn for a tag with no known contract", () => {
    expect(run(`<x-unknown foo="1" data-on-whatever="w"></x-unknown>`)).toEqual([]);
    expect(dataFlow(`<x-kid foo="1" data-on-nope="n"></x-kid>`, [])).toEqual([]);
  });
  it("a hand-built contract works too", () => {
    const hand = new Map<string, Contract>([["x-hand", { props: new Map([["size", "number" as const]]), emits: new Set(["done"]), bubbles: new Set() }]]);
    expect(run(`<x-hand size="1" data-on-done="d"></x-hand>`, hand)).toEqual([]);
    expect(run(`<x-hand sise="1"></x-hand>`, hand)[0]?.message).toContain(`Did you mean "size"?`);
  });
  it("data-flow applies contracts found under the scanned directories", () => {
    const d = writeTree({
      "kid.ts": child,
      "p.html": `<x-kid labl="a"></x-kid>`,
      "p.ts": `import t from "./p.html.js";\nclass P extends Component(t) {}`,
    });
    const issues = issuesOf([d], "data-flow");
    expect(issues.map((i) => i.rule)).toEqual(["unknown-prop"]);
    expect(issues[0]?.file.endsWith("p.html")).toBe(true);
  });
});

describe("a tag defined more than once under the scanned folders", () => {
  const row = (emits: string) => `import tpl from "./row.html.js";\nexport class Row extends Component(tpl, { emits: { ${emits} } }) {}\ndefine("x-row", Row);`;
  const parent = `import t from "./board.html.js";\nclass Board extends Component(t) {}`;
  const board = `<x-row data-on-row-remove="r"></x-row>`;
  const twoApps = () => {
    const root = writeTree({
      "package.json": "{}",
      "app/row.ts": row(`"row-toggle": event(), "row-remove": event()`),
      "app/board.html": board,
      "app/board.ts": parent,
      "other/package.json": "{}",
      "other/row.ts": row(`"row-toggle": event()`),
      "other/board.html": board,
      "other/board.ts": parent,
    });
    return root;
  };

  it("each template is checked against the definition in its own package", () => {
    const root = twoApps();
    const all = contractsFor([root]);
    expect([...(contractsAt(all, join(root, "app/board.html")).get("x-row")?.emits ?? [])]).toEqual(["row-toggle", "row-remove"]);
    expect([...(contractsAt(all, join(root, "other/board.html")).get("x-row")?.emits ?? [])]).toEqual(["row-toggle"]);
  });
  it("an event is reported only when the own package's child does not emit it", () => {
    const root = twoApps();
    const all = contractsFor([root]);
    const flow = (dir: string) => dataFlow(board, [], contractsAt(all, join(root, dir, "board.html"))).map((d) => d.rule);
    expect(flow("app")).toEqual([]);
    expect(flow("other")).toEqual(["unknown-event"]);
  });
  it("ts-dom lint with several folders applies the same rule", () => {
    const root = twoApps();
    const dirs = [join(root, "app"), join(root, "other")];
    const issues = issuesOf(dirs, "data-flow");
    expect(issues.map((i) => [i.file.endsWith(join("other", "board.html")), i.rule])).toEqual([[true, "unknown-event"]]);
  });
  it("a tag defined twice in one package, or in other packages only, is not checked rather than guessed", () => {
    const root = writeTree({
      "package.json": "{}",
      "a/row.ts": row(`"row-toggle": event()`),
      "b/row.ts": row(`"row-open": event()`),
      "lib1/package.json": "{}",
      "lib1/item.ts": row(`"one": event()`).replace("x-row", "x-item"),
      "lib2/package.json": "{}",
      "lib2/item.ts": row(`"two": event()`).replace("x-row", "x-item"),
    });
    const at = contractsAt(contractsFor([root]), join(root, "board.html"));
    expect(at.has("x-row")).toBe(false);
    expect(at.has("x-item")).toBe(false);
  });
  it("a tag defined once applies everywhere, also from another package", () => {
    const root = writeTree({
      "package.json": "{}",
      "ui/package.json": "{}",
      "ui/row.ts": row(`"row-toggle": event()`),
    });
    expect(contractsAt(contractsFor([root]), join(root, "app/board.html")).has("x-row")).toBe(true);
  });

  const unchecked = () => {
    const root = writeTree({
      "package.json": "{}",
      "app/page.html": `<section>\n  <wa-input></wa-input><x-known></x-known>\n</section>\n`,
      "app/page.ts": `import t from "./page.html.js";\nclass Page extends Component(t) {}`,
      "app/other.html": `<x-item></x-item><wa-input></wa-input><wa-button data-on-click="go"></wa-button>`,
      "app/other.ts": `import t from "./other.html.js";\nclass Other extends Component(t) { go() {} }`,
      "app/known.ts": row(`"one": event()`).replace("x-row", "x-known"),
      "lib1/package.json": "{}",
      "lib1/item.ts": row(`"one": event()`).replace("x-row", "x-item"),
      "lib2/package.json": "{}",
      "lib2/item.ts": row(`"two": event()`).replace("x-row", "x-item"),
    });
    return root;
  };
  it("unchecked-custom-elements: one warning per run lists the tags without a definition and the ambiguous ones, at the first use", () => {
    const root = unchecked();
    const dirs = [join(root, "app"), join(root, "lib1"), join(root, "lib2")];
    const issues = issuesOf(dirs, "data-flow");
    const found = issues.filter((i) => i.rule === "unchecked-custom-elements");
    expect(found).toHaveLength(1);
    const [d] = found;
    expect([d?.file.endsWith(join("app", "other.html")), d?.line, d?.col, d?.severity]).toEqual([true, 1, 18, "warning"]);
    expect(d?.message).toContain("<wa-input>, <wa-button>: no define() in the scanned folders or in a Nativele component package among the package's dependencies, and no custom elements manifest of the package or its dependencies. <x-item> (");
    expect(d?.message).toContain("): defined in several packages, and not exactly once in the template's package.");
    expect(d?.message).toContain("otherwise for <wa-input> and <wa-button>, when the package defines it, add the folder with its define() to the scanned folders; when another package of the workspace or a published package does, list that package in this package's dependencies (a Nativele component package is read from the modules its exports name; another library's elements are checked when its package declares a custom elements manifest, the customElements field of its package.json); for <x-item>, keep one define() of a tag per package.");
    expect(d?.message).toContain("(unknown-prop, invalid-prop-value, unknown-event)");
    expect(d?.message).toContain("(click-semantics)");
    expect(d?.message).not.toContain("x-known");
    expect(d?.message).toMatch(/Fix: nothing needs to change for elements that are not Nativele components, such as another library's \(pass --ignore=unchecked-custom-elements/);
  });
  it("unchecked-custom-elements is not reported when every custom element has one definition", () => {
    const root = twoApps();
    const dirs = [join(root, "app"), join(root, "other")];
    expect(issuesOf(dirs, "data-flow").filter((i) => i.rule === "unchecked-custom-elements")).toEqual([]);
  });
  it("ts-dom lint reports unchecked-custom-elements once, fails --strict on it, and --ignore silences it", () => {
    const root = unchecked();
    const cli = (...flags: string[]) => runCli(["lint", "app", "lib1", "lib2", ...flags], root);
    const strict = cli("--strict");
    expect(strict.stderr.match(/\[unchecked-custom-elements\]/g)).toHaveLength(1);
    expect(strict.stderr).toMatch(/^app\/other\.html:1:18 warning \[unchecked-custom-elements\] /m);
    expect(strict.status).toBe(1);
    const ignored = cli("--strict", "--ignore=unchecked-custom-elements");
    expect(ignored.stderr).not.toContain("unchecked-custom-elements");
    expect(ignored.status).toBe(0);
  }, 30_000);
});

describe("formatIssue", () => {
  it("prints file:line:col severity [rule] message", () => {
    expect(formatIssue({ file: "src/a.html", rule: "unused-ref", severity: "error", message: "Bad. Fix: do it.", line: 3, col: 5 })).toBe(
      "src/a.html:3:5 error [unused-ref] Bad. Fix: do it.",
    );
    expect(formatIssue({ file: "b.html", rule: "unknown-prop", severity: "warning", message: "m", line: 1, col: 1 })).toBe("b.html:1:1 warning [unknown-prop] m");
  });
  it("formats a real issue from the unused-markup group", () => {
    const d = writeTree({ "o.html": `<p></p>` });
    const issue = issuesOf([d], "unused-markup")[0];
    expect(issue).toBeDefined();
    expect(formatIssue(issue!)).toMatch(/o\.html:1:1 error \[no-importer\] .*Fix:/);
  });
});

describe("data-flow: unguarded-input-value", () => {
  const html = `<input data-ref="name"><output data-ref="out"></output>`;
  const rules = async (classBody: string) => {
    const code = `import tpl from "./f.html.js";\nclass F extends Component(tpl, { state: { name: "" } }) {\n${classBody}\n}`;
    return dataFlow(html, classesOf(code, "f.html")).map((d) => d.rule);
  };
  it("flags a render() that writes the value without comparing", async () => {
    expect(await rules(`  override render(v) {\n    this.refs.name.value = v.name;\n  }`)).toEqual(["unguarded-input-value"]);
  });
  it("accepts a comparison on the same line or the line before", async () => {
    expect(await rules(`  override render(v) {\n    if (this.refs.name.value !== v.name) this.refs.name.value = v.name;\n  }`)).toEqual([]);
    expect(await rules(`  override render(v) {\n    if (this.refs.name.value !== v.name)\n      this.refs.name.value = v.name;\n  }`)).toEqual([]);
  });
  it("treats value, valueAsNumber and valueAsDate as one set", async () => {
    expect(await rules(`  override render(v) {\n    if (this.refs.name.valueAsNumber !== v.n) this.refs.name.value = String(v.n);\n  }`)).toEqual([]);
    expect(await rules(`  override render(v) {\n    if (this.refs.name.valueAsNumber === v.n) return;\n    this.refs.name.value = String(v.n);\n  }`)).toEqual([]);
    expect(await rules(`  override render(v) {\n    if (this.refs.name.valueAsDate !== v.d) this.refs.name.valueAsDate = v.d;\n  }`)).toEqual([]);
    expect(await rules(`  override render(v) {\n    this.refs.name.valueAsNumber = v.n;\n  }`)).toEqual(["unguarded-input-value"]);
    expect(await rules(`  override render(v) {\n    this.refs.name.valueAsDate = v.d;\n  }`)).toEqual(["unguarded-input-value"]);
  });
  it("counts as the guard only a comparison that gates the write", async () => {
    expect(await rules(`  override render(v) {\n    if (v.name !== this.refs.name.value) { this.refs.name.value = v.name; }\n  }`)).toEqual([]);
    expect(await rules(`  override render(v) {\n    if (this.refs.name.value != v.name) {\n      this.refs.name.value = v.name;\n    }\n  }`)).toEqual([]);
    expect(await rules(`  override render(v) {\n    for (const x of v.xs) {\n      if (this.refs.name.value == x) continue;\n      this.refs.name.value = x;\n    }\n  }`)).toEqual([]);
    expect(await rules(`  override render(v) {\n    if (this.refs.name.value === v.prev) log();\n    this.refs.name.value = v.name;\n  }`)).toEqual(["unguarded-input-value"]);
    expect(await rules(`  override render(v) {\n    if (this.refs.name.value !== v.prev) return;\n    this.refs.name.value = v.name;\n  }`)).toEqual(["unguarded-input-value"]);
    expect(await rules(`  override render(v) {\n    this.refs.name.value = v.name; if (this.refs.name.value !== v.name) log();\n  }`)).toEqual(["unguarded-input-value"]);
    expect(await rules(`  override render(v) {\n    const same = this.refs.name.value === v.name;\n    this.refs.name.value = v.name;\n  }`)).toEqual(["unguarded-input-value"]);
  });
  it("leaves event handlers and elements that are not form controls alone", async () => {
    expect(await rules(`  clear() {\n    this.refs.name.value = "";\n  }\n  override render(v) {\n    this.refs.out.value = v.name;\n  }`)).toEqual([]);
  });
});

describe("native events: one list, the one lib.dom's element event maps declare", () => {
  const kid: ReadonlyMap<string, Contract> = new Map([["x-kid", { props: new Map(), emits: new Set(["kid-done"]), bubbles: new Set() }]]);
  for (const name of new Set([...ELEMENT_EVENT_NAMES, ...Object.values(TAG_EVENT_NAMES).flat()])) {
    it(`data-on-${name} on a native element and on a child component tag is a native event`, () => {
      expect(dataFlow(`<div data-on-${name}="h"></div><video data-on-${name}="h"></video><x-kid data-on-${name}="h"></x-kid>`, [], kid)).toEqual([]);
    });
  }
});

describe("a component class that extends another component class", () => {
  it("has the contract of the Component(...) class it extends, also through an import and two levels", () => {
    const H = `import { Component, define, event } from "@nativele/ts-dom";\n`;
    const root = writeTree({
      "base.html": `<button data-on-click="press">{{ label }}</button>\n`,
      "base.ts": `${H}import tpl from "./base.html.js";\nexport class Base extends Component(tpl, { props: { label: "" }, emits: { pick: event() } }) { press() { this.emit("pick"); } }\n`,
      "fancy.ts": `${H}import { Base } from "./base.js";\ninterface Focusable { focus(): void }\nexport class Mid<T = { a: string }> extends Base {}\nexport class Fancy extends Mid<{ a: string }> implements Focusable { override connected(): void {} }\ndefine("x-fancy", Fancy);\n`,
      "page.html": `<x-fancy lable="Go" data-on-pik="go"></x-fancy>\n`,
      "page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) { go() {} }\ndefine("x-page", Page);\n`,
    });
    const issues = lintRun([root], { cwd: root, groups: ["data-flow"] }).issues;
    expect(issues.map((i) => [i.file, i.rule])).toEqual([
      ["page.html", "unknown-prop"],
      ["page.html", "unknown-event"],
    ]);
  });
});
