import { describe, expect, it } from "vitest";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkA11y } from "../src/lib/a11y.ts";
import { Memo, Workspace } from "../src/lib/components.ts";
import { runDoctor } from "../src/lib/doctor.ts";
import { childrenAt, contractsFor, lintRun } from "../src/lib/lint.ts";
import { cliJson, writeTree } from "./helpers.ts";
import { attrType, manifestsAt, parseManifest } from "../src/lib/manifest.ts";
import type { ManifestElement } from "../src/lib/manifest.ts";

/** A manifest shaped like Web Awesome's: module paths relative to the manifest's folder, a base class outside the manifest whose members it copies (inheritedFrom), a tag only on the export, a missing events array. */
const MANIFEST = {
  schemaVersion: "1.0.0",
  modules: [
    {
      kind: "javascript-module",
      path: "components/button/button.js",
      declarations: [
        {
          kind: "class",
          name: "FkButton",
          customElement: true,
          tagName: "fk-button",
          superclass: { name: "FkElement", module: "/src/internal/fk-element.js" },
          attributes: [
            { name: "variant", type: { text: "'neutral' | 'brand' | 'danger'" }, fieldName: "variant" },
            { name: "size", type: { text: "| 'small'\n    | 'medium'\n    | 'large'" }, fieldName: "size" },
            { name: "disabled", type: { text: "boolean" }, fieldName: "disabled" },
            { name: "href", type: { text: "string" }, fieldName: "href" },
            { name: "with-caret", type: { text: "boolean" }, fieldName: "withCaret" },
            { name: "dir", type: { text: "string" }, fieldName: "dir", inheritedFrom: { name: "FkElement", module: "src/internal/fk-element.ts" } },
          ],
          events: [{ name: "blur" }, { name: "fk-invalid" }],
          slots: [{ name: "" }, { name: "start" }, { name: "end" }],
        },
      ],
      exports: [{ kind: "custom-element-definition", name: "fk-button", declaration: { name: "FkButton", module: "components/button/button.js" } }],
    },
    {
      kind: "javascript-module",
      path: "components/dialog/dialog.js",
      declarations: [
        {
          kind: "class",
          name: "FkDialog",
          customElement: true,
          superclass: { name: "HTMLElement" },
          attributes: [{ name: "open", type: { text: "boolean" } }, { name: "label", type: { text: "string" } }],
          events: [{ name: "fk-show" }, { name: "fk-hide" }],
          slots: [{ name: "" }, { name: "label" }, { name: "footer" }],
        },
      ],
      exports: [{ kind: "custom-element-definition", name: "fk-dialog", declaration: { name: "FkDialog", module: "components/dialog/dialog.js" } }],
    },
    {
      kind: "javascript-module",
      path: "components/rating/rating.js",
      declarations: [
        {
          kind: "class",
          name: "FkRating",
          customElement: true,
          tagName: "fk-rating",
          superclass: { name: "FkElement", module: "/src/internal/fk-element.js" },
          members: [{ kind: "field", name: "dir", inheritedFrom: { name: "FkElement", module: "src/internal/fk-element.ts" } }],
          attributes: [{ name: "max", type: { text: "number" } }, { name: "precision", type: { text: "number | 'any'" } }, { name: "value" }],
        },
      ],
    },
  ],
};

const kid = `import { Component, define } from "@nativele/ts-dom";
import tpl from "./kid.html.js";
export class Kid extends Component(tpl, { props: { label: "", count: 0 } }) {}
define("x-kid", Kid);
`;

/** A project whose package depends on fake-wc, which declares MANIFEST; `templates` are page templates with a class that uses each. */
function fakeProject(templates: Record<string, string>, extra: Record<string, string> = {}, manifest: unknown = MANIFEST): string {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "app", dependencies: { "fake-wc": "^1.0.0", "not-installed": "^1.0.0" } }),
    "node_modules/fake-wc/package.json": JSON.stringify({ name: "fake-wc", customElements: "dist/custom-elements.json" }),
    "node_modules/fake-wc/dist/custom-elements.json": typeof manifest === "string" ? manifest : JSON.stringify(manifest),
    "src/kid.html": `<p>{{ label }}</p><slot name="hint"></slot><slot></slot>\n`,
    "src/kid.ts": kid,
    ...extra,
  };
  for (const [name, html] of Object.entries(templates)) {
    files[`src/${name}.html`] = html;
    files[`src/${name}.ts`] = `import { Component } from "@nativele/ts-dom";\nimport tpl from "./${name}.html.js";\nexport class P extends Component(tpl) {\n  go(): void {}\n}\n`;
  }
  return writeTree(files);
}

const lint = (root: string, a11y = false, ws = new Workspace()) => lintRun([join(root, "src")], { cwd: root, a11y, ws }).issues;
const rulesOf = (issues: { rule: string }[]) => issues.map((i) => i.rule);

describe("attribute types from a manifest", () => {
  it.each([
    ["string", { kind: "string" }],
    ["boolean", { kind: "boolean" }],
    ["number", { kind: "number" }],
    [undefined, { kind: "any" }],
    ["string | null", { kind: "string" }],
    ["string | undefined", { kind: "string" }],
    ["boolean | undefined", { kind: "boolean" }],
    ["number | null", { kind: "number" }],
    ["'a' | 'b'", { kind: "string", values: ["a", "b"] }],
    ["| 'top'\n    | 'bottom'", { kind: "string", values: ["top", "bottom"] }],
    ['"x" | "y"', { kind: "string", values: ["x", "y"] }],
    ["number | 'any'", { kind: "number", values: ["any"] }],
    ["'_self' | '_blank' | string", { kind: "string" }],
    ["number | string", { kind: "string" }],
    ["Element | Element[]", { kind: "any" }],
    ["Date | string", { kind: "any" }],
    ["WaKnownDateSize | 'small'", { kind: "any" }],
    ["boolean | 'mixed'", { kind: "any" }],
    ["(value: number) => string", { kind: "any" }],
  ] as const)("%j", (text, expected) => {
    expect(attrType(text)).toEqual(expected);
  });
});

describe("parseManifest", () => {
  const el = (m: ReturnType<typeof parseManifest>, tag: string): ManifestElement => {
    if (!("elements" in m)) throw new Error(m.error);
    return m.elements.get(tag) as ManifestElement;
  };
  it("reads tags from tagName and from custom-element-definition exports, with attributes, events and slots", () => {
    const m = parseManifest(JSON.stringify(MANIFEST), "fake-wc", "m.json");
    expect("elements" in m && [...m.elements.keys()]).toEqual(["fk-button", "fk-rating", "fk-dialog"]);
    const button = el(m, "fk-button");
    expect(button.attrs.get("variant")).toEqual({ name: "variant", kind: "string", values: ["neutral", "brand", "danger"] });
    expect(button.attrs.get("size")?.values).toEqual(["small", "medium", "large"]);
    expect(button.openAttrs).toBe(false);
    expect(button.events).toEqual(["blur", "fk-invalid"]);
    expect(button.slots).toEqual(["", "start", "end"]);
    expect(el(m, "fk-dialog").slots).toEqual(["", "label", "footer"]);
  });
  it("an element without events or slots has none when other elements of the manifest list theirs, and unknown ones when none does", () => {
    expect(el(parseManifest(JSON.stringify(MANIFEST), "p", "m.json"), "fk-rating")).toMatchObject({ events: [], slots: [] });
    const bare = { schemaVersion: "2.1.0", modules: [{ path: "x.js", declarations: [{ name: "X", customElement: true, tagName: "x-x", superclass: { name: "HTMLElement" }, attributes: [{ name: "a" }] }] }] };
    expect(el(parseManifest(JSON.stringify(bare), "p", "m.json"), "x-x")).toMatchObject({ events: null, slots: null, openAttrs: false });
  });
  it("without resolved inheritance, merges the attributes and events of a superclass in the manifest and is open for one it cannot find", () => {
    const decl = (name: string, tag: string | undefined, sup: object | undefined, attr: string, event: string) => ({ name, ...(tag ? { customElement: true, tagName: tag } : {}), ...(sup ? { superclass: sup } : {}), attributes: [{ name: attr, type: { text: "string" } }], events: [{ name: event }] });
    const m = parseManifest(
      JSON.stringify({
        schemaVersion: "1.0.0",
        modules: [
          { path: "base.js", declarations: [decl("Base", undefined, { name: "LitElement", package: "lit" }, "base-attr", "base-event")] },
          { path: "a.js", declarations: [decl("A", "x-a", { name: "Base", module: "base.js" }, "a-attr", "a-event"), decl("B", "x-b", { name: "Elsewhere", module: "/src/elsewhere.js" }, "b-attr", "b-event"), decl("C", "x-c", { name: "C2" }, "c-attr", "c-event"), decl("C2", undefined, { name: "C" }, "c2-attr", "c2-event")] },
        ],
      }),
      "p",
      "m.json",
    );
    expect(el(m, "x-a")).toMatchObject({ openAttrs: false, events: ["a-event", "base-event"] });
    expect([...el(m, "x-a").attrs.keys()]).toEqual(["a-attr", "base-attr"]);
    expect(el(m, "x-b").openAttrs).toBe(true);
    expect(el(m, "x-c").openAttrs).toBe(true);
    expect([...el(m, "x-c").attrs.keys()]).toEqual(["c-attr", "c2-attr"]);
  });
  it("gives a form-associated element the form attribute the browser handles", () => {
    const m = parseManifest(JSON.stringify({ schemaVersion: "1.0.0", modules: [{ path: "x.js", declarations: [{ name: "X", customElement: true, tagName: "x-x", superclass: { name: "HTMLElement" }, members: [{ kind: "field", name: "formAssociated", static: true }], attributes: [{ name: "name", type: { text: "string" } }] }] }] }), "p", "m.json");
    expect([...el(m, "x-x").attrs.keys()]).toEqual(["name", "form"]);
  });
  it("drops a malformed attribute and leaves the element open, lowercasing attribute names as HTML does", () => {
    const m = parseManifest(JSON.stringify({ schemaVersion: "1.0.0", modules: [{ path: "x.js", declarations: [{ name: "X", customElement: true, tagName: "x-x", superclass: { name: "HTMLElement" }, attributes: [{ type: { text: "string" } }, { name: "maxLength", type: { text: "number" } }, 7] }] }] }), "p", "m.json");
    expect(el(m, "x-x").openAttrs).toBe(true);
    expect([...el(m, "x-x").attrs.keys()]).toEqual(["maxlength"]);
  });
  it.each([
    ["{", /is not valid JSON/],
    ["[]", /is not a JSON object/],
    [`{ "schemaVersion": "3.0.0", "modules": [] }`, /has schemaVersion "3.0.0", which lint does not read \(it reads 1.x and 2.x\)/],
    [`{ "modules": [] }`, /has schemaVersion null/],
  ])("reports %s as unreadable", (text, error) => {
    const m = parseManifest(text, "p", "m.json");
    expect("error" in m && m.error).toMatch(error);
  });
});

describe("finding the manifests of a package", () => {
  const pkgs = (root: string, dir = root) => manifestsAt(new Workspace(), dir).map((m) => [m.pkg, "error" in m ? m.error : [...m.elements.keys()].join(",")]);
  const lib = (name: string, tag: string) => ({
    [`${name}/package.json`]: JSON.stringify({ name, customElements: "custom-elements.json" }),
    [`${name}/custom-elements.json`]: JSON.stringify({ schemaVersion: "1.0.0", modules: [{ path: "x.js", declarations: [{ name: "X", customElement: true, tagName: tag }] }] }),
  });
  it("reads the package's own manifest and those of its installed dependencies; a dependency that is not installed or declares none is skipped", () => {
    const root = writeTree({
      "package.json": JSON.stringify({
        name: "app",
        customElements: "own.json",
        dependencies: { a: "1", missing: "1" },
        devDependencies: { plain: "1" },
        peerDependencies: { "@s/b": "1" },
      }),
      "own.json": JSON.stringify({
        schemaVersion: "1.0.0",
        modules: [{ path: "o.js", declarations: [{ name: "O", customElement: true, tagName: "app-own" }] }],
      }),
      "node_modules/plain/package.json": JSON.stringify({ name: "plain" }),
      ...Object.fromEntries(Object.entries({ ...lib("a", "a-x"), ...lib("@s/b", "b-x") }).map(([k, v]) => [`node_modules/${k}`, v])),
    });
    expect(pkgs(root)).toEqual([["app", "app-own"], ["a", "a-x"], ["@s/b", "b-x"]]);
  });
  it("finds a dependency hoisted to the workspace root, and one linked as pnpm does, by its real path", () => {
    const root = writeTree({
      "package.json": JSON.stringify({ private: true, workspaces: ["apps/*"] }),
      "apps/one/package.json": JSON.stringify({ dependencies: { a: "1", b: "1" } }),
      ...Object.fromEntries(Object.entries(lib("a", "a-x")).map(([k, v]) => [`node_modules/${k}`, v])),
      ...Object.fromEntries(Object.entries(lib("b", "b-x")).map(([k, v]) => [`node_modules/.pnpm/b@1/node_modules/${k}`, v])),
    });
    mkdirSync(join(root, "apps/one/node_modules"), { recursive: true });
    symlinkSync(join(root, "node_modules/.pnpm/b@1/node_modules/b"), join(root, "apps/one/node_modules/b"));
    const found = manifestsAt(new Workspace(), join(root, "apps/one"));
    expect(found.map((m) => m.pkg)).toEqual(["a", "b"]);
    expect(found[1]?.file).toBe(join(root, "node_modules/.pnpm/b@1/node_modules/b/custom-elements.json"));
  });
  it("does not look above the package when there is no workspace root", () => {
    const root = writeTree({
      "package.json": JSON.stringify({ name: "outer" }),
      "inner/package.json": JSON.stringify({ dependencies: { a: "1" } }),
      ...Object.fromEntries(Object.entries(lib("a", "a-x")).map(([k, v]) => [`node_modules/${k}`, v])),
    });
    expect(pkgs(root, join(root, "inner"))).toEqual([]);
  });
  it("names a missing manifest file", () => {
    const root = writeTree({
      "package.json": JSON.stringify({ dependencies: { a: "1" } }),
      "node_modules/a/package.json": JSON.stringify({ customElements: "gone.json" }),
    });
    expect(pkgs(root)).toEqual([["a", "does not exist"]]);
  });
  it("parses a manifest once while its text is the same, and again when it changes", () => {
    const root = fakeProject({});
    const memo = new Memo();
    const first = manifestsAt(new Workspace(memo), root)[0];
    expect(manifestsAt(new Workspace(memo), root)[0]).toBe(first);
    writeFileSync(join(root, "node_modules/fake-wc/dist/custom-elements.json"), JSON.stringify({ ...MANIFEST, modules: MANIFEST.modules.slice(0, 1) }));
    const changed = manifestsAt(new Workspace(memo), root)[0];
    expect(changed).not.toBe(first);
    expect(changed && "elements" in changed && [...changed.elements.keys()]).toEqual(["fk-button"]);
  });
});

describe("lint with a dependency's custom elements manifest", () => {
  it("a correct template has no findings, and the manifest's tags are not listed by unchecked-custom-elements", () => {
    const root = fakeProject({
      page: `<fk-button variant="brand" size="medium" disabled href="/x" with-caret dir="rtl" data-on-click="go" data-on-fk-invalid="go" data-on-blur="go"><span slot="start">a</span>Go</fk-button>
<fk-dialog label="Hi" open data-on-fk-hide="go"><fk-button slot="footer">Close</fk-button></fk-dialog>
<fk-rating max="5" precision="any" value="whatever"></fk-rating>
<fk-rating precision="0.5"></fk-rating>
<x-kid label="a" count="2"><b slot="hint">h</b><i>default</i></x-kid>
`,
    });
    expect(lint(root, true)).toEqual([]);
  });
  it("unknown-prop, invalid-prop-value, unknown-event and unknown-slot on manifest tags", () => {
    const root = fakeProject({
      page: `<fk-button varient="brand"></fk-button>
<fk-button variant="brandd"></fk-button>
<fk-button disabled="false"></fk-button>
<fk-rating max="five"></fk-rating>
<fk-rating precision="all"></fk-rating>
<fk-dialog data-on-fk-hidee="go"><p slot="foter">x</p></fk-dialog>
<fk-rating data-on-fk-change="go"></fk-rating>
`,
    });
    const issues = lint(root);
    expect(issues.map((i) => `${i.line} ${i.rule}`)).toEqual(["1 unknown-prop", "2 invalid-prop-value", "3 invalid-prop-value", "4 invalid-prop-value", "5 invalid-prop-value", "6 unknown-event", "6 unknown-slot", "7 unknown-event"]);
    const m = issues.map((i) => i.message);
    expect(m[0]).toBe(`<fk-button varient> is not an attribute the custom elements manifest of fake-wc declares for <fk-button>. Attributes: variant, size, disabled, href, with-caret, dir. Did you mean "variant"? Fix: correct the attribute name, or set the property from TypeScript (this.refs.x.name = value) if it has no attribute.`);
    expect(m[1]).toBe(`<fk-button variant="brandd">: "brandd" is not a value the custom elements manifest of fake-wc declares for variant: neutral, brand, danger. Did you mean "brand"? Fix: use one of the listed values.`);
    expect(m[2]).toBe(`<fk-button disabled="false"> sets disabled to true: a boolean attribute of a library element is true whenever it is present, whatever its value. Fix: remove the attribute, or set the property from TypeScript (this.refs.x.disabled = false).`);
    expect(m[3]).toBe(`<fk-rating max="five">: the custom elements manifest of fake-wc declares max a number, and "five" is not, so the element reads it as NaN. Fix: write a number, such as max="5".`);
    expect(m[4]).toContain(`declares precision a number, or one of "any", and "all" is not`);
    expect(m[5]).toBe(`The custom elements manifest of fake-wc lists no event "fk-hidee" for <fk-dialog>, so data-on-fk-hidee will never fire. Events: fk-show, fk-hide. Did you mean "fk-hide"? Fix: correct the event name.`);
    expect(m[6]).toBe(`<fk-dialog> has no slot "foter" in the custom elements manifest of fake-wc, so this element is not shown. Slots: label, footer. Did you mean "footer"? Fix: use one of the slot names, or remove the slot attribute.`);
    expect(m[7]).toContain("It lists no events for it.");
    expect(rulesOf(issues)).not.toContain("unchecked-custom-elements");
  });
  it("a Nativele component: a number prop that is not a number, and a slot its template does not have; a forwarded slot is checked like any child", () => {
    const root = fakeProject({ page: `<x-kid count="many"><b slot="hnt">h</b><slot name="hint" slot="hint"></slot><slot name="x" slot="tip"></slot></x-kid>\n` });
    const issues = lint(root);
    expect(issues.map((i) => `${i.line}:${i.col} ${i.rule}`)).toEqual(["1:1 invalid-prop-value", "1:21 unknown-slot", "1:77 unknown-slot"]);
    expect(issues[0]?.message).toBe(`<x-kid count="many">: the prop "count" is a number, and "many" is not one, so the component warns at run time and keeps the default value. Fix: write a number, such as count="5".`);
    expect(issues[1]?.message).toBe(`<x-kid> has no slot "hnt" in its template (src/kid.html), so this element is not shown. Slots: hint. Did you mean "hint"? Fix: use one of the slot names, or remove the slot attribute.`);
    expect(issues[2]?.message).toContain(`no slot "tip"`);
  });
  it("a Nativele boolean prop set to \"false\" is not reported, since the component reads it as false", () => {
    const root = fakeProject({ page: `<x-flag on="false"></x-flag>\n` }, { "src/flag.html": "<p></p>\n", "src/flag.ts": `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./flag.html.js";\nexport class Flag extends Component(tpl, { props: { on: false } }) {}\ndefine("x-flag", Flag);\n` });
    expect(lint(root)).toEqual([]);
  });
  it("unknown-custom-element: a tag one or two edits from a known tag with the same prefix, left out of unchecked-custom-elements", () => {
    const root = fakeProject({ page: `<fk-buton></fk-buton>\n<fk-buton></fk-buton>\n<x-kd></x-kd>\n<fk-pro-thing></fk-pro-thing>\n<x-tagmap></x-tagmap>\n<x-tagmpa></x-tagmpa>\n<y-kid></y-kid>\n` }, {
      "src/types.ts": `declare global {\n  interface HTMLElementTagNameMap {\n    "x-tagmap": HTMLElement;\n  }\n}\nexport {};\n`,
    });
    const issues = lint(root);
    expect(issues.map((i) => `${i.line} ${i.rule}`)).toEqual(["1 unknown-custom-element", "3 unknown-custom-element", "6 unknown-custom-element", "4 unchecked-custom-elements"]);
    expect(issues[0]?.message).toBe(`<fk-buton> is not defined in the scanned folders or by the custom elements manifest of fake-wc, so the browser leaves it an undefined element that shows only its children; <fk-button>, defined by the custom elements manifest of fake-wc, is close to it. Did you mean "fk-button"? Fix: correct the tag name; if another package defines it, list that package in this package's dependencies (lint reads a dependency's components when it is a Nativele component package that exports them, and another library's elements when its package declares a custom elements manifest).`);
    expect(issues[1]?.message).toContain(`<x-kid>, defined by a define() in the scanned folders, is close to it.`);
    expect(issues[2]?.message).toContain(`<x-tagmap>, defined by a customElements.define() or HTMLElementTagNameMap entry in the scanned TypeScript, is close to it.`);
    const unchecked = issues[3]?.message ?? "";
    expect(unchecked).toContain("<fk-pro-thing>, <y-kid>: no define()");
    expect(unchecked).toContain("<x-tagmap>: declared only in TypeScript (customElements.define() or an HTMLElementTagNameMap entry), which gives lint the tag name but none of its attributes, events or slots.");
    expect(unchecked).toContain("for <x-tagmap>, when it is a Nativele component, define it with define()");
    expect(unchecked).not.toMatch(/fk-buton|x-kd|x-tagmpa/);
  });
  it("a define() in the scanned folders wins over a manifest that defines the same tag", () => {
    const root = fakeProject({ page: `<fk-button label="a"></fk-button>\n` }, { "src/fk.html": "<p></p>\n", "src/fk.ts": kid.replace("./kid.html.js", "./fk.html.js").replace('"x-kid"', '"fk-button"').replace(/Kid/g, "Fk") });
    expect(lint(root)).toEqual([]);
  });
  it("a tag that two manifests of the package's dependencies define is listed as ambiguous", () => {
    const root = fakeProject({ page: `<fk-button varient="x"></fk-button>\n` }, {
      "package.json": JSON.stringify({ dependencies: { "fake-wc": "1", "fake-wc2": "1" } }),
      "node_modules/fake-wc2/package.json": JSON.stringify({ customElements: "custom-elements.json" }),
      "node_modules/fake-wc2/custom-elements.json": JSON.stringify(MANIFEST),
    });
    const issues = lint(root);
    expect(rulesOf(issues)).toEqual(["unchecked-custom-elements"]);
    expect(issues[0]?.message).toContain("<fk-button> (fake-wc, fake-wc2): defined in several packages");
  });
  it("each package reads the manifest of its own dependency, also for the same tag", () => {
    const v2 = {
      ...MANIFEST,
      modules: [
        {
          ...MANIFEST.modules[0],
          declarations: [
            {
              ...MANIFEST.modules[0]?.declarations[0],
              superclass: { name: "HTMLElement" },
              attributes: [{ name: "tone", type: { text: "'loud'" } }],
            },
          ],
        },
      ],
    };
    const root = writeTree({
      "pnpm-workspace.yaml": "packages: [a, b]\n",
      "a/package.json": JSON.stringify({ dependencies: { "fake-wc": "1" } }),
      "a/node_modules/fake-wc/package.json": JSON.stringify({ customElements: "cem.json" }),
      "a/node_modules/fake-wc/cem.json": JSON.stringify(MANIFEST),
      "b/package.json": JSON.stringify({ dependencies: { "fake-wc": "2" } }),
      "b/node_modules/fake-wc/package.json": JSON.stringify({ customElements: "cem.json" }),
      "b/node_modules/fake-wc/cem.json": JSON.stringify(v2),
      ...Object.fromEntries(["a", "b"].flatMap((p) => [[`${p}/p.html`, `<fk-button variant="brand" tone="loud"></fk-button>\n`], [`${p}/p.ts`, `import tpl from "./p.html.js";\nexport class P extends Component(tpl) {}\n`]])),
    });
    const issues = lintRun([join(root, "a"), join(root, "b")], { cwd: root }).issues;
    expect(issues.map((i) => `${i.file} ${i.message.slice(0, i.message.indexOf(">") + 1)}`)).toEqual(["a/p.html <fk-button tone>", "b/p.html <fk-button variant>"]);
  });
  it("findings are recomputed when the manifest changes and kept while it does not", () => {
    const root = fakeProject({ page: `<fk-button tone="x"></fk-button>\n` });
    const memo = new Memo();
    expect(rulesOf(lint(root, false, new Workspace(memo)))).toEqual(["unknown-prop"]);
    const file = join(root, "node_modules/fake-wc/dist/custom-elements.json");
    const withTone = JSON.parse(JSON.stringify(MANIFEST)) as typeof MANIFEST;
    (withTone.modules[0]?.declarations[0]?.attributes as object[] | undefined)?.push({ name: "tone", type: { text: "string" } });
    writeFileSync(file, JSON.stringify(withTone));
    expect(lint(root, false, new Workspace(memo))).toEqual([]);
    expect(lint(root, false, new Workspace(memo))).toEqual([]);
  });
  it("an unreadable manifest is treated as absent: its tags fall back to unchecked-custom-elements", () => {
    const root = fakeProject({ page: `<fk-button varient="x"></fk-button>\n` }, {}, "{ not json");
    expect(rulesOf(lint(root))).toEqual(["unchecked-custom-elements"]);
  });
});

describe("accessibility with manifest elements", () => {
  it("content holding a manifest element is not judged and names the third-party cause; data-on-click on the element itself is not reported", () => {
    const root = fakeProject({ page: `<div data-on-click="go"><fk-button>Go</fk-button></div>\n<fk-button data-on-click="go">Go</fk-button>\n` });
    const issues = lint(root, true);
    expect(rulesOf(issues)).toEqual(["unchecked-content"]);
    expect(issues[0]?.message).toContain("its content holds <fk-button> (an element of a package whose custom elements manifest declares its attributes, events and slots but not what it renders: fake-wc)");
    expect(issues[0]?.message).toContain("for <fk-button>, check by hand that the element around it is operable or named.");
  });
  it("childrenAt gives a manifest tag its contract, with the third-party cause and no template", () => {
    const root = fakeProject({ page: "<p></p>\n" });
    const children = childrenAt(contractsFor([join(root, "src")], root), join(root, "src/page.html"));
    expect(children.get("fk-button")?.unread).toEqual({ cause: "third-party", pkg: "fake-wc" });
    expect(children.get("fk-button")?.template).toBeUndefined();
    expect(checkA11y(`<button><fk-button></fk-button></button>`, [], children)[0]?.message).toContain("fake-wc");
  });
});

describe("ts-dom doctor: custom-elements-manifest", () => {
  it.each([
    [undefined, "does not exist"],
    ["{", "is not valid JSON"],
    [`{ "schemaVersion": "9.0.0" }`, `has schemaVersion "9.0.0"`],
  ])("reports a dependency's manifest that %s", (text, reason) => {
    const root = writeTree({
      "package.json": JSON.stringify({ dependencies: { "fake-wc": "1" } }),
      "node_modules/fake-wc/package.json": JSON.stringify({ customElements: "dist/cem.json" }),
      ...(text === undefined ? {} : { "node_modules/fake-wc/dist/cem.json": text }),
      "src/x.html": "<p></p>",
    });
    const issue = runDoctor({ dirs: ["src"], cwd: root }).find((i) => i.rule === "custom-elements-manifest");
    expect(issue).toMatchObject({ severity: "warning", file: "node_modules/fake-wc/dist/cem.json" });
    expect(issue?.message).toContain(`The custom elements manifest that fake-wc declares in the customElements field of its package.json, node_modules/fake-wc/dist/cem.json, ${reason}`);
    expect(issue?.message).toContain("Fix: update fake-wc, or report the broken manifest to its maintainers.");
  });
  it("is silent for a readable manifest", () => {
    const root = fakeProject({});
    expect(runDoctor({ dirs: ["src"], cwd: root }).map((i) => i.rule)).not.toContain("custom-elements-manifest");
  });
});

describe("what a manifest leaves out", () => {
  const el = (m: ReturnType<typeof parseManifest>, tag: string): ManifestElement => {
    if (!("elements" in m)) throw new Error(m.error);
    return m.elements.get(tag) as ManifestElement;
  };
  const decl = (name: string, tag: string | undefined, sup: object | undefined, extra: object = {}) => ({ name, ...(tag ? { customElement: true, tagName: tag } : {}), ...(sup ? { superclass: sup } : {}), ...extra });
  const cem = (...declarations: object[]) => JSON.stringify({ schemaVersion: "1.0.0", modules: [{ path: "x.js", declarations }] });
  it("an element whose superclass is not in the manifest, with no inherited members, is open for attributes, events and slots", () => {
    const m = parseManifest(cem(decl("A", "x-a", { name: "Ext", package: "other" }, { attributes: [{ name: "a" }], events: [{ name: "a-ev" }], slots: [{ name: "s" }] }), decl("B", "x-b", { name: "HTMLElement" }, { events: [{ name: "b-ev" }], slots: [{ name: "" }] })), "p", "m.json");
    expect(el(m, "x-a")).toMatchObject({ openAttrs: true, events: null, listedEvents: ["a-ev"], slots: null });
  });
  it("one element with inherited members does not close the chain of another", () => {
    const m = parseManifest(cem(decl("A", "x-a", { name: "Base", module: "/src/base.js" }, { attributes: [{ name: "dir", inheritedFrom: { name: "Base" } }] }), decl("B", "x-b", { name: "Ext", package: "other" }, { attributes: [{ name: "b" }] })), "p", "m.json");
    expect(el(m, "x-a").openAttrs).toBe(false);
    expect(el(m, "x-b").openAttrs).toBe(true);
  });
  it("merges the slots of a superclass in the manifest", () => {
    const m = parseManifest(cem(decl("Base", undefined, { name: "LitElement" }, { slots: [{ name: "footer" }] }), decl("D", "x-d", { name: "Base" }, { slots: [{ name: "" }] })), "p", "m.json");
    expect(el(m, "x-d").slots).toEqual(["", "footer"]);
  });
  it("lint reports nothing on an open element, and accepts slots and events inherited in the manifest", () => {
    const manifest = { schemaVersion: "1.0.0", modules: [{ path: "x.js", declarations: [
      decl("A", "fk-open", { name: "Ext", package: "other" }, { attributes: [{ name: "a", type: { text: "string" } }] }),
      decl("Base", undefined, { name: "LitElement" }, { slots: [{ name: "footer" }], events: [{ name: "fk-close" }] }),
      decl("D", "fk-dlg", { name: "Base" }, { slots: [{ name: "" }], events: [{ name: "fk-open" }] }),
    ] }] };
    const root = fakeProject({ page: `<fk-open b="x" data-on-fk-thing="go"><p slot="any">x</p></fk-open>\n<fk-dlg data-on-fk-close="go"><p slot="footer">x</p></fk-dlg>\n` }, {}, manifest);
    expect(lint(root)).toEqual([]);
  });
});

describe("attributes every element has", () => {
  it("global attributes and inline handlers are not props, and an attribute starting with on is checked like any other", () => {
    const root = fakeProject({ page: `<fk-button inputmode="numeric" enterkeyhint="go" autocapitalize="off" autocorrect="on" writingsuggestions="false" itemref="a" onclick="x" onblur="y"></fk-button>\n<fk-dialog open="false"></fk-dialog>\n<fk-button onfoo="x"></fk-button>\n` });
    expect(lint(root).map((i) => `${i.line} ${i.rule}`)).toEqual(["2 invalid-prop-value", "3 unknown-prop"]);
  });
});

describe("unknown-custom-element ignored", () => {
  it("a likely typo is listed by unchecked-custom-elements when unknown-custom-element is ignored", () => {
    const root = fakeProject({ page: `<fk-buton></fk-buton>\n` });
    const issues = lintRun([join(root, "src")], { cwd: root, ignore: ["unknown-custom-element"] }).issues.filter((i) => i.rule !== "unknown-custom-element");
    expect(rulesOf(issues)).toEqual(["unchecked-custom-elements"]);
    expect(issues[0]?.message).toContain("<fk-buton>");
    const cli = (cmd: string) => cliJson([cmd, "src", "--ignore=unknown-custom-element", "--json"], root).issues.filter((i) => i.rule === "unchecked-custom-elements");
    expect(cli("lint")[0]?.message).toContain("<fk-buton>");
  });
});

describe("unknown-native-event", () => {
  const kidEmitting = (bubbles: boolean) => `import { Component, define, event } from "@nativele/ts-dom";\nimport tpl from "./kid.html.js";\nexport class Kid extends Component(tpl, { props: { label: "", count: 0 }, emits: { clicked: event<{ id: string }>(${bubbles ? "{ bubbles: true }" : ""}) } }) {}\ndefine("x-kid", Kid);\n`;
  const page = `<form data-on-submt="go"></form>\n<p data-on-clik="go"></p>\n<form data-on-submit="go"></form>\n<div data-on-clicked="go"><x-kid></x-kid></div>\n<div data-on-fk-selected="go"></div>\n<div data-on-selectd="go"></div>\n<div data-on-quantity-change="go"></div>\n`;
  const found = (root: string, ws?: Workspace) => lint(root, false, ws).filter((i) => i.rule === "unknown-native-event" || i.rule === "custom-event-on-native").map((i) => `${i.line}:${i.col} ${i.rule}`);
  const manifest = { ...MANIFEST, modules: [...MANIFEST.modules, { kind: "javascript-module", path: "components/menu/menu.js", declarations: [{ kind: "class", name: "FkMenu", customElement: true, tagName: "fk-menu", superclass: { name: "HTMLElement" }, attributes: [], events: [{ name: "selectd" }] }] }] };

  it("reports a misspelled native event on a native element, with the closest native name", () => {
    const issues = lint(fakeProject({ page }, { "src/kid.ts": kidEmitting(true) }, manifest)).filter((i) => i.rule === "unknown-native-event");
    expect(issues.map((i) => `${i.line}:${i.col}`)).toEqual(["1:7", "2:4"]);
    expect(issues[0]?.message).toBe(`data-on-submt is on the native element <form>, but "submt" is not an event <form> fires, nothing in the scanned folders emits or dispatches it with bubbles: true, no applicable custom elements manifest lists it, and the element holds nothing whose events lint cannot read, so go() never runs. Did you mean "submit"? Fix: correct the event name; if "submt" is a custom event a child component emits, declare it with event<...>({ bubbles: true }) in that child's emits so lint knows it reaches <form>.`);
    expect(issues[1]?.message).toContain(`Did you mean "click"?`);
  });
  it("leaves out an event a child emits with bubbles: true, one a manifest lists, and a name far from every native event", () => {
    expect(found(fakeProject({ page }, { "src/kid.ts": kidEmitting(true) }, manifest))).toEqual(["1:7 unknown-native-event", "2:4 unknown-native-event"]);
  });
  it("an event a child emits without bubbles: true is custom-event-on-native, not a misspelling", () => {
    expect(found(fakeProject({ page }, { "src/kid.ts": kidEmitting(false) }, manifest))).toEqual(["1:7 unknown-native-event", "2:4 unknown-native-event", "4:6 custom-event-on-native"]);
  });
  it("leaves out an event a manifest lists for an element whose superclass chain it may leave incomplete", () => {
    const open = { ...MANIFEST, modules: [...MANIFEST.modules, { kind: "javascript-module", path: "components/menu/menu.js", declarations: [{ kind: "class", name: "FkMenu", customElement: true, tagName: "fk-menu", superclass: { name: "FkOutside", module: "/src/outside.js" }, attributes: [], events: [{ name: "selectd" }] }] }] };
    expect(found(fakeProject({ page: `<div data-on-selectd="go"></div>\n<p data-on-clik="go"></p>\n` }, {}, open))).toEqual(["2:4 unknown-native-event"]);
  });
  it("leaves out an event a module in the scanned folders dispatches with bubbles: true", () => {
    const fires = `export class Fires extends HTMLElement {\n  a(): void { this.dispatchEvent(new CustomEvent("changed", { detail: 1, bubbles: true })); }\n  b(): void { this.dispatchEvent(new Event('chnge', { bubbles: true, composed: true })); }\n  c(): void { this.dispatchEvent(new CustomEvent("submitt", { detail: { bubbles: true } })); }\n  d(): void { this.dispatchEvent(new CustomEvent("clickd")); }\n}\n`;
    const page = `<div data-on-changed="go"></div>\n<div data-on-chnge="go"></div>\n<form data-on-submitt="go"></form>\n<p data-on-clickd="go"></p>\n`;
    expect(found(fakeProject({ page }, { "src/fires.ts": fires }))).toEqual(["3:7 unknown-native-event", "4:4 unknown-native-event"]);
  });
  it("is not reported when the element holds content whose events lint cannot know", () => {
    const wrap = { "src/wrap.html": `<div><sl-menu></sl-menu></div>\n`, "src/wrap.ts": `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./wrap.html.js";\nexport class Wrap extends Component(tpl) {}\ndefine("x-wrap", Wrap);\n` };
    const page = [
      `<div data-on-selectd="go"><span><sl-menu></sl-menu></span></div>`,
      `<div data-on-selectd="go"><slot></slot></div>`,
      `<div data-on-selectd="go"><x-wrap></x-wrap></div>`,
      `<div data-on-selectd="go"><fk-tabs></fk-tabs></div>`,
      `<div data-on-selectd="go"><template data-each="rows"><li><sl-menu></sl-menu></li></template></div>`,
      `<div data-on-selectd="go"><x-kid></x-kid></div>`,
      `<div data-on-selectd="go"><fk-button></fk-button></div>`,
      `<div data-on-selectd="go"><span></span></div><sl-menu></sl-menu>`,
    ].join("\n");
    const tabs = { ...MANIFEST, modules: [...MANIFEST.modules, { kind: "javascript-module", path: "components/tabs/tabs.js", declarations: [{ kind: "class", name: "FkTabs", customElement: true, tagName: "fk-tabs", superclass: { name: "FkOutside", module: "/src/outside.js" }, attributes: [] }] }] };
    expect(found(fakeProject({ page }, wrap, tabs))).toEqual(["6:6 unknown-native-event", "7:6 unknown-native-event", "8:6 unknown-native-event"]);
  });
  it("reports a name close to a native event that nothing declares, and follows the child's bubbles: true across runs", () => {
    const root = fakeProject({ page: `<div data-on-clicked="go"><x-kid></x-kid></div>\n<div data-on-selectd="go"></div>\n` });
    const memo = new Memo();
    expect(found(root, new Workspace(memo))).toEqual(["1:6 unknown-native-event", "2:6 unknown-native-event"]);
    writeFileSync(join(root, "src/kid.ts"), kidEmitting(true));
    expect(found(root, new Workspace(memo))).toEqual(["2:6 unknown-native-event"]);
  });
  it("an event native to another element is not a misspelling", () => {
    expect(found(fakeProject({ page: `<div data-on-unload="go"></div>\n<div data-on-encrypted="go"></div>\n` }))).toEqual([]);
  });
});

describe("lint --json", () => {
  const emitter = `import { Component, define, event } from "@nativele/ts-dom";\nimport tpl from "./emitter.html.js";\nexport class Emitter extends Component(tpl, { emits: { "kid-done": event() } }) {}\ndefine("x-emitter", Emitter);\n`;
  const page = [
    `<form data-on-submt="go"></form>`,
    `<div data-on-kid-done="go"><x-emitter></x-emitter></div>`,
    `<x-kid data-ref="kid" bogus="1" count="many" data-on-nope="go"><span slot="nosuch"></span></x-kid>`,
    `<x-kidd></x-kidd>`,
    `<sl-other></sl-other>`,
    `<input data-ref="name"><p data-ref="unused"></p><img src="a.png">`,
    `<x-emitter data-on-kid-done="relay"></x-emitter>`,
    `<x-emitter data-on-kid-done="relay"></x-emitter>`,
  ].join("\n");
  const code = `import { Component, event } from "@nativele/ts-dom";\nimport tpl from "./page.html.js";\nexport class P extends Component(tpl, { props: { label: "" }, emits: { "kid-done": event() } }) {\n  go(): void { this.label = "x"; }\n  relay(e: Event): void { this.emit("kid-done", e); }\n  override render(v: { label: string }): void {\n    this.refs.name.value = v.label;\n    this.refs.kid.label = this.props.label;\n  }\n}\n`;
  const root = () =>
    fakeProject(
      {},
      {
        "src/emitter.html": `<p></p>\n`,
        "src/emitter.ts": emitter,
        "src/page.html": `${page}\n`,
        "src/page.ts": code,
        "src/orphan.html": `<p></p>\n`,
      },
    );
  const issues = (dir: string) => cliJson<{ issues: Record<string, unknown>[] }>(["lint", "src", "--a11y", "--json"], dir).issues;

  it("prints every issue with exactly the documented keys: file, line, col, severity, rule, message", () => {
    const found = issues(root());
    for (const i of found) expect(Object.keys(i).sort()).toEqual(["col", "file", "line", "message", "rule", "severity"]);
    const rules = new Set(found.map((i) => i.rule));
    for (const rule of ["unknown-native-event", "custom-event-on-native", "unknown-prop", "invalid-prop-value", "unknown-event", "unknown-slot", "unknown-custom-element", "unchecked-custom-elements", "unguarded-input-value", "emit-forwarding", "props-mutation", "prop-forwarding", "unused-ref", "no-importer", "img-alt"]) expect(rules).toContain(rule);
  });
  it("emit-forwarding points at each data-on-* it reports, also when one method handles several of them", () => {
    expect(issues(root()).filter((i) => i.rule === "emit-forwarding").map((i) => `${i.line}:${i.col}`)).toEqual(["7:12", "8:12"]);
  });
});
