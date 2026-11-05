import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mapTscErrors, parseTscOutput } from "../src/lib/check.ts";

describe("ts-dom check: tsc output", () => {
  it("parses errors and joins indented continuation lines", () => {
    const out = "a.ts(1,7): error TS2322: Type 'string' is not assignable.\n  Details on the next line.\nb.ts(3,2): error TS2304: Cannot find name 'x'.\n";
    expect(parseTscOutput(out)).toEqual([
      { file: "a.ts", line: 1, col: 7, code: "TS2322", message: "Type 'string' is not assignable.\nDetails on the next line." },
      { file: "b.ts", line: 3, col: 2, code: "TS2304", message: "Cannot find name 'x'." },
    ]);
  });
  it("names the contract errors and keeps other errors as tsc", () => {
    const issues = mapTscErrors(
      [
        { file: "x.ts", line: 2, col: 1, code: "TS2322", message: "Type '{ id: number; }' is not assignable to type '{ itemComponentClassNotExported: \"x-row\"; fix: \"...\" }'." },
        { file: "y.ts", line: 5, col: 3, code: "TS2304", message: "Cannot find name 'q'." },
      ],
      process.cwd(),
    );
    expect(issues.map((i) => i.rule)).toEqual(["item-class-not-exported", "tsc"]);
    expect(issues[0]?.message).toContain("Fix: export the class");
  });
});

describe("ts-dom check on a project", () => {
  it("points a missing binding and a missing handler at the template, without follow-up errors", () => {
    const dir = join(process.cwd(), "check-fixture-tmp");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    try {
      writeFileSync(join(dir, "tsconfig.json"), `{ "extends": "../tsconfig.json", "include": ["."] }`);
      writeFileSync(join(dir, "broken.html"), `<p>{{ title }}</p>\n<button type="button" data-on-click="save">Save</button>\n`);
      writeFileSync(
        join(dir, "broken.ts"),
        `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./broken.html.js";\nexport class Broken extends Component(tpl, { state: { count: 0 } }) {}\ndefine("x-broken", Broken);\nconst o = { a: 1 };\nexport const n = o.lenght;\n`,
      );
      let out = "";
      try {
        execFileSync(process.execPath, ["src/cli.ts", "check", "check-fixture-tmp", "--project=check-fixture-tmp/tsconfig.json", "--json"], { encoding: "utf8" });
      } catch (e) {
        out = (e as { stdout: string }).stdout;
      }
      const issues = (JSON.parse(out) as { issues: { file: string; line: number; col: number; rule: string }[] }).issues;
      expect(issues.map((i) => [i.file, i.line, i.col, i.rule])).toEqual([
        ["check-fixture-tmp/broken.html", 1, 4, "missing-binding"],
        ["check-fixture-tmp/broken.html", 2, 1, "missing-handler"],
        ["check-fixture-tmp/broken.ts", 6, 20, "tsc"],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("ts-dom check when tsc cannot run", () => {
  it("reports tsc-failed instead of no issues", () => {
    let out = "";
    try {
      execFileSync(process.execPath, ["src/cli.ts", "check", "examples", "--project=missing-tsconfig.json", "--json"], { encoding: "utf8" });
    } catch (e) {
      out = (e as { stdout: string }).stdout;
    }
    const rules = (JSON.parse(out) as { issues: { rule: string }[] }).issues.map((i) => i.rule);
    expect(rules).toContain("tsc-failed");
  }, 30_000);
});

describe("ts-dom check: more cases", () => {
  it("a class name with $ and several contract errors in one message", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "nativele-check-"));
    writeFileSync(join(dir, "c.ts"), `export class $Card extends Component(tpl, { props: { title: "" } }) {}\n`);
    const issues = mapTscErrors(
      [
        { file: "c.ts", line: 1, col: 1, code: "TS2507", message: `Type '{ missingStateKeys: "name"; } & { reservedPropNames: "title"; }' is not a constructor function type.` },
        { file: "c.ts", line: 2, col: 1, code: "TS2345", message: "Argument of type 'typeof $Card' is not assignable to parameter of type 'abstract new (...args: never[]) => HTMLElement'." },
      ],
      dir,
    );
    expect(issues.map((i) => i.rule).sort()).toEqual(["missing-binding", "reserved-prop"]);
  });

  it("a folder that does not exist is reported, not skipped", () => {
    let out = "";
    try {
      execFileSync(process.execPath, ["src/cli.ts", "check", "no-such-folder", "--json"], { encoding: "utf8" });
    } catch (e) {
      out = (e as { stdout: string }).stdout;
    }
    expect((JSON.parse(out) as { issues: { rule: string }[] }).issues.map((i) => i.rule)).toContain("dir-not-found");
  }, 30_000);

  it("a project that lists vue-tsc is checked with vue-tsc", () => {
    const dir = join(process.cwd(), "check-fixture-vue");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "node_modules/vue-tsc/bin"), { recursive: true });
    try {
      writeFileSync(join(dir, "package.json"), `{ "type": "module", "devDependencies": { "vue-tsc": "*" } }`);
      writeFileSync(join(dir, "tsconfig.json"), `{ "include": ["."] }`);
      writeFileSync(join(dir, "node_modules/vue-tsc/package.json"), `{ "name": "vue-tsc", "bin": { "vue-tsc": "./bin/vue-tsc.js" } }`);
      writeFileSync(join(dir, "node_modules/vue-tsc/bin/vue-tsc.js"), `console.log("App.vue(3,5): error TS2322: Reported by vue-tsc."); process.exit(2);\n`);
      let out = "";
      try {
        execFileSync(process.execPath, [join(process.cwd(), "src/cli.ts"), "check", ".", "--json"], { cwd: dir, encoding: "utf8" });
      } catch (e) {
        out = (e as { stdout: string }).stdout;
      }
      const issues = (JSON.parse(out) as { issues: { file: string; message: string }[] }).issues;
      expect(issues.map((i) => [i.file, i.message.split(" Fix:")[0]])).toEqual([["App.vue", "TS2322: Reported by vue-tsc."]]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("a project that does not list vue-tsc is checked with tsc even when vue-tsc resolves", () => {
    const dir = join(process.cwd(), "check-fixture-vue-hoisted");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "node_modules/vue-tsc/bin"), { recursive: true });
    try {
      writeFileSync(join(dir, "package.json"), `{ "type": "module" }`);
      writeFileSync(join(dir, "tsconfig.json"), `{ "include": ["."] }`);
      writeFileSync(join(dir, "a.ts"), "export {};\n");
      writeFileSync(join(dir, "node_modules/vue-tsc/package.json"), `{ "name": "vue-tsc", "bin": { "vue-tsc": "./bin/vue-tsc.js" } }`);
      writeFileSync(join(dir, "node_modules/vue-tsc/bin/vue-tsc.js"), `console.log("App.vue(3,5): error TS2322: Reported by vue-tsc."); process.exit(2);\n`);
      let out = "";
      try {
        out = execFileSync(process.execPath, [join(process.cwd(), "src/cli.ts"), "check", ".", "--json"], { cwd: dir, encoding: "utf8" });
      } catch (e) {
        out = (e as { stdout: string }).stdout;
      }
      expect(out).not.toContain("Reported by vue-tsc");
      expect((JSON.parse(out) as { issues: unknown[] }).issues).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("a solution-style tsconfig checks its referenced projects", () => {
    const dir = join(process.cwd(), "check-fixture-solution");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    try {
      writeFileSync(join(dir, "tsconfig.json"), `{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }`);
      writeFileSync(join(dir, "tsconfig.app.json"), `{ "extends": "../tsconfig.json", "include": ["."] }`);
      writeFileSync(join(dir, "broken.html"), `<p>{{ title }}</p>\n`);
      writeFileSync(join(dir, "broken.ts"), `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./broken.html.js";\nexport class Broken extends Component(tpl, { state: { count: 0 } }) {}\ndefine("x-broken-2", Broken);\n`);
      let out = "";
      try {
        execFileSync(process.execPath, ["src/cli.ts", "check", "check-fixture-solution", "--project=check-fixture-solution/tsconfig.json", "--json"], { encoding: "utf8" });
      } catch (e) {
        out = (e as { stdout: string }).stdout;
      }
      const issues = (JSON.parse(out) as { issues: { rule: string; message: string }[] }).issues;
      expect(issues.map((i) => i.rule)).toEqual(["missing-binding"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("a plain tsc error carries a Fix hint", () => {
    const [issue] = mapTscErrors([{ file: "y.ts", line: 1, col: 1, code: "TS2304", message: "Cannot find name 'q'." }], process.cwd());
    expect(issue?.message).toMatch(/Fix: /);
  });
});
