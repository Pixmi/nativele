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
        `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./broken.html.js";\nexport class Broken extends Component(tpl, { state: { count: 0 } }) {}\ndefine("x-broken", Broken);\n`,
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
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
