import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { analyze, CODEGEN_RULES, formatDiagnostics, generateModule, isFullPage } from "../src/lib/codegen.ts";
import { A11Y_RULES } from "../src/lib/a11y.ts";

const errs = (html: string) => analyze(html).diagnostics.filter((d) => d.severity === "error").map((d) => d.message);
const ruleIds = (html: string) => analyze(html).diagnostics.map((d) => d.rule);

const makeDir = async (files: Record<string, string>) => {
  const { mkdirSync, mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { dirname, join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "tsdom-"));
  for (const [n, c] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, n)), { recursive: true });
    writeFileSync(join(dir, n), c);
  }
  return dir;
};

describe("codegen diagnostics", () => {
  it("a valid template has no diagnostics and yields the right structure", () => {
    const a = analyze(`<h1 data-ref="t">{{ a }}</h1><template data-each="xs"><li data-ref="c">{{ b }}</li></template><i data-if="k"></i><slot name="s"></slot>`);
    expect(a.diagnostics).toEqual([]);
    expect([...a.scope.refs.keys()]).toEqual(["t"]);
    expect([...a.scope.text]).toEqual(["a"]);
    expect([...(a.lists.get("xs")?.refs.keys() ?? [])]).toEqual(["c"]);
    expect([...(a.lists.get("xs")?.text ?? [])]).toEqual(["b"]);
    expect([...a.scope.ifs]).toEqual(["k"]);
  });
  it("duplicate data-ref", () => {
    expect(ruleIds(`<a data-ref="x"></a><b data-ref="x"></b>`)).toEqual(["duplicate-ref"]);
    expect(errs(`<a data-ref="x"></a><b data-ref="x"></b>`)[0]).toMatch(/more than once/);
  });
  it("the same ref name is allowed in different lists", () => {
    expect(errs(`<template data-each="a"><i data-ref="x"></i></template><template data-each="b"><i data-ref="x"></i></template>`)).toEqual([]);
  });
  it("data-each needs a single root element", () => {
    expect(errs(`<template data-each="a"><i></i><i></i></template>`)[0]).toMatch(/exactly one root element/);
    expect(errs(`<template data-each="a"></template>`)[0]).toMatch(/exactly one root element/);
  });
  it("data-each is only allowed on <template>", () => {
    expect(errs(`<ul data-each="a"></ul>`)[0]).toMatch(/only works on <template>/);
  });
  it("data-if works inside an item but not on its root; data-each cannot be nested", () => {
    expect(errs(`<template data-each="a"><i><u data-if="z"></u></i></template>`)).toEqual([]);
    expect(errs(`<template data-each="a"><i data-if="z"></i></template>`)[0]).toMatch(/root element/);
    expect(errs(`<template data-each="a"><i><template data-each="b"><u></u></template></i></template>`)[0]).toMatch(/nested/);
  });
  it("a slot inside data-each is an error", () => {
    expect(errs(`<template data-each="a"><i><slot></slot></i></template>`)[0]).toMatch(/<slot> is inside/);
  });
  it("<style> must be top-level", () => {
    expect(errs(`<style>a{}</style><style scoped>b{}</style><p></p>`)).toEqual([]);
    expect(errs(`<div><style>a{}</style></div>`)[0]).toMatch(/top-level/);
    expect(errs(`<template data-each="a"><i></i><style></style></template>`).some((m) => /top-level/.test(m))).toBe(true);
    expect(errs(`<div data-if="x"><style></style></div>`)[0]).toMatch(/top-level/);
  });
  it("data-on-*: collects method names (including inside list items) and checks the syntax", () => {
    const a = analyze(`<button data-on-click="add"></button><template data-each="l"><li><b data-on-change="toggle"></b></li></template>`);
    expect(a.diagnostics).toEqual([]);
    expect([...a.events].sort()).toEqual(["add", "toggle"]);
    expect(errs(`<b data-on-click="add(1)"></b>`)[0]).toMatch(/plain method name/);
    expect(errs(`<b data-on-click="a.b"></b>`)[0]).toMatch(/plain method name/);
    expect(errs(`<b data-on-click=""></b>`)[0]).toMatch(/plain method name/);
    expect(errs(`<b data-on-="x"></b>`)[0]).toMatch(/invalid event name/);
    expect(generateModule(`<b data-on-click="add"></b>`)).toContain(`events: "add"`);
  });
  it("data-on-* method names must not clash with DOM or ts-dom members", () => {
    for (const name of ["remove", "click", "focus", "append", "set", "render", "show", "state", "refs"]) {
      expect(errs(`<b data-on-click="${name}"></b>`)[0], name).toMatch(/override/);
    }
    expect(errs(`<b data-on-click="removeTodo"></b>`)).toEqual([]);
  });
  it("{{ data.name }} and expressions are rejected", () => {
    expect(errs(`<p>{{ data.name }}</p>`)[0]).toMatch(/single identifier/);
    expect(errs(`<p>{{ a + 1 }}</p>`)[0]).toMatch(/single identifier/);
  });
  it("{{ }} in attributes is rejected; inside <style> it is ignored", () => {
    expect(errs(`<p title="{{ x }}"></p>`)[0]).toMatch(/only supported in text/);
    expect(errs(`<style>a{b:{{c}}}</style>`)).toEqual([]);
  });
  it("diagnostics carry line and column", () => {
    const d = analyze(`<p></p>\n<a data-ref="x"></a><b data-ref="x"></b>`).diagnostics[0];
    expect(d?.line).toBe(2);
  });
  it("the generated module contains text and list types and is valid TS", () => {
    const m = generateModule(`<p>{{ a }}</p><template data-each="l"><i>{{ b }}</i></template>`);
    expect(m).toContain(`text: "a"`);
    expect(m).toContain(`"l": { refs: {  }; text: "b"; ifs: never }`);
    expect(m).toContain(`export default template<`);
    expect(m).toContain(`[["p",{},["{{ a }}"]],["template",{"data-each":"l"},[["i",{},["{{ b }}"]]]]]`);
  });
  it("does not import El when there is no ref (avoids noUnusedLocals errors)", () => {
    expect(generateModule(`<p>{{ a }}</p>`)).not.toContain("El");
    expect(generateModule(`<p data-ref="x"></p>`)).toContain("import type { El }");
  });
  it("a full page is not a template", () => {
    expect(isFullPage(`<!doctype html><html></html>`)).toBe(true);
    expect(isFullPage(`<!-- c --><HTML>`)).toBe(true);
    expect(isFullPage(`<h1>x</h1>`)).toBe(false);
  });
});

describe("generateTags (define → HTMLElementTagNameMap)", () => {
  const setup = async (files: Record<string, string>) => {
    const { mkdirSync, mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { dirname, join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "tsdom-"));
    for (const [n, c] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, n)), { recursive: true });
      writeFileSync(join(dir, n), c);
    }
    return dir;
  };
  it("only exported classes are included; paths are relative to the scanned directory and end in .js", async () => {
    const { generateTags } = await import("../src/lib/codegen.ts");
    const { readFileSync } = await import("node:fs");
    const dir = await setup({
      "a.ts": `export class A {}\ndefine("x-a", A);`,
      "sub/b.ts": `export default class B {}\ndefine('x-b', B)`,
      "c.ts": `class C {}\ndefine("x-c", C);`, // not exported: skipped
      "d.ts": `class D {}\nexport { D };\ndefine("x-d", D);`,
      "plain.ts": `define("nodash", Z);`, // not a valid custom element name: skipped
    });
    const out = generateTags(dir);
    expect(out).toBeTruthy();
    const text = readFileSync(out as string, "utf8");
    expect(text).toContain(`import type { A as Tag0 } from "./a.js"`);
    expect(text).toContain(`import type { default as Tag1 } from "./sub/b.js"`);
    expect(text).toContain(`import type { D as Tag2 } from "./d.js"`);
    expect(text).not.toContain("x-c");
    expect(text).not.toContain("nodash");
    expect(text).toContain(`"x-a": Tag0;`);
    expect(text).toContain("interface HTMLElementTagNameMap");
  });
  it("throws when the same tag is defined in different files", async () => {
    const { generateTags } = await import("../src/lib/codegen.ts");
    const dir = await setup({ "a.ts": `export class A {}\ndefine("x-dup", A);`, "b.ts": `export class B {}\ndefine("x-dup", B);` });
    expect(() => generateTags(dir)).toThrow(/x-dup.*more than once.*Fix:/);
  });
  it("removes the previously generated file when no define remains, but never deletes a same-named file we did not generate", async () => {
    const { generateTags } = await import("../src/lib/codegen.ts");
    const { existsSync, writeFileSync, unlinkSync } = await import("node:fs");
    const dir = await setup({ "a.ts": `export class A {}\ndefine("x-a", A);` });
    generateTags(dir);
    expect(existsSync(`${dir}/ts-dom-tags.ts`)).toBe(true);
    unlinkSync(`${dir}/a.ts`);
    expect(generateTags(dir)).toBeNull();
    expect(existsSync(`${dir}/ts-dom-tags.ts`)).toBe(false);
    writeFileSync(`${dir}/ts-dom-tags.ts`, "// written by me\n");
    generateTags(dir);
    expect(existsSync(`${dir}/ts-dom-tags.ts`)).toBe(true);
  });
});

describe("child component auto-import", () => {
  it("generateModule puts the given modules first", () => {
    const m = generateModule(`<x-kid></x-kid>`, {}, ["./kid.js"]);
    expect(m.split("\n").slice(0, 3)).toEqual(["// Generated by ts-dom. Do not edit.", `import "./kid.js";`, `import { template } from "ts-dom";`]);
  });
  it("analyze finds the custom elements a template uses (including inside list items); native elements do not count", () => {
    const a = analyze(`<x-a></x-a><div></div><template data-each="l"><li><x-b></x-b></li></template>`);
    expect([...a.customTags].sort()).toEqual(["x-a", "x-b"]);
  });
  it("generateAll: a tag used by a template that has a define() in the directory imports that module (whether or not the class is exported)", async () => {
    const { mkdirSync, mkdtempSync, readFileSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { generateAll } = await import("../src/lib/codegen.ts");
    const dir = mkdtempSync(join(tmpdir(), "tsdom-"));
    mkdirSync(join(dir, "kids"));
    writeFileSync(join(dir, "kids/kid.ts"), `class Kid {}\ndefine("x-kid", Kid);`); // must be loaded even without export
    writeFileSync(join(dir, "kids/kid.html"), `<i></i>`);
    writeFileSync(join(dir, "parent.html"), `<x-kid></x-kid><x-external></x-external><b></b>`);
    generateAll(dir);
    const parent = readFileSync(join(dir, "parent.html.ts"), "utf8");
    expect(parent).toContain(`import "./kids/kid.js";`);
    // Components outside the directory are imported by the user: only check the import lines (the module always contains the whole HTML string)
    expect(parent.split("\n").filter((l) => l.startsWith("import")).join("\n")).not.toContain("external");
    expect(readFileSync(join(dir, "kids/kid.html.ts"), "utf8")).not.toContain("import \"");
  });
});

/** One template per analyze() rule id; each must produce that rule. */
const RULE_INPUTS: Record<string, string> = {
  "invalid-hole": `<p>{{ a.b }}</p>`,
  "attr-hole": `<p title="{{ x }}"></p>`,
  "invalid-event-name": `<b data-on-="x"></b>`,
  "invalid-handler": `<b data-on-click="add(1)"></b>`,
  "reserved-handler": `<b data-on-click="remove"></b>`,
  "empty-ref": `<b data-ref=""></b>`,
  "duplicate-ref": `<a data-ref="x"></a><b data-ref="x"></b>`,
  "empty-if": `<b data-if=""></b>`,
  "if-on-item-root": `<template data-each="a"><i data-if="z"></i></template>`,
  "slot-in-list": `<template data-each="a"><i><slot></slot></i></template>`,
  "style-not-top-level": `<div><style>a{}</style></div>`,
  "duplicate-slot": `<slot name="a"></slot><slot name="a"></slot>`,
  "each-not-template": `<ul data-each="a"></ul>`,
  "empty-each": `<template data-each=""><i></i></template>`,
  "nested-each": `<template data-each="a"><i><template data-each="b"><u></u></template></i></template>`,
  "duplicate-each": `<template data-each="a"><i></i></template><template data-each="a"><i></i></template>`,
  "each-root-count": `<template data-each="a"><i></i><i></i></template>`,
  "forbidden-tag": `<script>alert(1)</script>`,
  "forbidden-attribute": `<b onclick="x()"></b>`,
  "unsafe-url": `<a href="javascript:void(0)"></a>`,
};

describe("unsafe markup", () => {
  it("rejects srcdoc and javascript: URLs, and allows data-on-* and ordinary links", () => {
    expect(ruleIds(`<iframe srcdoc="<p>x</p>"></iframe>`)).toContain("forbidden-attribute");
    expect(ruleIds(`<a href=" JavaScript:x"></a>`)).toContain("unsafe-url");
    expect(ruleIds(`<a href="/x" data-on-click="go" data-ref="a"></a>`)).toEqual([]);
  });
});

describe("rule ids and diagnostic shape", () => {
  it("every analyze rule in CODEGEN_RULES is produced by at least one template", () => {
    const analyzeRules = Object.keys(CODEGEN_RULES).filter((r) => r !== "duplicate-define");
    for (const rule of analyzeRules) {
      const html = RULE_INPUTS[rule];
      expect(html, `no test input for rule ${rule}`).toBeTypeOf("string");
      expect(ruleIds(html as string), rule).toContain(rule);
    }
    // the table has no stale entries either
    for (const rule of Object.keys(RULE_INPUTS)) expect(CODEGEN_RULES, rule).toHaveProperty(rule);
  });
  it("duplicate-define is produced by generateTags, not analyze", async () => {
    const { generateTags, CodegenError } = await import("../src/lib/codegen.ts");
    const dir = await makeDir({ "a.ts": `export class A {}\ndefine("x-dup", A);`, "b.ts": `export class B {}\ndefine("x-dup", B);` });
    expect(Object.keys(RULE_INPUTS)).not.toContain("duplicate-define");
    let err: unknown;
    try {
      generateTags(dir);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CodegenError);
    expect((err as Error).message).toContain("[duplicate-define]");
    expect((err as Error).message).toContain("Fix:");
  });
  it("every analyze diagnostic has line >= 1, col >= 1, a rule, a severity and a Fix: hint", () => {
    for (const [rule, html] of Object.entries(RULE_INPUTS)) {
      const ds = analyze(html).diagnostics.filter((d) => d.rule === rule);
      expect(ds.length, rule).toBeGreaterThan(0);
      for (const d of analyze(html).diagnostics) {
        expect(d.line, rule).toBeGreaterThanOrEqual(1);
        expect(d.col, rule).toBeGreaterThanOrEqual(1);
        expect(d.message, rule).toContain("Fix:");
        expect(d.rule in CODEGEN_RULES, d.rule).toBe(true);
        expect(["error", "warning"]).toContain(d.severity);
      }
    }
  });
  it("duplicate-slot is a warning with a fix; every other rule is an error", () => {
    for (const [rule, html] of Object.entries(RULE_INPUTS)) {
      const d = analyze(html).diagnostics.find((x) => x.rule === rule);
      expect(d?.severity, rule).toBe(rule === "duplicate-slot" ? "warning" : "error");
    }
    expect(analyze(RULE_INPUTS["duplicate-slot"] as string).diagnostics[0]?.message).toContain("Fix:");
  });
  it("messages start with the problem, not the rule id", () => {
    for (const html of Object.values(RULE_INPUTS)) {
      for (const d of analyze(html).diagnostics) expect(d.message).not.toMatch(/^\[/);
    }
  });
  it("locs records the first location of each marker", () => {
    const a = analyze(`<p>{{ t }}</p>\n<i data-ref="r" data-if="c" data-on-click="go"></i>\n<template data-each="l"><li data-ref="q">{{ z }}</li></template>`);
    expect(a.locs.get("text:t")?.line).toBe(1);
    for (const k of ["ref:r", "if:c", "event:go"]) expect(a.locs.get(k)?.line, k).toBe(2);
    for (const k of ["each:l", "ref:l/q", "text:l/z"]) expect(a.locs.get(k)?.line, k).toBe(3);
  });
  it("customUses and eventSites carry attributes", () => {
    const a = analyze(`<x-k a="1" b data-on-ping="onPing"></x-k><button class="c" data-on-click="go"></button>`);
    expect(a.customUses).toHaveLength(1);
    expect(a.customUses[0]).toMatchObject({ tag: "x-k", attrs: ["a", "b", "data-on-ping"], events: ["ping"], line: 1 });
    expect(a.eventSites.find((s) => s.method === "go")?.attrs).toEqual(["class", "data-on-click"]);
  });
  it("formatDiagnostics prints file:line:col severity [rule] message, one line each", () => {
    const ds = analyze(`<a data-ref="x"></a>\n<b data-ref="x"></b><slot></slot><slot></slot>`).diagnostics;
    expect(ds).toHaveLength(2);
    const lines = formatDiagnostics("src/x.html", ds).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^src\/x\.html:2:1 error \[duplicate-ref\] .+ Fix: .+\.$/);
    expect(lines[1]).toMatch(/^src\/x\.html:2:\d+ warning \[duplicate-slot\] /);
    expect(formatDiagnostics("f", [])).toBe("");
  });
});

describe("CLI", () => {
  const cli = join(process.cwd(), "src/cli.ts"); // vitest runs from the repo root
  const run = (args: string[], cwd?: string) => spawnSync("node", [cli, ...args], { cwd, encoding: "utf8" });
  const comp = `import tpl from "./x.html.js";\nclass X extends Component(tpl) {}\n`;

  it("rules lists ids from every group", () => {
    const out = execFileSync("node", [cli, "rules"], { encoding: "utf8" });
    for (const id of ["invalid-hole", "duplicate-define", "unused-ref", "missing-handler", "prop-forwarding", "unknown-event", "img-alt", "click-semantics"]) {
      expect(out, id).toContain(id);
    }
    for (const id of Object.keys(CODEGEN_RULES)) expect(out, id).toContain(id);
    for (const id of Object.keys(A11Y_RULES)) expect(out, id).toContain(id);
    for (const group of ["gen", "lint: unused-markup", "lint: data-flow", "lint: a11y"]) expect(out).toContain(`${group}:`);
  });
  it("lint --json prints { issues } and exits 1 on an error", async () => {
    const dir = await makeDir({ "x.html": `<p>{{ a }}</p>`, "x.ts": comp });
    const r = run(["lint", ".", "--json"], dir);
    expect(r.status).toBe(1);
    const json = JSON.parse(r.stdout) as { issues: Record<string, unknown>[] };
    expect(Object.keys(json)).toEqual(["issues"]);
    expect(json.issues.length).toBeGreaterThan(0);
    const issue = json.issues.find((i) => i.rule === "unused-text");
    expect(issue).toMatchObject({ file: "x.html", severity: "error", rule: "unused-text", line: 1 });
    expect(issue?.col).toBeGreaterThanOrEqual(1);
    expect(issue?.message).toContain("Fix:");
  });
  it("lint exits 0 and prints { issues: [] } when clean", async () => {
    const dir = await makeDir({ "x.html": `<p>hi</p>`, "x.ts": comp });
    const r = run(["lint", ".", "--json"], dir);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ issues: [] });
    const text = run(["lint", "."], dir);
    expect(text.status).toBe(0);
    expect(text.stdout).toContain("no issues");
  });
  it("lint text output uses file:line:col severity [rule] message", async () => {
    const dir = await makeDir({ "x.html": `<p>{{ a }}</p>`, "x.ts": comp });
    const r = run(["lint", "."], dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/x\.html:1:\d+ error \[unused-text\] .*Fix:/);
  });
  it("--strict makes warnings fail; without it warnings exit 0", async () => {
    const dir = await makeDir({ "x.html": `<img src="a.png">`, "x.ts": comp });
    const lax = run(["lint", ".", "--a11y", "--json"], dir);
    expect(lax.status).toBe(0);
    const issues = (JSON.parse(lax.stdout) as { issues: { rule: string; severity: string }[] }).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: "img-alt", severity: "warning" });
    expect(run(["lint", ".", "--a11y", "--json", "--strict"], dir).status).toBe(1);
    // without --a11y the same template is clean, even with --strict
    expect(run(["lint", ".", "--strict"], dir).status).toBe(0);
  });
  it("an unknown command prints help and exits 1", () => {
    const r = run(["nope"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("Commands");
  });
});

describe("scanDefines ignores define() calls inside strings and comments", () => {
  it("only real calls are found; sample code in strings, template literals and comments is skipped", async () => {
    const { mkdirSync, mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { scanDefines } = await import("../src/lib/codegen.ts");
    const dir = mkdtempSync(join(tmpdir(), "tsdom-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "docs.ts"),
      [
        'const sample = `export class Fake extends Component(tpl) {}\ndefine("x-fake-template", Fake);`;',
        'const other = \'define("x-fake-string", Fake)\';',
        '// define("x-fake-line-comment", Fake)',
        '/* define("x-fake-block-comment", Fake) */',
        "export class Real {}",
        'define("x-real", Real);',
      ].join("\n"),
    );
    expect(scanDefines(dir).map((d) => d.tag)).toEqual(["x-real"]);
  });
  it("a class that is only exported inside a string is not treated as exported", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { scanDefines } = await import("../src/lib/codegen.ts");
    const dir = mkdtempSync(join(tmpdir(), "tsdom-"));
    writeFileSync(join(dir, "a.ts"), 'const s = "export class A {}";\nclass A {}\ndefine("x-a", A);');
    expect(scanDefines(dir)).toMatchObject([{ tag: "x-a", exported: false }]);
  });
});

describe("whitespace option", () => {
  const html = `<ul>\n  <li>a  b</li>\n  <li>c</li>\n</ul><b>x</b> <i>y</i><pre>  keep\n</pre>`;
  it("preserves whitespace by default", () => {
    expect(generateModule(html)).toContain(`"\\n  "`);
  });
  it("collapse drops line-break-only text, collapses runs and leaves pre alone", () => {
    const m = generateModule(html, { whitespace: "collapse" });
    expect(m).toContain(`["li",{},["a b"]]`);
    expect(m).not.toContain(`"\\n  "`);
    expect(m).toContain(`" "`);
    expect(m).toContain(`"  keep\\n"`);
  });
});
