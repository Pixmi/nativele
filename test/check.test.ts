import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mapTscErrors, parseTscOutput, runCheck } from "../src/lib/check.ts";

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

  it("errors inside the body of a class with a contract error follow from it and are left out; errors after the class are kept", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "nativele-check-"));
    writeFileSync(
      join(dir, "c.ts"),
      `export class Card extends Component(tpl, { state: { count: 0 } }) {\n  label = "}";\n  connectedCallback() {\n    this.bind(store, (s) => {\n      console.log(s.n);\n    });\n  }\n}\nexport const n = o.lenght;\n`,
    );
    const issues = mapTscErrors(
      [
        { file: "c.ts", line: 1, col: 27, code: "TS2507", message: `Type '{ missingStateKeys: "nope"; }' is not a constructor function type.` },
        { file: "c.ts", line: 4, col: 23, code: "TS7006", message: "Parameter 's' implicitly has an 'any' type." },
        { file: "c.ts", line: 9, col: 20, code: "TS2339", message: "Property 'lenght' does not exist on type '{ a: number; }'." },
      ],
      dir,
    );
    expect(issues.map((i) => [i.rule, i.line])).toEqual([
      ["missing-binding", 1],
      ["tsc", 9],
    ]);
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

  it("a tsc error in a generated file says to regenerate or delete it, not to change the TypeScript there", () => {
    const issues = mapTscErrors(
      [
        { file: "src/card.html.ts", line: 3, col: 1, code: "TS2307", message: "Cannot find module './card.js'." },
        { file: "src/old/ts-dom-tags.ts", line: 2, col: 1, code: "TS2717", message: "Subsequent property declarations must have the same type." },
      ],
      process.cwd(),
    );
    for (const i of issues) {
      expect(i.message).not.toContain("change the TypeScript");
      expect(i.message).toMatch(/Fix: run ts-dom gen .*delete it\.$/);
    }
  });

  it("a plain tsc error carries a Fix hint", () => {
    const [issue] = mapTscErrors([{ file: "y.ts", line: 1, col: 1, code: "TS2304", message: "Cannot find name 'q'." }], process.cwd());
    expect(issue?.message).toMatch(/Fix: /);
  });
});

describe("ts-dom check: causes the tsc text alone does not name", () => {
  it("a tag declared with another class by a second tag map is a duplicate-define, not a request to regenerate", () => {
    const [issue] = mapTscErrors(
      [{ file: "lib/ts-dom-tags.ts", line: 6, col: 5, code: "TS2717", message: `Subsequent property declarations must have the same type.  Property '"hello-card"' must be of type 'HelloCard', but here has type 'HelloCard'.` }],
      process.cwd(),
    );
    expect(issue).toMatchObject({ rule: "duplicate-define", file: "lib/ts-dom-tags.ts", line: 6 });
    expect(issue?.message).toMatch(/^The tag <hello-card> is declared with another class by a second tag map.* Fix: rename the tag/);
    expect(issue?.message).not.toContain("run ts-dom gen");
  });

  it("an item component missing from the tag map names the tsconfig as a cause too", () => {
    const [issue] = mapTscErrors(
      [{ file: "src/board.ts", line: 25, col: 31, code: "TS2322", message: `Type 'readonly Task[]' is not assignable to type '{ itemComponentMissingFromTagMap: "task-row"; }'.` }],
      process.cwd(),
    );
    expect(issue?.rule).toBe("item-not-in-tag-map");
    expect(issue?.message).toMatch(/Fix: run ts-dom gen .*include or exclude leaves ts-dom-tags\.ts out of the program/);
  });

  it("errors in other files that follow from a contract error are kept and point at it", () => {
    const dir = mkdtempSync(join(tmpdir(), "nativele-check-"));
    writeFileSync(join(dir, "hello-card.html"), `<p>{{ missing }}</p>\n`);
    writeFileSync(join(dir, "hello-card.ts"), `import tpl from "./hello-card.html.js";\nexport class HelloCard extends Component(tpl, { props: { name: "" } }) {}\ndefine("hello-card", HelloCard);\n`);
    const issues = mapTscErrors(
      [
        { file: "hello-card.ts", line: 2, col: 32, code: "TS2507", message: `Type '{ missingStateKeys: "missing"; }' is not a constructor function type.` },
        { file: "hello-card.ts", line: 3, col: 22, code: "TS2345", message: "Argument of type 'typeof HelloCard' is not assignable to parameter of type 'abstract new (...args: never[]) => HTMLElement'." },
        { file: "host.ts", line: 9, col: 27, code: "TS2345", message: "Argument of type 'HelloCard & { extra: number; }' is not assignable to parameter of type 'string | Node'." },
        { file: "main.ts", line: 4, col: 6, code: "TS2339", message: "Property 'name' does not exist on type 'HelloCard'." },
        { file: "main.ts", line: 8, col: 1, code: "TS2304", message: "Cannot find name 'HelloCards'." },
      ],
      dir,
    );
    expect(issues.map((i) => [i.file, i.line, i.rule])).toEqual([
      ["hello-card.html", 1, "missing-binding"],
      ["host.ts", 9, "tsc"],
      ["main.ts", 4, "tsc"],
      ["main.ts", 8, "tsc"],
    ]);
    for (const i of issues.slice(1, 3)) {
      expect(i.message).toMatch(/^TS\d+: .* This error follows from the contract error of HelloCard at hello-card\.html:1:4 \[missing-binding\].* Fix: fix that error first/);
    }
    expect(issues[3]?.message).not.toContain("follows from");
  });

  it("only an error whose quoted type is the broken class follows from its contract error", () => {
    const dir = mkdtempSync(join(tmpdir(), "nativele-check-"));
    writeFileSync(join(dir, "index.html"), `<p>{{ missing }}</p>\n`);
    writeFileSync(join(dir, "index.ts"), `import tpl from "./index.html.js";\nexport class Index extends Component(tpl) {}\nconst rows: Record<string, number> = row;\n`);
    writeFileSync(join(dir, "task.html"), `<p>{{ missing }}</p>\n`);
    writeFileSync(join(dir, "task.ts"), `import tpl from "./task.html.js";\nexport class Task extends Component(tpl) {}\n`);
    const broken = (file: string, line: number) => ({ file, line, col: 21, code: "TS2507", message: `Type '{ missingStateKeys: "missing"; }' is not a constructor function type.` });
    const issues = mapTscErrors(
      [
        broken("index.ts", 2),
        broken("task.ts", 2),
        { file: "index.ts", line: 3, col: 7, code: "TS2322", message: "Type 'Row' is not assignable to type 'Record<string, number>'.\n  Index signature for type 'string' is missing in type 'Row'." },
        { file: "other.ts", line: 5, col: 3, code: "TS2322", message: "Type 'string' is not assignable to type 'Task[\"status\"]'." },
        { file: "other.ts", line: 6, col: 3, code: "TS2345", message: "Argument of type 'Task | null' is not assignable to parameter of type 'string | Node'." },
      ],
      dir,
    );
    expect(issues.map((i) => [i.file, i.line, i.rule])).toEqual([
      ["index.html", 1, "missing-binding"],
      ["task.html", 1, "missing-binding"],
      ["index.ts", 3, "tsc"],
      ["other.ts", 5, "tsc"],
      ["other.ts", 6, "tsc"],
    ]);
    for (const i of issues.slice(2, 4)) expect(i.message).toMatch(/^TS2322: (?:(?!follows from).)* Fix: change the TypeScript/s);
    expect(issues[4]?.message).toMatch(/follows from the contract error of Task at task\.html:1:4/);
  });

  it("TypeScript that is not installed is an error, so the check does not pass without a type check", () => {
    const dir = mkdtempSync(join(tmpdir(), "nativele-check-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "package.json"), "{}");
    expect(runCheck({ dirs: ["src"], cwd: dir }).find((i) => i.rule === "tsc-not-found")).toMatchObject({ severity: "error" });
  });
});
