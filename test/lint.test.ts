import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { componentClasses, contractsAt, contractsFor, dataFlow, formatIssue, lintDataFlow, lintUsage, NATIVE_EVENT_NAMES, templateCode, unusedMarkup } from "../src/lib/lint.ts";
import type { Contract } from "../src/lib/lint.ts";

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
  it("templateCode returns only the body of the matching class", () => {
    expect(templateCode(code, "./list.html.js")).toContain("this.refs.title");
    expect(templateCode(code, "./list.html.js")).not.toContain("class Card");
    expect(templateCode(code, "./card.html.js")).not.toContain("this.refs.title.textContent");
  });
  it("reports an unused title in Card (List must not mask it)", () => {
    const d = mkdtempSync(join(tmpdir(), "ts-dom-"));
    writeFileSync(join(d, "list.html"), `<h1 data-ref="title"></h1>`);
    writeFileSync(join(d, "card.html"), `<h1 data-ref="title"></h1>`);
    writeFileSync(join(d, "w.ts"), code);
    const issues = lintUsage([d], [join(d, "w.ts")]);
    expect(issues.map((i) => i.file.endsWith("card.html"))).toEqual([true]);
  });
  it("falls back to the whole file when no class is found", () => {
    expect(templateCode(`import t from "./a.html.js"; make(t); refs.x`, "./a.html")).toContain("refs.x");
  });
});

describe("state and data-on-*", () => {
  const html = `<h1>{{ title }}</h1><p data-if="open"></p><button data-on-click="inc"></button>`;
  it("templateCode detects the state option and adds the marker", () => {
    const code = `import t from "./a.html.js";\nclass A extends Component(t, { state: { title: "" } }) { inc() {} }`;
    expect(templateCode(code, "./a.html.js")).toContain("ts-dom:stateful");
    const shorthand = `import t from "./a.html.js";\nclass A extends Component(t, { state }) { inc() {} }`;
    expect(templateCode(shorthand, "./a.html.js")).toContain("ts-dom:stateful");
    const plain = `import t from "./a.html.js";\nclass A extends Component(t, { shadow: true }) { inc() {} }`;
    expect(templateCode(plain, "./a.html.js")).not.toContain("ts-dom:stateful");
  });
  it("with state, {{ }} and data-if are auto-bound and need not appear in code", () => {
    const code = `import t from "./a.html.js";\nclass A extends Component(t, { state: {} }) { inc() {} }`;
    expect(unusedMarkup(html, templateCode(code, "./a.html.js"))).toEqual([]);
  });
  it("without state, usage is still required", () => {
    const code = `import t from "./a.html.js";\nclass A extends Component(t) { inc() {} }`;
    const rules = unusedMarkup(html, templateCode(code, "./a.html.js")).map((d) => d.rule);
    expect(rules).toEqual(expect.arrayContaining(["unused-text", "unused-if"]));
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
});

describe("lintUsage", () => {
  it("finds unused markup", () => {
    const d = mkdtempSync(join(tmpdir(), "ts-dom-"));
    writeFileSync(join(d, "a.html"), `<b data-ref="used"></b><i data-ref="dead"></i><p data-if="c"></p><u>{{ n }}</u><template data-each="l"><li>{{ x }}</li></template>`);
    writeFileSync(join(d, "a.ts"), `import t from "./a.html.js"; this.refs.used; this.text.n = 1;`);
    const issues = lintUsage([d], [join(d, "a.ts")]);
    expect(issues.map((i) => i.rule).sort()).toEqual(["unused-if", "unused-list", "unused-ref"]);
    expect(issues.every((i) => i.severity === "error" && i.file.endsWith("a.html"))).toBe(true);
    const msgs = issues.map((i) => i.message);
    expect(msgs.some((m) => m.includes(`data-ref="dead"`))).toBe(true);
    expect(msgs.some((m) => m.includes(`"used"`) || m.includes("{{ n }}"))).toBe(false);
  });
  it("HTML that nobody imports", () => {
    const d = mkdtempSync(join(tmpdir(), "ts-dom-"));
    writeFileSync(join(d, "o.html"), `<p></p>`);
    const issue = lintUsage([d], [])[0];
    expect(issue?.rule).toBe("no-importer");
    expect(issue?.message).toContain("Fix:");
  });
  it("finds the importer in another folder or a subfolder and checks the template against its class", () => {
    const d = mkdtempSync(join(tmpdir(), "ts-dom-"));
    mkdirSync(join(d, "views/parts"), { recursive: true });
    mkdirSync(join(d, "app"));
    writeFileSync(join(d, "views/card.html"), `<b data-ref="used"></b><i data-ref="dead"></i>`);
    writeFileSync(join(d, "views/parts/row.html"), `<b data-ref="used"></b>`);
    writeFileSync(join(d, "app/card.ts"), `import t from "../views/card.html.js";\nclass Card extends Component(t) { x() { this.refs.used; } }`);
    writeFileSync(join(d, "views/row.ts"), `import t from "./parts/row.html.js";\nclass Row extends Component(t) { x() { this.refs.used; } }`);
    const issues = lintUsage([d], [join(d, "app/card.ts"), join(d, "views/row.ts")]);
    expect(issues.map((i) => [i.file.endsWith("card.html"), i.rule])).toEqual([[true, "unused-ref"]]);
    expect(issues[0]?.message).toContain(`data-ref="dead"`);
  });
  it("counts an import without .js as the importer, leaving that mistake to ts-dom doctor and tsc", () => {
    const d = mkdtempSync(join(tmpdir(), "ts-dom-"));
    writeFileSync(join(d, "a.html"), `<b data-ref="used"></b><i data-ref="dead"></i>`);
    writeFileSync(join(d, "a.ts"), `import t from "./a.html";\nclass A extends Component(t) { x() { this.refs.used; } }`);
    expect(lintUsage([d], [join(d, "a.ts")]).map((i) => i.rule)).toEqual(["unused-ref"]);
  });
});

describe("reading component classes", () => {
  it("finds a class without a name and a generic class", () => {
    const code = `import t from "./a.html.js";\nexport default class extends Component(t) { a() {} }\nclass B<T extends Map<string, number>> extends Component(t) { b() {} }`;
    expect(componentClasses(code, "./a.html.js").map((c) => c.body)).toEqual(["{ a() {} }", "{ b() {} }"]);
  });
  it("reads type parameters with a default object type or a function type", () => {
    const code = `import t from "./a.html.js";\nclass A<T = {}> extends Component(t, {}) { a() {} }\nclass B<T extends (x: number) => void> extends Component(t) { b() {} }`;
    expect(componentClasses(code, "./a.html.js").map((c) => c.body)).toEqual(["{ a() {} }", "{ b() {} }"]);
  });
  it("does not count an import inside a string or a comment as the template's importer", () => {
    const d = mkdtempSync(join(tmpdir(), "ts-dom-"));
    writeFileSync(join(d, "a.html"), `<p></p>`);
    writeFileSync(join(d, "doc.ts"), `export const sample = 'import tpl from "./a.html.js";';\n// import tpl from "./a.html.js";\n/* import tpl from "./a.html.js"; */\n`);
    expect(lintUsage([d], [join(d, "doc.ts")]).map((i) => i.rule)).toEqual(["no-importer"]);
  });
  it("reads the contract of a generic component", () => {
    const d = mkdtempSync(join(tmpdir(), "ts-dom-"));
    writeFileSync(join(d, "kid.html"), `<p></p>`);
    writeFileSync(join(d, "kid.ts"), `import tpl from "./kid.html.js";\nexport class Kid<T> extends Component(tpl, { props: { label: "" } }) {}\ndefine("x-kid", Kid);`);
    expect([...(contractsFor([d]).get("x-kid")?.[0]?.contract?.props.keys() ?? [])]).toEqual(["label"]);
  });
});

describe("data-flow checks", () => {
  const parentHtml = `<x-kid data-ref="kid" data-on-saved="onSaved"></x-kid><x-kid2 data-on-done="relay"></x-kid2>`;
  const flow = (code: string, html = parentHtml) => dataFlow(html, componentClasses(`import t from "./p.html.js";\n${code}`, "./p.html.js"));

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
  it("custom-event-on-native: an event a child emits without bubbles, written on a native element", () => {
    const kid = (bubbles: string[]): ReadonlyMap<string, Contract> => new Map([["x-kid", { props: new Map(), emits: new Set(["value-change"]), bubbles: new Set(bubbles) }]]);
    const found = dataFlow(`<div data-on-value-change="x"><x-kid></x-kid></div>`, [], kid([])).filter((d) => d.rule === "custom-event-on-native");
    expect(found.map((d) => d.message)).toEqual([expect.stringContaining(`"value-change" is an event that <x-kid> emits without bubbles: true`)]);
    expect(dataFlow(`<div data-on-value-change="x"><x-kid></x-kid></div>`, [], kid(["value-change"]))).toEqual([]);
    expect(dataFlow(`<div data-on-value-change="x"></div>`, [])).toEqual([]);
    expect(dataFlow(`<button data-on-click="x"></button><form data-on-submit="y"></form><x-kid data-on-value-change="z"></x-kid>`, [], kid([]))).toEqual([]);
  });
  it("props / emits key parsing: skips commas inside strings and nested objects", () => {
    const code = `class P extends Component(t, { props: { a: "x, y: 1", b: { c: 1, d: 2 }, "e-f": 0, g: [1, 2] }, state: { z: 1 } }) { render(v) { this.refs.kid.a = v.a; this.refs.kid.c = v.c; this.refs.kid.d = v.d; } }`;
    const r = flow(code).filter((d) => d.rule === "prop-forwarding");
    expect(r.length).toBe(1);
    expect(r[0]?.message).toMatch(/"a"/);
  });
  it("templateCode: the props option also enables stateful mode", () => {
    const code = `import t from "./a.html.js";\nclass A extends Component(t, { props: { label: "" } }) {}`;
    expect(templateCode(code, "./a.html.js")).toContain("ts-dom:stateful");
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
  const setup = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "ts-dom-"));
    for (const [n, c] of Object.entries(files)) writeFileSync(join(dir, n), c);
    return dir;
  };
  const child = `
import tpl from "./kid.html.js";
export class Kid extends Component(tpl, {
  props: { label: "", maxCount: 0, open: false, items: [] as string[] },
  emits: { saved: event<string>(), "value-change": event<number>({ bubbles: true }) },
}) {}
define("x-kid", Kid);`;
  const dir = setup({ "kid.ts": child, "bare.ts": `export class Bare extends Component(tpl) {}\ndefine("x-bare", Bare);` });
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
    expect(contracts.get("x-bare")).toEqual({ props: new Map(), emits: new Set(), bubbles: new Set() });
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
  it("lintDataFlow applies contracts found under the scanned directories", () => {
    const d = setup({
      "kid.ts": child,
      "p.html": `<x-kid labl="a"></x-kid>`,
      "p.ts": `import t from "./p.html.js";\nclass P extends Component(t) {}`,
    });
    const issues = lintDataFlow([d], [join(d, "p.ts"), join(d, "kid.ts")]);
    expect(issues.map((i) => i.rule)).toEqual(["unknown-prop"]);
    expect(issues[0]?.file.endsWith("p.html")).toBe(true);
  });
});

describe("a tag defined more than once under the scanned folders", () => {
  const write = (root: string, files: Record<string, string>) => {
    for (const [n, c] of Object.entries(files)) {
      mkdirSync(join(root, n, ".."), { recursive: true });
      writeFileSync(join(root, n), c);
    }
  };
  const row = (emits: string) => `import tpl from "./row.html.js";\nexport class Row extends Component(tpl, { emits: { ${emits} } }) {}\ndefine("x-row", Row);`;
  const parent = `import t from "./board.html.js";\nclass Board extends Component(t) {}`;
  const board = `<x-row data-on-row-remove="r"></x-row>`;
  const twoApps = () => {
    const root = mkdtempSync(join(tmpdir(), "ts-dom-"));
    write(root, {
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
    const issues = lintDataFlow(dirs, dirs.flatMap((d) => ["row.ts", "board.ts"].map((f) => join(d, f))));
    expect(issues.map((i) => [i.file.endsWith(join("other", "board.html")), i.rule])).toEqual([[true, "unknown-event"]]);
  });
  it("a tag defined twice in one package, or in other packages only, is not checked rather than guessed", () => {
    const root = mkdtempSync(join(tmpdir(), "ts-dom-"));
    write(root, {
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
    const root = mkdtempSync(join(tmpdir(), "ts-dom-"));
    write(root, { "package.json": "{}", "ui/package.json": "{}", "ui/row.ts": row(`"row-toggle": event()`) });
    expect(contractsAt(contractsFor([root]), join(root, "app/board.html")).has("x-row")).toBe(true);
  });

  const unchecked = () => {
    const root = mkdtempSync(join(tmpdir(), "ts-dom-"));
    write(root, {
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
    const issues = lintDataFlow(dirs, dirs.flatMap((d) => ["page.ts", "other.ts", "known.ts", "item.ts"].map((f) => join(d, f)).filter((f) => existsSync(f))));
    const found = issues.filter((i) => i.rule === "unchecked-custom-elements");
    expect(found).toHaveLength(1);
    const [d] = found;
    expect([d?.file.endsWith(join("app", "other.html")), d?.line, d?.col, d?.severity]).toEqual([true, 1, 18, "warning"]);
    expect(d?.message).toContain("No define() in the scanned folders: <wa-input>, <wa-button>. Defined in several packages, and not exactly once in the template's package: <x-item> (");
    expect(d?.message).toContain("(unknown-prop, invalid-prop-value, unknown-event)");
    expect(d?.message).toContain("(click-semantics)");
    expect(d?.message).not.toContain("x-known");
    expect(d?.message).toMatch(/Fix: nothing needs to change for elements from another library \(pass --ignore=unchecked-custom-elements/);
  });
  it("unchecked-custom-elements is not reported when every custom element has one definition", () => {
    const root = twoApps();
    const dirs = [join(root, "app"), join(root, "other")];
    expect(lintDataFlow(dirs, []).filter((i) => i.rule === "unchecked-custom-elements")).toEqual([]);
  });
  it("ts-dom lint reports unchecked-custom-elements once, fails --strict on it, and --ignore silences it", () => {
    const root = unchecked();
    const cli = (...flags: string[]) => spawnSync(process.execPath, [join(process.cwd(), "src/cli.ts"), "lint", "app", "lib1", "lib2", ...flags], { cwd: root, encoding: "utf8" });
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
  it("formats a real issue from lintUsage", () => {
    const d = mkdtempSync(join(tmpdir(), "ts-dom-"));
    writeFileSync(join(d, "o.html"), `<p></p>`);
    const issue = lintUsage([d], [])[0];
    expect(issue).toBeDefined();
    expect(formatIssue(issue!)).toMatch(/o\.html:1:1 error \[no-importer\] .*Fix:/);
  });
});

describe("data-flow: unguarded-input-value", () => {
  const html = `<input data-ref="name"><output data-ref="out"></output>`;
  const rules = async (classBody: string) => {
    const { componentClasses, dataFlow } = await import("../src/lib/lint.ts");
    const code = `import tpl from "./f.html.js";\nclass F extends Component(tpl, { state: { name: "" } }) {\n${classBody}\n}`;
    return dataFlow(html, componentClasses(code, "./f.html.js")).map((d) => d.rule);
  };
  it("flags a render() that writes the value without comparing", async () => {
    expect(await rules(`  override render(v) {\n    this.refs.name.value = v.name;\n  }`)).toEqual(["unguarded-input-value"]);
  });
  it("accepts a comparison on the same line or the line before", async () => {
    expect(await rules(`  override render(v) {\n    if (this.refs.name.value !== v.name) this.refs.name.value = v.name;\n  }`)).toEqual([]);
    expect(await rules(`  override render(v) {\n    if (this.refs.name.value !== v.name)\n      this.refs.name.value = v.name;\n  }`)).toEqual([]);
  });
  it("leaves event handlers and elements that are not form controls alone", async () => {
    expect(await rules(`  clear() {\n    this.refs.name.value = "";\n  }\n  override render(v) {\n    this.refs.out.value = v.name;\n  }`)).toEqual([]);
  });
});

describe("native events: one list, the one lib.dom's element event maps declare", () => {
  const kid: ReadonlyMap<string, Contract> = new Map([["x-kid", { props: new Map(), emits: new Set(["kid-done"]), bubbles: new Set() }]]);
  for (const name of NATIVE_EVENT_NAMES) {
    it(`data-on-${name} on a native element and on a child component tag is a native event`, () => {
      expect(dataFlow(`<div data-on-${name}="h"></div><video data-on-${name}="h"></video><x-kid data-on-${name}="h"></x-kid>`, [], kid)).toEqual([]);
    });
  }
});
