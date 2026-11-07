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
  it("points a missing binding at the template, without follow-up errors (a missing handler waits until the class type checks)", () => {
    const dir = join(process.cwd(), "check-fixture-tmp");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    try {
      writeFileSync(join(dir, "tsconfig.json"), `{ "extends": "../tsconfig.json", "include": ["."] }`);
      writeFileSync(join(dir, "broken.html"), `<p>{{ heading }}</p>\n<button type="button" data-on-click="save">Save</button>\n`);
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
        ["check-fixture-tmp/broken.ts", 6, 20, "tsc"],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("ts-dom check: missing-handler", () => {
  it("is reported once, at the template, when define() is in another file", () => {
    const dir = join(process.cwd(), "check-handler-tmp");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    try {
      writeFileSync(join(dir, "tsconfig.json"), `{ "extends": "../tsconfig.json", "include": ["."] }`);
      writeFileSync(join(dir, "panel.html"), `<button type="button" data-on-click="save">Save</button>\n`);
      writeFileSync(join(dir, "panel.ts"), `import { Component } from "@nativele/ts-dom";\nimport tpl from "./panel.html.js";\nexport class Panel extends Component(tpl) {}\n`);
      writeFileSync(join(dir, "register.ts"), `import { define } from "@nativele/ts-dom";\nimport { Panel } from "./panel.ts";\ndefine("x-panel", Panel);\n`);
      let out = "";
      try {
        execFileSync(process.execPath, ["src/cli.ts", "check", "check-handler-tmp", "--project=check-handler-tmp/tsconfig.json", "--json"], { encoding: "utf8" });
      } catch (e) {
        out = (e as { stdout: string }).stdout;
      }
      const issues = (JSON.parse(out) as { issues: { file: string; line: number; col: number; rule: string; message: string }[] }).issues;
      expect(issues.map((i) => [i.file, i.line, i.col, i.rule])).toEqual([["check-handler-tmp/panel.html", 1, 1, "missing-handler"]]);
      expect(issues[0]?.message).toContain(`"save"`);
      expect(issues[0]?.message).toContain("tsc at check-handler-tmp/register.ts:3:19");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("ts-dom check: unchecked-custom-elements", () => {
  it("is reported once for the whole run and --ignore leaves it out", () => {
    const dir = join(process.cwd(), "check-unchecked-tmp");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    try {
      writeFileSync(join(dir, "tsconfig.json"), `{ "extends": "../tsconfig.json", "include": ["."] }`);
      for (const name of ["one", "two"]) {
        writeFileSync(join(dir, `${name}.html`), `<vendor-picker></vendor-picker>\n<vendor-chart></vendor-chart>\n`);
        writeFileSync(join(dir, `${name}.ts`), `import { Component } from "@nativele/ts-dom";\nimport tpl from "./${name}.html.js";\nexport class C extends Component(tpl) {}\n`);
      }
      const check = (...flags: string[]) => {
        const out = execFileSync(process.execPath, ["src/cli.ts", "check", "check-unchecked-tmp", "--project=check-unchecked-tmp/tsconfig.json", "--json", ...flags], { encoding: "utf8" });
        return (JSON.parse(out) as { issues: { file: string; line: number; col: number; rule: string; message: string }[] }).issues;
      };
      const issues = check();
      expect(issues.map((i) => [i.file, i.line, i.col, i.rule])).toEqual([["check-unchecked-tmp/one.html", 1, 1, "unchecked-custom-elements"]]);
      expect(issues[0]?.message).toContain("<vendor-picker>, <vendor-chart>: no define() in the scanned folders.");
      expect(check("--ignore=unchecked-custom-elements")).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("ts-dom check: handler parameter types", () => {
  it("points a handler whose parameter does not accept the bound event at its data-on-* attribute, and accepts the right types", () => {
    const dir = join(process.cwd(), "check-handler-tmp");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    try {
      writeFileSync(join(dir, "tsconfig.json"), `{ "extends": "../tsconfig.json", "include": ["."] }`);
      writeFileSync(join(dir, "pick.html"), `<button type="button" data-on-click="pick">Pick</button>\n`);
      writeFileSync(
        join(dir, "pick.ts"),
        `import { Component, define, event } from "@nativele/ts-dom";\nimport tpl from "./pick.html.js";\nexport class Picker extends Component(tpl, { emits: { "item-picked": event<{ id: number }>() } }) {\n  pick(): void {\n    this.emit("item-picked", { id: 1 });\n  }\n}\ndefine("x-picker", Picker);\n`,
      );
      writeFileSync(join(dir, "list.html"), `<section>\n  <x-picker data-on-item-picked="onPicked"></x-picker>\n  <input data-on-keydown="onKey" />\n</section>\n`);
      writeFileSync(
        join(dir, "list.ts"),
        `import { Component, define } from "@nativele/ts-dom";\nimport type { EmitEvent } from "@nativele/ts-dom";\nimport type { Picker } from "./pick.ts";\nimport tpl from "./list.html.js";\nexport class List extends Component(tpl) {\n  onPicked(e: MouseEvent): void {\n    void e;\n  }\n  onKey(e: KeyboardEvent): void {\n    void e.key;\n  }\n}\ndefine("x-list", List);\nexport class Right extends Component(tpl) {\n  onPicked(e: EmitEvent<Picker, "item-picked">): void {\n    void e.detail.id;\n  }\n  onKey(e: KeyboardEvent): void {\n    void e.key;\n  }\n}\ndefine("x-right", Right);\n`,
      );
      let out = "";
      try {
        execFileSync(process.execPath, ["src/cli.ts", "check", "check-handler-tmp", "--project=check-handler-tmp/tsconfig.json", "--json"], { encoding: "utf8" });
      } catch (e) {
        out = (e as { stdout: string }).stdout;
      }
      const issues = (JSON.parse(out) as { issues: { file: string; line: number; col: number; rule: string; message: string }[] }).issues;
      expect(issues.map((i) => [i.file, i.line, i.col, i.rule])).toEqual([["check-handler-tmp/list.html", 2, 13, "handler-event-type"]]);
      expect(issues[0]?.message).toContain("onPicked() is bound to data-on-item-picked on <x-picker>, which delivers CustomEvent<{ id: number; }>");
      expect(issues[0]?.message).toMatch(/Fix: type the first parameter as `CustomEvent<\{ id: number; \}>` \(for data-on-item-picked on <x-picker> that is `EmitEvent<Child, "item-picked">`/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("types an event from the first source that declares it, leaves a name no source declares unchecked, and keeps checking an event typed Event", () => {
    const dir = join(process.cwd(), "check-events-tmp");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    try {
      const H = `import { Component, define, event } from "@nativele/ts-dom";\nimport type { EmitEvent } from "@nativele/ts-dom";\n`;
      writeFileSync(join(dir, "tsconfig.json"), `{ "extends": "../tsconfig.json", "include": ["."] }`);
      writeFileSync(join(dir, "child.html"), `<button type="button" data-on-click="fire">Fire</button>\n`);
      writeFileSync(join(dir, "child.ts"), `${H}import tpl from "./child.html.js";\nexport class Child extends Component(tpl, { emits: { "child-picked": event<{ id: number }>({ bubbles: true }) } }) {\n  fire(): void {\n    this.emit("child-picked", { id: 1 });\n  }\n}\ndefine("x-child", Child);\n`);
      writeFileSync(join(dir, "page.html"), `<video data-ref="video" data-on-enterpictureinpicture="pip"></video>\n<div data-on-child-picked="picked"><x-child></x-child></div>\n<input aria-label="f" data-on-change="changed" />\n`);
      writeFileSync(
        join(dir, "page.ts"),
        `${H}import tpl from "./page.html.js";\nimport type { Child } from "./child.ts";\nexport class Page extends Component(tpl) {\n  pip(e: PictureInPictureEvent): void {\n    void e.pictureInPictureWindow;\n  }\n  picked(e: EmitEvent<Child, "child-picked">): void {\n    void e.detail.id;\n  }\n  changed(_e: InputEvent): void {}\n  override connected(): void {\n    this.on(this.refs.video, "enterpictureinpicture", (e: PictureInPictureEvent) => void e.pictureInPictureWindow);\n  }\n}\ndefine("x-page", Page);\n`,
      );
      let out = "";
      try {
        execFileSync(process.execPath, ["src/cli.ts", "check", "check-events-tmp", "--project=check-events-tmp/tsconfig.json", "--json"], { encoding: "utf8" });
      } catch (e) {
        out = (e as { stdout: string }).stdout;
      }
      const issues = (JSON.parse(out) as { issues: { file: string; line: number; col: number; rule: string; message: string }[] }).issues;
      expect(issues.map((i) => [i.file, i.line, i.rule])).toEqual([["check-events-tmp/page.html", 3, "handler-event-type"]]);
      expect(issues[0]?.message).toMatch(/Fix: type the first parameter as `Event`\.$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("reads several handlers and union types out of one tsc message", () => {
    const dir = mkdtempSync(join(tmpdir(), "nativele-check-"));
    try {
      writeFileSync(join(dir, "card.html"), `<button data-on-click="onBoth">a</button>\n  <x-row data-on-row-closed="onBoth"></x-row><input data-on-change="onChange" />\n`);
      writeFileSync(join(dir, "card.ts"), `import tpl from "./card.html.js";\n`);
      const issues = mapTscErrors(
        [
          {
            file: "card.ts",
            line: 9,
            col: 15,
            code: "TS2345",
            message: "Argument of type 'typeof Card' is not assignable to parameter of type 'typeof Card & { wrongHandlerParameters: { onBoth: CustomEvent<void> | PointerEvent; onChange: Event; }; } & { template: \"card.html\"; }'.\nProperty 'wrongHandlerParameters' is missing in type 'typeof Card' but required in type '{ wrongHandlerParameters: { onBoth: CustomEvent<void> | PointerEvent; onChange: Event; }; }'.",
          },
        ],
        dir,
      );
      expect(issues.map((i) => [i.rule, i.line, i.col])).toEqual([
        ["handler-event-type", 1, 9],
        ["handler-event-type", 2, 53],
      ]);
      expect(issues[0]?.message).toContain("onBoth() is bound to data-on-click on <button> and data-on-row-closed on <x-row>, which delivers CustomEvent<void> | PointerEvent");
      expect(issues[1]?.message).toContain("Fix: type the first parameter as `Event`.");
      expect(issues[0]?.message).toContain(", or as `Event`.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ts-dom check: any-in-contract", () => {
  it("points any in state, props, derive and emits at its declaration and an any handler parameter at its data-on-*, accepts unknown, and drops the follow-up errors", () => {
    const dir = join(process.cwd(), "check-any-tmp");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    try {
      const H = `import { Component, define, event } from "@nativele/ts-dom";\n`;
      writeFileSync(join(dir, "tsconfig.json"), `{ "extends": "../tsconfig.json", "include": ["."] }`);
      writeFileSync(join(dir, "card.html"), `<p>{{ heading }}</p>\n<button type="button" data-on-click="onPick">Pick</button>\n`);
      writeFileSync(
        join(dir, "card.ts"),
        `${H}import tpl from "./card.html.js";\ndeclare const raw: string;\nexport class Card extends Component(tpl, {\n  props: { heading: "", item: null as any },\n  state: { rows: [] as any[], data: JSON.parse(raw) },\n  derive: { total: (s) => s.rows.length as any },\n  emits: { "card-picked": event<any>() },\n}) {\n  onPick(): void {\n    this.emit("card-picked", 1);\n  }\n}\ndefine("x-card", Card);\n` +
          `export class Typed extends Component(tpl, { props: { heading: "", item: null as unknown }, emits: { "card-picked": event<unknown>() } }) {\n  onPick(_e: unknown): void {}\n}\ndefine("x-typed", Typed);\n` +
          `export class Loose extends Component(tpl, { props: { heading: "" } }) {\n  onPick(_e: any): void {}\n}\ndefine("x-loose", Loose);\n`,
      );
      let out = "";
      try {
        execFileSync(process.execPath, ["src/cli.ts", "check", "check-any-tmp", "--project=check-any-tmp/tsconfig.json", "--json"], { encoding: "utf8" });
      } catch (e) {
        out = (e as { stdout: string }).stdout;
      }
      const issues = (JSON.parse(out) as { issues: { file: string; line: number; col: number; rule: string; message: string }[] }).issues;
      expect(issues.map((i) => [i.file, i.line, i.col, i.rule])).toEqual([
        ["check-any-tmp/card.html", 2, 23, "any-in-contract"],
        ["check-any-tmp/card.ts", 5, 25, "any-in-contract"],
        ["check-any-tmp/card.ts", 6, 12, "any-in-contract"],
        ["check-any-tmp/card.ts", 6, 31, "any-in-contract"],
        ["check-any-tmp/card.ts", 7, 13, "any-in-contract"],
        ["check-any-tmp/card.ts", 8, 12, "any-in-contract"],
      ]);
      const message = (path: string) => issues.find((i) => i.message.includes(path))?.message;
      expect(message("props.item")).toMatch(/^props\.item is typed any, so tsc checks nothing that reads or assigns it.* Fix: declare a specific type .*or `unknown` and narrow it where it is read\.$/);
      expect(message("state.rows[]")).toBeDefined();
      expect(message("state.data")).toBeDefined();
      expect(message("emits.card-picked")).toMatch(/^The detail of emits\.card-picked is typed any.* Fix: declare the detail type/);
      expect(issues[0]?.message).toMatch(/^The first parameter of onPick\(\), which data-on-click on <button> calls, is typed any.* Fix: type it as the event it receives/);
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

  it("inside the body of a class with a contract error, only the errors that follow from it are left out; independent errors there and after the class are kept", async () => {
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
        { file: "c.ts", line: 4, col: 10, code: "TS2339", message: "Property 'bind' does not exist on type 'Card'." },
        { file: "c.ts", line: 4, col: 23, code: "TS7006", message: "Parameter 's' implicitly has an 'any' type." },
        { file: "c.ts", line: 5, col: 13, code: "TS2322", message: "Type 'number' is not assignable to type 'string'." },
        { file: "c.ts", line: 9, col: 20, code: "TS2339", message: "Property 'lenght' does not exist on type '{ a: number; }'." },
      ],
      dir,
    );
    expect(issues.map((i) => [i.rule, i.line])).toEqual([
      ["missing-binding", 1],
      ["tsc", 5],
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
      writeFileSync(join(dir, "broken.html"), `<p>{{ heading }}</p>\n`);
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
        { file: "hello-card.ts", line: 2, col: 32, code: "TS2507", message: `Type '{ missingStateKeys: "missing"; } & { template: "hello-card.html"; }' is not a constructor function type.` },
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
    const broken = (file: string, line: number) => ({ file, line, col: 21, code: "TS2507", message: `Type '{ missingStateKeys: "missing"; } & { template: "${file.replace(/\.ts$/, ".html")}"; }' is not a constructor function type.` });
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

describe("ts-dom check with a cwd other than the process's", () => {
  it("gives the lint file paths and the child template in click-semantics relative to that cwd", () => {
    const dir = mkdtempSync(join(tmpdir(), "nativele-check-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/x-card.html"), `<div><span>{{ title }}</span></div>\n`);
    writeFileSync(join(dir, "src/x-card.ts"), `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./x-card.html.js";\nexport class Card extends Component(tpl) {}\ndefine("x-card", Card);\n`);
    writeFileSync(join(dir, "src/page.html"), `<x-card data-on-click="go"></x-card>\n<p data-ref="dead"></p>\n`);
    writeFileSync(join(dir, "src/page.ts"), `import { Component } from "@nativele/ts-dom";\nimport tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\n`);
    const issues = runCheck({ dirs: ["src"], cwd: dir, a11y: true });
    expect(issues.find((i) => i.rule === "unused-ref")?.file).toBe(join("src", "page.html"));
    const click = issues.find((i) => i.rule === "click-semantics");
    expect(click?.file).toBe(join("src", "page.html"));
    expect(click?.message).toContain(`its template (${join("src", "x-card.html")}) has no operable element`);
  }, 30_000);
});
