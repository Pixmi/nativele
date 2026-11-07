import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { watchAll } from "../src/lib/codegen.ts";
import { Memo, Workspace } from "../src/lib/components.ts";
import { lintProject, lintRun, lintTemplate } from "../src/lib/lint.ts";
import type { Group } from "../src/lib/lint.ts";
import plugin from "../src/lib/oxlint-plugin.ts";
import { tsDom } from "../src/lib/vite-plugin.ts";

const parses = vi.hoisted(() => ({ n: 0 }));
vi.mock("parse5", async (importOriginal) => {
  const real = await importOriginal<typeof import("parse5")>();
  return { ...real, parseFragment: (...args: Parameters<typeof real.parseFragment>) => (parses.n++, real.parseFragment(...args)) };
});
const reads = vi.hoisted(() => new Map<string, number>());
const listings = vi.hoisted(() => ({ n: 0 }));
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  const readFileSync = ((file: string, ...rest: [never]) => (reads.set(String(file), (reads.get(String(file)) ?? 0) + 1), real.readFileSync(file, ...rest))) as typeof real.readFileSync;
  const readdirSync = ((...args: Parameters<typeof real.readdirSync>) => (listings.n++, real.readdirSync(...args))) as typeof real.readdirSync;
  return { ...real, default: { ...real, readFileSync, readdirSync }, readFileSync, readdirSync };
});

/** How many times `fn` reads each file. */
function readsDuring(fn: () => void): Map<string, number> {
  reads.clear();
  fn();
  return new Map(reads);
}

/** Let the event loop turn, which ends the run of the oxlint plugin, as between two lints in the editor. */
const turn = () => new Promise((resolve) => setImmediate(resolve));

const H = `import { Component, define, event } from "@nativele/ts-dom";\n`;
const component = (cls: string, tag: string, options = "") => `${H}import tpl from "./${tag}.html.js";\nexport class ${cls} extends Component(tpl${options}) {}\ndefine("${tag}", ${cls});\n`;
const project = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), "nativele-ws-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
};

/** Count the templates parsed while `fn` runs. */
function parsed(fn: () => void): number {
  const before = parses.n;
  fn();
  return parses.n - before;
}

/** The rules of `rules` found by oxlint's lint of `name` under `dir`, with `text` as the file's content (the file on disk by default). */
function oxlint(dir: string, name: string, rules: readonly ("a11y" | "data-flow" | "unused-markup")[], text = readFileSync(join(dir, name), "utf8")): string[] {
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const found: string[] = [];
    const context = { filename: join(dir, name), sourceCode: { text }, options: [] as [], report: ({ message }: { message: string }) => found.push(/\[([\w-]+)\]/.exec(message)?.[1] ?? message) };
    const visitors = rules.map((rule) => plugin.rules[rule].create(context));
    for (const m of text.matchAll(/from "(\.[^"]+)"/g)) {
      const node = { type: "ImportDeclaration" as const, source: { value: m[1] as string } };
      for (const v of visitors) v.ImportDeclaration(node);
    }
    return found;
  } finally {
    process.chdir(cwd);
  }
}

describe("a long-lived oxlint plugin (the language server)", () => {
  it("reports a parent template's findings again when its child template or child class changes", async () => {
    const dir = project({
      "x-card.html": `<button type="button">Open</button>\n`,
      "x-card.ts": component("Card", "x-card", `, { emits: { "card-open": event() } }`),
      "page.html": `<x-card data-on-click="go" data-on-card-open="go"></x-card>\n`,
      "page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\n`,
    });
    const lint = async () => {
      await turn();
      return oxlint(dir, "page.ts", ["a11y", "data-flow"]);
    };
    expect(await lint()).toEqual([]);
    writeFileSync(join(dir, "x-card.html"), `<div>Open the card</div>\n`);
    expect(await lint()).toEqual(["click-semantics"]);
    writeFileSync(join(dir, "x-card.ts"), component("Card", "x-card", `, { emits: { "card-close": event() } }`));
    expect(await lint()).toEqual(["click-semantics", "unknown-event"]);
    writeFileSync(join(dir, "x-card.html"), `<button type="button">Open the card</button>\n`);
    expect(await lint()).toEqual(["unknown-event"]);
  });
  it("lints the file as oxlint gives it, which can be an unsaved buffer", async () => {
    const dir = project({
      "x-a.html": `<p data-ref="note">A</p>\n`,
      "x-a.ts": component("A", "x-a"),
    });
    await turn();
    expect(oxlint(dir, "x-a.ts", ["unused-markup"])).toEqual(["unused-ref"]);
    const buffer = component("A", "x-a").replace(" {}", " {\n  override connectedCallback(): void {\n    this.refs.note.hidden = true;\n  }\n}");
    expect(oxlint(dir, "x-a.ts", ["unused-markup"], buffer)).toEqual([]);
    expect(oxlint(dir, "x-a.ts", ["unused-markup"])).toEqual(["unused-ref"]);
  });
  it("reads an unsaved buffer only in the lint of its file: the other lints of the same turn read the disk", async () => {
    const dir = project({
      "x-card.html": `<div><span>{{ title }}</span></div>\n`,
      "a.ts": component("Card", "x-card"),
      "page.html": `<x-card data-on-click="go"></x-card>\n`,
      "page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\n`,
    });
    await turn();
    const fromDisk = oxlint(dir, "page.ts", ["a11y", "data-flow"]);
    expect(fromDisk).toEqual(["click-semantics"]);
    await turn();
    oxlint(dir, "a.ts", ["a11y", "data-flow"], component("Card", "x-card").replace(`define("x-card", Card);\n`, ""));
    expect(oxlint(dir, "page.ts", ["a11y", "data-flow"])).toEqual(fromDisk);
  });
  it("computes only the groups of the rules that are on", async () => {
    const dir = project({
      "x-kid.html": `<button type="button">Kid</button>\n`,
      "x-kid.ts": component("Kid", "x-kid"),
      "page.html": `<x-kid data-on-click="go"></x-kid>\n`,
      "page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\n`,
      "plain.ts": `export const n = 1;\n`,
    });
    await turn();
    oxlint(dir, "plain.ts", ["a11y", "data-flow"]);
    expect(parsed(() => oxlint(dir, "page.ts", ["data-flow", "unused-markup"]))).toBe(1);
  });
  it("keeps the findings of a file while the editor lints another one", async () => {
    const dir = project({
      "x-a.html": `<p data-ref="note">A</p>\n`,
      "x-a.ts": component("A", "x-a"),
      "x-b.html": `<p data-ref="note">B</p>\n`,
      "x-b.ts": component("B", "x-b"),
    });
    await turn();
    oxlint(dir, "x-a.ts", ["unused-markup", "a11y"]);
    await turn();
    oxlint(dir, "x-b.ts", ["unused-markup", "a11y"]);
    await turn();
    expect(parsed(() => expect(oxlint(dir, "x-a.ts", ["unused-markup", "a11y"])).toEqual(["unused-ref"]))).toBe(0);
  });
  it("lists the folders once in a run that also lints an unsaved buffer", async () => {
    const dir = project({ "x-a.html": `<p data-ref="note">A</p>\n`, "x-a.ts": component("A", "x-a"), "sub/x-b.ts": component("B", "x-b") });
    await turn();
    const before = listings.n;
    oxlint(dir, "sub/x-b.ts", ["unused-markup"]);
    const saved = listings.n - before;
    expect(oxlint(dir, "x-a.ts", ["unused-markup"], `${component("A", "x-a")}// unsaved\n`)).toEqual(["unused-ref"]);
    expect(listings.n - before).toBe(saved);
  });
});

describe("a long-lived Vite plugin (the dev server)", () => {
  const dev = (children: number, used = children) => {
    const files: Record<string, string> = {};
    for (let i = 0; i < children; i++) {
      files[`src/c${i}.html`] = `<button type="button">C${i}</button>\n`;
      files[`src/c${i}.ts`] = component(`C${i}`, `x-c${i}`).replace(`./x-c${i}.html.js`, `./c${i}.html.js`);
    }
    files["src/page.html"] = `${Array.from({ length: used }, (_, i) => `<x-c${i} data-on-click="go"></x-c${i}>`).join("\n")}\n`;
    files["src/page.ts"] = `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\ndefine("x-page", Page);\n`;
    const dir = project(files);
    const p = tsDom({ dirs: ["src"], a11y: true });
    p.configResolved({ root: dir });
    const warned: string[] = [];
    p.buildStart.call({ warn: (m: string) => warned.push(m), error: (m: string): never => { throw new Error(m); } });
    const logger = { warn: (m: string) => warned.push(m), error: (m: string) => warned.push(m) };
    const server = { config: { logger }, moduleGraph: { getModulesByFile: () => undefined, invalidateModule() {} }, ws: { send() {} } };
    const save = (name: string, text: string) => {
      warned.length = 0;
      writeFileSync(join(dir, "src", name), text);
      const n = parsed(() => p.handleHotUpdate({ file: join(dir, "src", name), server }));
      return { parses: n, warned: warned.map((w) => /([\w-]+\.html):(\d+):\d+ warning \[([\w-]+)\]/.exec(w)?.slice(1).join(" ")) };
    };
    const hook = (file: string) => p.handleHotUpdate({ file, server });
    return { save, hook, warned, dir };
  };
  it("checks the parent template again when a child template it uses changes", () => {
    const { save, warned } = dev(3);
    expect(warned).toEqual([]);
    expect(save("c1.html", `<div>C1, no button</div>\n`).warned).toEqual(["page.html 2 click-semantics"]);
    expect(save("c1.html", `<button type="button">C1 again</button>\n`).warned).toEqual([]);
  });
  it("sees on a template save a define() added in another file", () => {
    const { save, dir } = dev(1);
    writeFileSync(join(dir, "src/new.html"), `<div>New</div>\n`);
    writeFileSync(join(dir, "src/new.ts"), component("New", "x-new").replace("./x-new.html.js", "./new.html.js"));
    expect(save("page.html", `<x-new data-on-click="go"></x-new>\n`).warned).toEqual(["page.html 1 click-semantics"]);
  });
  it("keeps what it worked out through the hooks of a generated module and of a file outside its folders", () => {
    const { save, hook, dir } = dev(4);
    const alone = save("c1.html", `<div>C1, no button</div>\n`).parses;
    hook(join(dir, "src/c1.html.ts"));
    hook(join(dir, "style.css"));
    expect(save("c1.html", `<button type="button">C1 again</button>\n`).parses).toBe(alone);
  });
  it("parses the same number of templates for a save whatever the size of the project", () => {
    const small = dev(4, 2).save("c1.html", `<div>C1, no button</div>\n`).parses;
    const large = dev(16, 2).save("c1.html", `<div>C1, no button</div>\n`).parses;
    expect(large).toBe(small);
    expect(small).toBeLessThanOrEqual(6);
  });
});

describe("the runs of a host", () => {
  const rewriteInOneTick = (file: string, text: string) => {
    writeFileSync(file, text);
    utimesSync(file, 1_000_000, 1_000_000);
  };
  it("sees a rewrite of the same size within one modification time tick on the next run", () => {
    const dir = project({ "src/a.html": `<p data-ref="a">A</p>\n`, "src/a.ts": component("A", "x-a").replace("./x-a.html.js", "./a.html.js") });
    const src = join(dir, "src");
    const html = join(src, "a.html");
    const ts = join(src, "a.ts");
    utimesSync(html, 1_000_000, 1_000_000);
    utimesSync(ts, 1_000_000, 1_000_000);
    const memo = new Memo();
    const refs = () => lintRun([src], { ws: new Workspace(memo), cwd: dir }).issues.filter((i) => i.rule === "unused-ref").map((i) => i.message.slice(0, 15));
    expect(refs()).toEqual([`data-ref="a" is`]);
    rewriteInOneTick(html, `<p data-ref="b">A</p>\n`);
    expect(refs()).toEqual([`data-ref="b" is`]);
    expect(new Workspace(memo).index([src]).byTag.has("x-a")).toBe(true);
    rewriteInOneTick(ts, readFileSync(ts, "utf8").replace(`"x-a"`, `"x-b"`));
    expect([...new Workspace(memo).index([src]).byTag.keys()]).toEqual(["x-b"]);
  });
  it("gives one run one content of each file, read once", () => {
    const dir = project({ "src/a.ts": component("A", "x-a") });
    const src = join(dir, "src");
    const ts = join(src, "a.ts");
    const ws = new Workspace();
    const before = ws.text(ts);
    writeFileSync(ts, component("B", "x-b"));
    expect(readsDuring(() => expect(ws.text(ts)).toBe(before)).get(ts)).toBeUndefined();
    expect([...ws.index([src]).byTag.keys()]).toEqual(["x-a"]);
    expect([...new Workspace().index([src]).byTag.keys()]).toEqual(["x-b"]);
  });
  it("parses nothing again in a run where no template or file they depend on changed", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 4; i++) {
      files[`src/c${i}.html`] = `<button type="button" data-ref="b">C${i}</button>\n`;
      files[`src/c${i}.ts`] = component(`C${i}`, `x-c${i}`).replace(`./x-c${i}.html.js`, `./c${i}.html.js`);
    }
    const dir = project(files);
    const src = join(dir, "src");
    const memo = new Memo();
    const run = () => lintRun([src], { ws: new Workspace(memo), a11y: true, cwd: dir }).issues.map((i) => `${i.file} ${i.rule}`);
    const first = run();
    expect(parsed(() => expect(run()).toEqual(first))).toBe(0);
  });
  it("keeps one findings entry for a set of groups, whatever their order", () => {
    const dir = project({ "src/a.html": `<p data-ref="a">A</p>\n`, "src/a.ts": component("A", "x-a").replace("./x-a.html.js", "./a.html.js") });
    const src = join(dir, "src");
    const memo = new Memo();
    const findings = (groups: Group[]) => lintTemplate(lintProject(new Workspace(memo), [src], dir), join(src, "a.html"), groups);
    const first = findings(["a11y", "data-flow"]);
    expect(parsed(() => expect(findings(["data-flow", "a11y"])).toEqual(first))).toBe(0);
  });
  it("sees a deleted or renamed module on the next run", () => {
    const dir = project({ "src/a.ts": component("A", "x-a"), "src/b.ts": component("B", "x-b") });
    const src = join(dir, "src");
    const memo = new Memo();
    const tags = () => [...new Workspace(memo).index([src]).byTag.keys()].sort();
    expect(tags()).toEqual(["x-a", "x-b"]);
    rmSync(join(src, "b.ts"));
    expect(tags()).toEqual(["x-a"]);
    mkdirSync(join(src, "sub"));
    renameSync(join(src, "a.ts"), join(src, "sub/a.ts"));
    const index = new Workspace(memo).index([src]);
    expect(index.byTag.get("x-a")?.map((d) => d.file)).toEqual([join(src, "sub/a.ts")]);
  });
  it("checks a child tag against the child template once that template is created", () => {
    const dir = project({
      "src/kid.ts": component("Kid", "x-kid"),
      "src/page.html": `<x-kid data-on-click="go"></x-kid>\n`,
      "src/page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\n`,
    });
    const src = join(dir, "src");
    const memo = new Memo();
    const clicks = () => lintRun([src], { ws: new Workspace(memo), a11y: true, cwd: dir }).issues.filter((i) => i.rule === "click-semantics").map((i) => i.file);
    expect(clicks()).toEqual([]);
    writeFileSync(join(src, "x-kid.html"), `<div>Kid</div>\n`);
    expect(clicks()).toEqual([join("src", "page.html")]);
    rmSync(join(src, "x-kid.html"));
    expect(clicks()).toEqual([]);
  });
  it("finds the package of a tag defined in several again once a package.json is added or removed", () => {
    const dir = project({
      "src/a/kid.ts": component("Kid", "x-kid"),
      "src/b/kid.ts": component("Kid", "x-kid"),
      "src/a/page.html": `<x-kid foo="1"></x-kid>\n`,
      "src/a/page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {}\n`,
    });
    const src = join(dir, "src");
    const memo = new Memo();
    const rules = () => lintRun([src], { ws: new Workspace(memo), cwd: dir }).issues.filter((i) => i.file.endsWith("page.html")).map((i) => i.rule);
    expect(rules()).toEqual(["unchecked-custom-elements"]);
    writeFileSync(join(src, "a/package.json"), "{}");
    expect(rules()).toEqual(["unknown-prop"]);
    rmSync(join(src, "a/package.json"));
    expect(rules()).toEqual(["unchecked-custom-elements"]);
    writeFileSync(join(src, "b/package.json"), "{}");
    expect(rules()).toEqual(["unknown-prop"]);
  });
  it("finds the package of a template again once a package.json between it and its package is removed", () => {
    const dir = project({
      "src/a/package.json": "{}",
      "src/b/package.json": "{}",
      "src/a/kid.ts": component("Kid", "x-kid"),
      "src/b/kid.ts": component("Kid", "x-kid"),
      "src/a/x/package.json": "{}",
      "src/a/x/page.html": `<x-kid foo="1"></x-kid>\n`,
      "src/a/x/page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {}\n`,
    });
    const src = join(dir, "src");
    const memo = new Memo();
    const rules = () => {
      lintRun([src], { ws: new Workspace(memo), cwd: dir });
      return lintRun([src], { ws: new Workspace(memo), cwd: dir, a11y: true }).issues.filter((i) => i.file.endsWith("page.html")).map((i) => i.rule);
    };
    expect(rules()).toEqual(["unchecked-custom-elements"]);
    rmSync(join(src, "a/x/package.json"));
    expect(rules()).toEqual(["unknown-prop"]);
  });
  it("reads a child template once for all the uses of the child in a parent template", () => {
    const dir = project({
      "src/x-kid.html": `<span>Kid</span>\n`,
      "src/x-kid.ts": component("Kid", "x-kid"),
      "src/page.html": `${Array.from({ length: 10 }, () => `<button type="button"><x-kid></x-kid></button>\n<x-kid data-on-click="go"></x-kid>`).join("\n")}\n`,
      "src/page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\n`,
    });
    const src = join(dir, "src");
    expect(readsDuring(() => lintRun([src], { a11y: true, cwd: dir })).get(join(src, "x-kid.html"))).toBe(1);
  });
  it("ts-dom gen --watch parses only the saved template", async () => {
    const dir = project({ "src/a.html": `<p>{{ a }}</p>\n`, "src/a.ts": component("A", "x-a").replace("./x-a.html.js", "./a.html.js"), "src/b.ts": component("B", "x-b").replace("./x-b.html.js", "./b.html.js"), "src/b.html": `<p></p>\n` });
    const src = join(dir, "src");
    const before = parses.n;
    const generated = new Promise<string>((resolve) => {
      const stop = watchAll([src], { onGenerate: (f) => (stop(), resolve(f)) });
      setTimeout(() => writeFileSync(join(src, "a.html"), `<p>{{ a }} {{ b }}</p>\n`), 100);
    });
    expect(await generated).toBe(join(src, "a.html.ts"));
    expect(parses.n - before).toBe(1);
  }, 10_000);
});

describe("the memo a host keeps between runs", () => {
  it("keeps one value of each kind for a file, used while the file has the content it was computed from", () => {
    const memo = new Memo();
    memo.set("/p/a.ts", "k", ["a"], 1);
    expect([memo.get("/p/a.ts", "k", ["a"]), memo.get("/p/a.ts", "k", ["b"])]).toEqual([1, undefined]);
    memo.set("/p/a.ts", "k", ["b"], 2);
    expect([memo.get("/p/a.ts", "k", ["a"]), memo.get("/p/a.ts", "k", ["b"])]).toEqual([undefined, 2]);
  });
  it("drops the values of the files a listing no longer has", () => {
    const dir = project({ "src/a.ts": component("A", "x-a"), "src/b.ts": component("B", "x-b") });
    const src = join(dir, "src");
    const memo = new Memo();
    new Workspace(memo).index([src]);
    rmSync(join(src, "b.ts"));
    new Workspace(memo).index([src]);
    expect([memo.get(join(src, "a.ts"), "facts", [component("A", "x-a")]), memo.get(join(src, "b.ts"), "facts", [component("B", "x-b")])].map((v) => v !== undefined)).toEqual([true, false]);
  });
});
