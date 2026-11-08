import { describe, expect, it } from "vitest";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { writeFiles, writeTree } from "./helpers.ts";
import { scanDefines, Workspace } from "../src/lib/components.ts";
import { lintRun } from "../src/lib/lint.ts";
import { componentPackagesAt } from "../src/lib/manifest.ts";

const json = (v: unknown) => JSON.stringify(v);

const BUTTON_TS = `import { Component, define } from "@nativele/ts-dom";
import view from "./ui-button.html.js";
export class UiButton extends Component(view, { props: { size: 1 }, emits: { press: null } }) {
  press() { this.emit("press"); }
}
define("ui-button", UiButton);
`;
/** What tsc writes for BUTTON_TS: the same module as JavaScript, importing the generated template module. */
const BUTTON_JS = `import { Component, define } from "@nativele/ts-dom";
import view from "./ui-button.html.js";
export class UiButton extends Component(view, { props: { size: 1 }, emits: { press: null } }) {
    press() { this.emit("press"); }
}
define("ui-button", UiButton);
`;
const BUTTON_HTML = `<button data-on-click="press"><slot></slot></button>\n`;

/** A workspace with an app (apps/web) that depends on the component package @acme/ui, linked into node_modules as npm and pnpm do. */
function workspace(ui: Record<string, string>, app = `<ui-button size="2" data-on-press="go">Go</ui-button>\n`, appDeps: Record<string, string> = { "@acme/ui": "*" }): string {
  const root = writeTree({
    "package.json": json({ private: true, workspaces: ["packages/*", "apps/*"] }),
    "apps/web/package.json": json({ name: "web", dependencies: { ...appDeps, "@nativele/ts-dom": "^0.7.0" } }),
    "apps/web/src/app-view.html": app,
    "apps/web/src/app-view.ts": `import "@acme/ui";\nimport { Component, define } from "@nativele/ts-dom";\nimport view from "./app-view.html.js";\nexport class AppView extends Component(view) { go() {} }\ndefine("app-view", AppView);\n`,
    ...Object.fromEntries(Object.entries(ui).map(([k, v]) => [`packages/ui/${k}`, v])),
  });
  mkdirSync(join(root, "node_modules/@acme"), { recursive: true });
  symlinkSync(join(root, "packages/ui"), join(root, "node_modules/@acme/ui"));
  return root;
}
const SOURCE = {
  "package.json": json({ name: "@acme/ui", exports: { ".": "./src/index.ts" }, peerDependencies: { "@nativele/ts-dom": "^0.7.0" } }),
  "src/index.ts": `export * from "./ui-button.js";\n`,
  "src/ui-button.ts": BUTTON_TS,
  "src/ui-button.html": BUTTON_HTML,
};
const lint = (root: string, a11y = false) => lintRun([join(root, "apps/web/src")], { cwd: join(root, "apps/web"), a11y, ws: new Workspace() }).issues;
const rules = (root: string, a11y = false) => lint(root, a11y).map((i) => i.rule);

describe("components of a Nativele component package among the dependencies", () => {
  it("a workspace package exported as source: its props and events are checked in the app's templates, and its tag is not unchecked", () => {
    expect(rules(workspace(SOURCE))).toEqual([]);
    const issues = lint(workspace(SOURCE, `<ui-button sise="2" data-on-pres="go">Go</ui-button>\n`));
    expect(issues.map((i) => i.rule)).toEqual(["unknown-prop", "unknown-event"]);
    expect(issues[1]?.message).toContain(`Did you mean "press"?`);
  });

  it("a slot its template does not have is reported, since a source package has the template", () => {
    expect(rules(workspace(SOURCE, `<ui-button data-on-press="go"><span slot="icon">x</span>Go</ui-button>\n`))).toEqual(["unknown-slot"]);
  });

  it("follows exports conditions other than types, re-exports and import \"./x.js\", and leaves out * patterns and declaration files", () => {
    const root = workspace({
      ...SOURCE,
      "package.json": json({ name: "@acme/ui", exports: { ".": { types: "./src/missing.d.ts", import: "./src/entry.ts" }, "./*": "./src/*.ts", "./styles.css": "./styles.css" }, dependencies: { "@nativele/ts-dom": "^0.7.0" } }),
      "src/entry.ts": `import "./ui-button.js";\n`,
    });
    expect(componentPackagesAt(new Workspace(), join(root, "apps/web")).map((p) => [p.pkg, p.entries])).toEqual([["@acme/ui", [join(root, "packages/ui/src/entry.ts")]]]);
    expect(rules(workspace({ ...SOURCE, "package.json": json({ name: "@acme/ui", exports: { ".": { import: "./src/entry.ts" } }, dependencies: { "@nativele/ts-dom": "^0.7.0" } }), "src/entry.ts": `import "./ui-button.js";\n` }, `<ui-button data-on-pres="go">Go</ui-button>\n`))).toEqual(["unknown-event"]);
  });

  it("a built package (JavaScript and declarations, no .html): props and events are checked, and a11y says the package does not ship its template", () => {
    const root = workspace(
      {
        "package.json": json({ name: "@acme/ui", exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } }, peerDependencies: { "@nativele/ts-dom": "^0.7.0" } }),
        "dist/index.js": `export * from "./ui-button.js";\n`,
        "dist/index.d.ts": `export * from "./ui-button.js";\n`,
        "dist/ui-button.js": BUTTON_JS,
        "dist/ui-button.html.js": `export default {};\n`,
      },
      `<ui-button data-on-pres="go"></ui-button>\n`,
    );
    expect(rules(root)).toEqual(["unknown-event"]);
    const a11y = lint(
      writeFiles(root, {
        "apps/web/src/app-view.html": `<a href="/x"><ui-button data-on-press="go"></ui-button></a>\n`,
      }),
      true,
    );
    expect(a11y.map((i) => i.rule)).toEqual(["unchecked-content"]);
    expect(a11y[0]?.message).toContain("a component of a package that ships its modules without their .html templates");
  });

  it("a published package installed in node_modules (not a link) is read the same way", () => {
    const root = writeTree({
      "package.json": json({
        name: "app",
        dependencies: { "@acme/ui": "1", "@nativele/ts-dom": "^0.7.0" },
      }),
      "src/app-view.html": `<ui-button data-on-pres="go">Go</ui-button>\n`,
      "src/app-view.ts": `import "@acme/ui";\nimport { Component, define } from "@nativele/ts-dom";\nimport view from "./app-view.html.js";\nexport class AppView extends Component(view) { go() {} }\ndefine("app-view", AppView);\n`,
      ...Object.fromEntries(Object.entries({ ...SOURCE, "package.json": json({ name: "@acme/ui", main: "./src/index.ts", dependencies: { "@nativele/ts-dom": "^0.7.0" } }) }).map(([k, v]) => [`node_modules/@acme/ui/${k}`, v])),
    });
    expect(lintRun([join(root, "src")], { cwd: root, ws: new Workspace() }).issues.map((i) => i.rule)).toEqual(["unknown-event"]);
  });

  it("a dependency that does not list @nativele/ts-dom is not read", () => {
    const root = workspace({ ...SOURCE, "package.json": json({ name: "@acme/ui", exports: { ".": "./src/index.ts" } }) });
    expect(componentPackagesAt(new Workspace(), join(root, "apps/web"))).toEqual([]);
    expect(rules(root)).toEqual(["unchecked-custom-elements"]);
  });

  it("a package that does not list the component package does not see its tags", () => {
    expect(rules(workspace(SOURCE, undefined, {}))).toEqual(["unchecked-custom-elements"]);
  });

  it("a define() in the scanned folders wins over a component package that defines the same tag", () => {
    const root = workspace(SOURCE, `<ui-button data-on-tap="go">Go</ui-button>\n`);
    writeFiles(root, {
      "apps/web/src/ui-button.html": `<button data-on-click="tap">x</button>\n`,
      "apps/web/src/ui-button.ts": `import { Component, define } from "@nativele/ts-dom";\nimport view from "./ui-button.html.js";\nexport class Local extends Component(view, { emits: { tap: null } }) { tap() { this.emit("tap"); } }\ndefine("ui-button", Local);\n`,
    });
    expect(rules(root)).toEqual([]);
  });

  it("a tag that two component packages of the package define is ambiguous", () => {
    const root = workspace(SOURCE, undefined, { "@acme/ui": "*", "@acme/other": "*" });
    writeFiles(
      root,
      Object.fromEntries(
        Object.entries({
          ...SOURCE,
          "package.json": json({
            name: "@acme/other",
            exports: { ".": "./src/index.ts" },
            peerDependencies: { "@nativele/ts-dom": "^0.7.0" },
          }),
        }).map(([k, v]) => [`packages/other/${k}`, v]),
      ),
    );
    symlinkSync(join(root, "packages/other"), join(root, "node_modules/@acme/other"));
    const issues = lint(root);
    expect(issues.map((i) => i.rule)).toEqual(["unchecked-custom-elements"]);
    expect(issues[0]?.message).toContain("<ui-button> (@acme/ui, @acme/other): defined in several packages");
  });

  it("the components of a package stay out of the index ts-dom gen writes from", () => {
    const root = workspace(SOURCE);
    expect(scanDefines([join(root, "apps/web/src")]).map((d) => d.tag)).toEqual(["app-view"]);
  });

  it("unknown-custom-element names the component package that defines the near tag", () => {
    const issues = lint(workspace(SOURCE, `<ui-buton>Go</ui-buton>\n`));
    expect(issues.map((i) => i.rule)).toEqual(["unknown-custom-element"]);
    expect(issues[0]?.message).toContain("<ui-button>, defined by @acme/ui, is close to it");
  });
});
