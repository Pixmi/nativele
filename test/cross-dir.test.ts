import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { tsDom } from "../src/lib/vite-plugin.ts";

const cli = join(process.cwd(), "src/cli.ts");
const run = (args: string[], cwd: string) => spawnSync("node", [cli, ...args], { cwd, encoding: "utf8" });

const project = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "ts-dom-dirs-"));
  for (const [n, c] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, n)), { recursive: true });
    writeFileSync(join(dir, n), c);
  }
  return dir;
};

const twoFolders = () =>
  project({
    "a/pages/page.html": `<x-child></x-child>`,
    "b/widgets/child.ts": `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./child.html.js";\nexport class Child extends Component(tpl) {}\ndefine("x-child", Child);\n`,
    "b/widgets/child.html": `<i></i>`,
  });

const importsOf = (file: string) => readFileSync(file, "utf8").split("\n").filter((l) => l.startsWith("import "));

const hot = () => {
  const errors: string[] = [];
  const server = { config: { logger: { error: (m: string) => errors.push(m), warn: () => {} } }, moduleGraph: { getModulesByFile: () => undefined, invalidateModule: () => {} }, ws: { send: () => {} } };
  return { server, errors };
};

describe("several scanned folders share their define() calls", () => {
  it("gen a b imports a child component defined in the other folder, and gen --check a b agrees", () => {
    const dir = twoFolders();
    expect(run(["gen", "a", "b"], dir).status).toBe(0);
    expect(importsOf(join(dir, "a/pages/page.html.ts"))).toContain(`import "../../b/widgets/child.js";`);
    const check = run(["gen", "--check", "a", "b"], dir);
    expect(check.stderr).toBe("");
    expect(check.status).toBe(0);
    const doctor = JSON.parse(run(["doctor", "a", "b", "--json"], dir).stdout) as { issues: { rule: string }[] };
    expect(doctor.issues.map((i) => i.rule)).not.toContain("stale-generated");
  });

  it("gen of one folder keeps importing only what that folder defines", () => {
    const dir = twoFolders();
    expect(run(["gen", "a"], dir).status).toBe(0);
    expect(importsOf(join(dir, "a/pages/page.html.ts")).join("\n")).not.toContain("child");
  });

  it("check a b imports the child and reports nothing stale", () => {
    const dir = twoFolders();
    run(["check", "a", "b", "--json"], dir);
    expect(importsOf(join(dir, "a/pages/page.html.ts"))).toContain(`import "../../b/widgets/child.js";`);
    const r = run(["check", "a", "b", "--no-write", "--json"], dir);
    const rules = (JSON.parse(r.stdout) as { issues: { rule: string }[] }).issues.map((i) => i.rule);
    expect(rules).not.toContain("stale-generated");
  });

  it("the Vite plugin with dirs [a, b] imports the child at build start, on a template save and after a define() is added", () => {
    const dir = twoFolders();
    const plugin = tsDom({ dirs: ["a", "b"] });
    plugin.configResolved({ root: dir });
    plugin.buildStart.call({ error: (m: string): never => { throw new Error(m); }, warn: () => {} });
    const page = join(dir, "a/pages/page.html");
    expect(importsOf(`${page}.ts`)).toContain(`import "../../b/widgets/child.js";`);

    const { server, errors } = hot();
    writeFileSync(page, `<x-child></x-child><p>edited</p>`);
    plugin.handleHotUpdate({ file: page, server });
    expect(importsOf(`${page}.ts`)).toContain(`import "../../b/widgets/child.js";`);

    writeFileSync(page, `<x-child></x-child><x-other></x-other>`);
    plugin.handleHotUpdate({ file: page, server });
    const other = join(dir, "b/other.ts");
    writeFileSync(other, `import { define } from "@nativele/ts-dom";\nexport class Other extends HTMLElement {}\ndefine("x-other", Other);\n`);
    plugin.handleHotUpdate({ file: other, server });
    expect(importsOf(`${page}.ts`)).toContain(`import "../../b/other.js";`);
    expect(errors).toEqual([]);
  });

  it("duplicate-define is reported when two folders define the same tag with different classes", () => {
    const dir = project({
      "a/card.ts": `export class CardA extends HTMLElement {}\ndefine("x-card", CardA);\n`,
      "b/card.ts": `export class CardB extends HTMLElement {}\n\ndefine("x-card", CardB);\n`,
    });
    const gen = run(["gen", "a", "b"], dir);
    expect(gen.status).toBe(1);
    expect(gen.stderr).toMatch(/^b\/card\.ts:3:1 error \[duplicate-define\] The tag <x-card> is defined more than once in the scanned folders \(a\/card\.ts:2 and b\/card\.ts:3\).+ Fix: /m);
    expect(run(["gen", "--check", "a", "b"], dir).stderr).toContain("[duplicate-define]");

    const check = run(["check", "a", "b", "--json"], dir);
    expect(check.status).toBe(1);
    const issues = (JSON.parse(check.stdout) as { issues: { file: string; line: number; col: number; rule: string }[] }).issues.filter((i) => i.rule === "duplicate-define");
    expect(issues).toMatchObject([{ file: "b/card.ts", line: 3, col: 1 }]);
  });

  it("overlapping folders that see the same define() are not a duplicate", () => {
    const dir = project({ "src/sub/card.ts": `export class Card extends HTMLElement {}\ndefine("x-card", Card);\n`, "src/page.html": `<x-card></x-card>` });
    const r = run(["gen", "src", "src/sub"], dir);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(importsOf(join(dir, "src/page.html.ts"))).toContain(`import "./sub/card.js";`);
  });
});
