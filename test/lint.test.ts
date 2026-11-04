import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { componentClasses, contractsFor, dataFlow, formatIssue, lintDataFlow, lintUsage, templateCode, unusedMarkup } from "../src/lib/lint.ts";
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
  it("reports a data-on-* method that does not exist, and stays quiet when it does", () => {
    const missing = unusedMarkup(html, `class A { render() {} }`).filter((d) => d.rule === "missing-handler");
    expect(missing.length).toBe(1);
    expect(missing[0]?.message).toContain("inc");
    for (const def of [`inc() {}`, `inc = () => {}`, `override inc(): void {}`, `async inc() {}`, `public inc(e: Event) {}`]) {
      expect(unusedMarkup(html, `class A { ${def} /*ts-dom:stateful*/ }`)).toEqual([]);
    }
    // A mere call (this.inc()) is not a definition
    expect(unusedMarkup(html, `class A { x() { this.inc(); } /*ts-dom:stateful*/ }`).length).toBe(1);
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
});

describe("data-flow checks", () => {
  const parentHtml = `<x-kid data-ref="kid" data-on-saved="onSaved"></x-kid><x-kid2 data-on-done="relay"></x-kid2>`;
  const flow = (code: string, html = parentHtml, ignore: string[] = []) =>
    dataFlow(html, componentClasses(`import t from "./p.html.js";\n${code}`, "./p.html.js"), ignore);

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
    expect(flow(code, `<input data-ref="inp">`).length).toBe(0);
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
  it("custom-event-on-native: a custom event written on a native element", () => {
    expect(dataFlow(`<div data-on-value-change="x"></div>`, []).some((d) => d.rule === "custom-event-on-native")).toBe(true);
    expect(dataFlow(`<button data-on-click="x"></button><form data-on-submit="y"></form><x-kid data-on-value-change="z"></x-kid>`, [])).toEqual([]);
  });
  it("ignore turns off individual checks", () => {
    const code = `class P extends Component(t, { props: { name: "" } }) { render(v) { this.refs.kid.name = v.name; } }`;
    expect(flow(code, parentHtml, ["prop-forwarding"])).toEqual([]);
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
    expect(byRule("missing-handler")).toMatchObject({ line: 6, col: 3 });
  });
  it("uses severity error, names the marker and contains a Fix hint", () => {
    expect(found.map((d) => d.rule).sort()).toEqual(["missing-handler", "unused-if", "unused-list", "unused-ref", "unused-text"]);
    for (const d of found) {
      expect(d.severity).toBe("error");
      expect(d.message).toContain("Fix:");
    }
    expect(byRule("unused-ref")?.message).toContain(`data-ref="r"`);
    expect(byRule("unused-if")?.message).toContain(`data-if="open"`);
    expect(byRule("unused-text")?.message).toContain("{{ t }}");
    expect(byRule("unused-list")?.message).toContain(`data-each="items"`);
    expect(byRule("missing-handler")?.message).toContain(`"go"`);
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
  emits: { saved: event<string>(), "value-change": event<number>() },
}) {}
define("x-kid", Kid);`;
  const dir = setup({ "kid.ts": child, "bare.ts": `export class Bare extends Component(tpl) {}\ndefine("x-bare", Bare);` });
  const contracts = contractsFor([dir]);
  const run = (html: string, ignore: string[] = [], c: ReadonlyMap<string, Contract> = contracts) => dataFlow(html, [], ignore, c);

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
    expect(contracts.get("x-bare")).toEqual({ props: new Map(), emits: new Set() });
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
    const hand = new Map<string, Contract>([["x-hand", { props: new Map([["size", "number" as const]]), emits: new Set(["done"]) }]]);
    expect(run(`<x-hand size="1" data-on-done="d"></x-hand>`, [], hand)).toEqual([]);
    expect(run(`<x-hand sise="1"></x-hand>`, [], hand)[0]?.message).toContain(`Did you mean "size"?`);
  });
  it("ignore silences each of the new rules independently", () => {
    const html = `<x-kid labl="a" items="x" data-on-savd="s"></x-kid>`;
    const rules = (ignore: string[]) => run(html, ignore).map((d) => d.rule).sort();
    expect(rules([])).toEqual(["invalid-prop-value", "unknown-event", "unknown-prop"]);
    expect(rules(["unknown-prop"])).toEqual(["invalid-prop-value", "unknown-event"]);
    expect(rules(["invalid-prop-value"])).toEqual(["unknown-event", "unknown-prop"]);
    expect(rules(["unknown-event"])).toEqual(["invalid-prop-value", "unknown-prop"]);
    expect(rules(["unknown-prop", "invalid-prop-value", "unknown-event"])).toEqual([]);
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
