import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { Linter } from "eslint";
import plugin from "../src/lib/oxlint-plugin.ts";

const filename = join(process.cwd(), "test/lint-fixture/panel.ts");
const code = `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./panel.html.js";\nexport class Panel extends Component(tpl) {}\ndefine("x-panel", Panel);\n`;

const lint = (rules: Record<string, unknown>) => {
  const linter = new Linter({ configType: "flat" });
  return linter.verify(code, [{ files: ["**/*.ts"], plugins: { "ts-dom": plugin as never }, rules: rules as never }], { filename });
};

describe("the lint plugin in ESLint (the editor integration the ESLint extension uses)", () => {
  it("reports the template findings on the import line", () => {
    const messages = lint({ "ts-dom/unused-markup": "error" });
    expect(messages.map((m) => [m.line, /^\S+ \[[\w-]+\]/.exec(m.message)?.[0]])).toEqual([
      [2, "./panel.html.js:1:1 [missing-handler]"],
      [2, "./panel.html.js:2:1 [unused-ref]"],
    ]);
  });

  it("one rule per rule id, each with its own severity", () => {
    const messages = lint({ "ts-dom/unused-ref": "warn" });
    expect(messages.map((m) => [m.ruleId, m.severity])).toEqual([["ts-dom/unused-ref", 1]]);
  });

  it("offers to add a missing handler to the component class", () => {
    const [missing] = lint({ "ts-dom/missing-handler": "error" });
    expect(missing?.suggestions?.[0]?.desc).toBe("Add a method save() to the component class");
    const fix = missing?.suggestions?.[0]?.fix;
    const fixed = fix ? code.slice(0, fix.range[0]) + fix.text + code.slice(fix.range[1]) : code;
    expect(fixed).toContain("export class Panel extends Component(tpl) {\n  save(_e: Event): void {}\n}");
  });
});
