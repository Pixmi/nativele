import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCheck } from "../src/lib/check.ts";
import { linkTypescript, writeTree } from "./helpers.ts";
import type { LintIssue } from "../src/lib/lint.ts";

// One project with every way a template, its class, its define() call and their files can be related; one `ts-dom check --a11y` run reads all of them.
const H = `import { Component, define, event } from "@nativele/ts-dom";\n`;
const files: Record<string, string> = {
  "tsconfig.json": `{ "extends": ${JSON.stringify(join(process.cwd(), "tsconfig.json"))}, "include": ["."] }`,
  // define() in another file than the class, and two classes defined from one registry file
  "registry/a.html": `<button type="button" data-on-click="pick">A</button>\n`,
  "registry/b.html": `<input aria-label="b" data-on-input="pick">\n`,
  "registry/b-comp.ts": `${H}import tpl from "./b.html.js";\nexport class BComp extends Component(tpl) {\n  pick(_e: MouseEvent): void {}\n}\n`,
  "registry/a-comp.ts": `${H}import tpl from "./a.html.js";\nimport { BComp } from "./b-comp.ts";\nexport class AComp extends Component(tpl) {\n  pick(_e: MouseEvent): void {}\n}\ndefine("a-comp", AComp);\ndefine("b-comp", BComp);\n`,
  "registry/panel.html": `<button type="button" data-on-click="save">Save</button>\n`,
  "registry/panel.ts": `${H}import tpl from "./panel.html.js";\nexport class Panel extends Component(tpl) {}\n`,
  "registry/card.html": `<div><span>{{ heading }}</span></div>\n`,
  "registry/card.ts": `${H}import tpl from "./card.html.js";\nclass Card extends Component(tpl, { props: { heading: "" }, emits: { "card-open": event() } }) {}\nexport { Card as RegistryCard };\n`,
  "registry/register.ts": `${H}import { Panel } from "./panel.ts";\nimport { RegistryCard } from "./card.ts";\ndefine("x-panel", Panel);\ndefine("x-registry-card", RegistryCard);\n`,
  "registry/page.html": `<x-registry-card data-ref="card" data-on-click="go" bogus="1" data-on-card-close="go"></x-registry-card>\n`,
  "registry/page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {\n    const heading: string = this.refs.card.heading;\n    void heading;\n  }\n}\ndefine("x-registry-page", Page);\n`,
  // a define() of a class that does not extend Component(...)
  "plain/plain.ts": `${H}class Plain extends HTMLElement {}\ndefine("x-plain", Plain);\n`,
  "plain/host.html": `<x-plain></x-plain>\n`,
  "plain/host.ts": `${H}import tpl from "./host.html.js";\nexport class Host extends Component(tpl) {}\ndefine("x-plain-host", Host);\n`,
  // two classes in one file
  "two/one.html": `<h1>{{ title }}</h1>\n`,
  "two/two.html": `<h2>{{ title }}</h2>\n`,
  "two/both.ts": `${H}import one from "./one.html.js";\nimport two from "./two.html.js";\nexport class One extends Component(one, { state: { title: "" } }) {}\nexport class Two extends Component(two, { state: { count: 0 } }) {}\ndefine("x-one", One);\ndefine("x-two", Two);\n`,
  // a template that reaches its class through barrels: a re-export alias, a local re-export, and export *
  "barrel/templates/card.html": `<div><span>{{ heading }}</span></div>\n`,
  "barrel/templates/note.html": `<p data-ref="note"></p>\n`,
  "barrel/templates/inner.ts": `import note from "./note.html.js";\nexport { note as noteTpl };\n`,
  "barrel/templates/index.ts": `export { default as cardTpl } from "./card.html.js";\nexport * from "./inner.ts";\n`,
  "barrel/card.ts": `${H}import { cardTpl } from "./templates/index.ts";\nexport default class extends Component(cardTpl, { props: { heading: "" } }) {\n  connected(): void {\n    this.heading = "x";\n  }\n}\n`,
  "barrel/note.ts": `${H}import { noteTpl } from "./templates/index.ts";\nexport class Note extends Component(noteTpl) {}\ndefine("x-note", Note);\n`,
  "barrel/register.ts": `${H}import BarrelCard from "./card.ts";\ndefine("x-barrel-card", BarrelCard);\n`,
  "barrel/page.html": `<x-barrel-card data-on-click="go"></x-barrel-card>\n`,
  "barrel/page.ts": `${H}import tpl from "./page.html.js";\nexport class BarrelPage extends Component(tpl) {\n  go(): void {}\n}\ndefine("x-barrel-page", BarrelPage);\n`,
  // templates reached through a namespace: of a barrel, of a barrel's `export * as`, and of the template module itself
  "ns/templates/card.html": `<p data-ref="note"></p>\n`,
  "ns/templates/row.html": `<p data-ref="note"></p>\n`,
  "ns/templates/index.ts": `export { default as card } from "./card.html.js";\nexport { default as row } from "./row.html.js";\n`,
  "ns/barrel.ts": `export * as t from "./templates/index.ts";\n`,
  "ns/card.ts": `${H}import * as t from "./templates/index.ts";\nexport class NsCard extends Component(t.card) {}\n`,
  "ns/row.ts": `${H}import { t } from "./barrel.ts";\nexport class NsRow extends Component(t.row) {}\n`,
  "ns/direct.html": `<p data-ref="note"></p>\n`,
  "ns/direct.ts": `${H}import * as d from "./direct.html.js";\nexport class NsDirect extends Component(d.default) {}\n`,
  "ns/register.ts": `${H}import * as cards from "./card.ts";\ndefine("x-ns-card", cards.NsCard);\n`,
  // a class missing more handlers than tsc prints in a message it truncates
  "many/many.html": `${Array.from({ length: 12 }, (_, i) => `<button type="button" data-on-click="handlerWithALongName${i}">${i}</button>`).join("\n")}\n`,
  "many/many.ts": `${H}import tpl from "./many.html.js";\nexport class Many extends Component(tpl) {}\ndefine("x-many", Many);\n`,
  // a template that a barrel only re-exports
  "orphan/orphan.html": `<p data-ref="note">{{ msg }}</p>\n`,
  "orphan/index.ts": `export { default as orphanTpl } from "./orphan.html.js";\n`,
  // a story that imports the template of a class
  "story/card.html": `<p data-ref="note"></p>\n`,
  "story/card.ts": `${H}import tpl from "./card.html.js";\nexport class StoryCard extends Component(tpl) {}\ndefine("x-story-card", StoryCard);\n`,
  "story/card.stories.ts": `import tpl from "./card.html.js";\nconst view = tpl.instantiate();\nview.refs.note.textContent = "story";\n`,
  // a template no class uses, which a module instantiates
  "helper/view.html": `<p data-ref="title"></p>\n`,
  "helper/view.ts": `import tpl from "./view.html.js";\nexport const view = tpl.instantiate();\nview.refs.title.textContent = "x";\n`,
  // two classes of one name in different files, one with a contract error
  "same/a/item.html": `<p>{{ missing }}</p>\n`,
  "same/a/item.ts": `${H}import tpl from "./item.html.js";\nexport class Item extends Component(tpl, { state: { n: 0 } }) {}\n`,
  "same/b/item.html": `<p></p>\n`,
  "same/b/item.ts": `${H}import tpl from "./item.html.js";\nexport class Item extends Component(tpl) {\n  size = 1;\n}\n`,
  "same/use.ts": `import { Item } from "./b/item.ts";\nexport const item: Item = 5;\n`,
};

let dir = "";
let issues: LintIssue[] = [];
const at = (file: string) => issues.filter((i) => i.file.startsWith(file)).map((i) => [i.file, i.line, i.col, i.rule]);

beforeAll(() => {
  dir = writeTree(files, "nativele-components-");
  linkTypescript(dir);
  issues = runCheck({ dirs: ["."], project: "tsconfig.json", a11y: true, cwd: dir });
}, 60_000);

describe("a template, its class, its define() and their files", () => {
  it("define() in another file: the tag map imports the class from the file that declares it, under its export name", () => {
    const tags = readFileSync(join(dir, "ts-dom-tags.ts"), "utf8");
    expect(tags).toContain(`import type { Panel as Tag`);
    expect(tags).toMatch(/import type \{ RegistryCard as Tag\d+ \} from "\.\/registry\/card\.js";/);
    expect(tags).toMatch(/import type \{ default as Tag\d+ \} from "\.\/barrel\/card\.js";/);
    expect(tags).toMatch(/import type \{ BComp as Tag\d+ \} from "\.\/registry\/b-comp\.js";/);
    expect(at("registry/page.ts")).toEqual([]);
  });
  it("define() in another file: tsc's handler errors point at the class's own template", () => {
    expect(at("registry/b.html")).toEqual([["registry/b.html", 1, 23, "handler-event-type"]]);
    expect(at("registry/a.html")).toEqual([]);
    expect(at("registry/panel.html")).toEqual([["registry/panel.html", 1, 1, "missing-handler"]]);
    expect(at("registry/register.ts")).toEqual([]);
  });
  it("define() in another file: lint reads the child's contract and template", () => {
    expect(at("registry/page.html").map((i) => i[3])).toEqual(["unknown-prop", "unknown-event", "click-semantics"]);
    const unchecked = issues.filter((i) => i.rule === "unchecked-custom-elements");
    expect(unchecked.map((i) => i.file)).toEqual(["plain/host.html"]);
    expect(unchecked[0]?.message).toContain("<x-plain> (plain/plain.ts:3): define() passes a class that lint cannot follow through relative imports to a class extending Component(...).");
    expect(unchecked[0]?.message).not.toContain("No define()");
  });
  it("two classes in one file: each contract error points at that class's template", () => {
    expect(at("two/")).toEqual([["two/two.html", 1, 5, "missing-binding"]]);
  });
  it("a template that reaches its class through barrels has that class as its owner and contract", () => {
    expect(at("barrel/")).toEqual([
      ["barrel/card.ts", 4, 3, "tsc"],
      ["barrel/page.html", 1, 1, "click-semantics"],
      ["barrel/templates/card.html", 1, 1, "props-mutation"],
      ["barrel/templates/note.html", 1, 1, "unused-ref"],
    ]);
  });
  it("a template reached through a namespace import or an export * as has that class as its owner", () => {
    expect(at("ns/")).toEqual([
      ["ns/direct.html", 1, 1, "unused-ref"],
      ["ns/templates/card.html", 1, 1, "unused-ref"],
      ["ns/templates/row.html", 1, 1, "unused-ref"],
    ]);
    expect(readFileSync(join(dir, "ts-dom-tags.ts"), "utf8")).toMatch(/import type \{ NsCard as Tag\d+ \} from "\.\/ns\/card\.js";/);
  });
  it("a message tsc would truncate still names the template and every missing handler", () => {
    expect(at("many/").map(([f, l, , r]) => [f, l, r])).toEqual(Array.from({ length: 12 }, (_, i) => ["many/many.html", i + 1, "missing-handler"]));
  });
  it("a template that a barrel only re-exports has no importer", () => {
    expect(at("orphan/")).toEqual([["orphan/orphan.html", 1, 1, "no-importer"]]);
  });
  it("a module that imports the template of a class is not its owner; a module is when no class uses the template", () => {
    expect(at("story/")).toEqual([["story/card.html", 1, 1, "unused-ref"]]);
    expect(at("helper/")).toEqual([]);
  });
  it("an error that names a class follows from the contract error of that class only", () => {
    expect(at("same/")).toEqual([
      ["same/a/item.html", 1, 4, "missing-binding"],
      ["same/use.ts", 2, 14, "tsc"],
    ]);
    expect(issues.find((i) => i.file.endsWith("use.ts"))?.message).not.toContain("follows from");
  });
});
