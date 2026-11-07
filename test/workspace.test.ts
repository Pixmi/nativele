import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { watchAll } from "../src/lib/codegen.ts";
import { Workspace } from "../src/lib/components.ts";
import { lintRun } from "../src/lib/lint.ts";
import plugin from "../src/lib/oxlint-plugin.ts";
import { tsDom } from "../src/lib/vite-plugin.ts";

const parses = vi.hoisted(() => ({ n: 0 }));
vi.mock("parse5", async (importOriginal) => {
  const real = await importOriginal<typeof import("parse5")>();
  return { ...real, parseFragment: (...args: Parameters<typeof real.parseFragment>) => (parses.n++, real.parseFragment(...args)) };
});
const reads = vi.hoisted(() => new Map<string, number>());
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  const readFileSync = ((file: string, ...rest: [never]) => (reads.set(String(file), (reads.get(String(file)) ?? 0) + 1), real.readFileSync(file, ...rest))) as typeof real.readFileSync;
  return { ...real, default: { ...real, readFileSync }, readFileSync };
});

/** How many times `fn` reads each file. */
function readsDuring(fn: () => void): Map<string, number> {
  reads.clear();
  fn();
  return new Map(reads);
}
/** Run `fn` with the clock `ms` ahead, so the files on disk look that much older than any read of them. */
function later<T>(ms: number, fn: () => T): T {
  vi.useFakeTimers({ now: Date.now() + ms, toFake: ["Date"] });
  try {
    return fn();
  } finally {
    vi.useRealTimers();
  }
}

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

describe("a long-lived oxlint plugin (the language server)", () => {
  it("reports a parent template's findings again when its child template or child class changes", () => {
    const dir = project({
      "x-card.html": `<button type="button">Open</button>\n`,
      "x-card.ts": component("Card", "x-card", `, { emits: { "card-open": event() } }`),
      "page.html": `<x-card data-on-click="go" data-on-card-open="go"></x-card>\n`,
      "page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\n`,
    });
    const cwd = process.cwd();
    process.chdir(dir);
    const lint = () => {
      const found: string[] = [];
      const filename = join(dir, "page.ts");
      for (const rule of ["a11y", "data-flow"] as const) {
        plugin.rules[rule].create({ filename, sourceCode: { text: readFileSync(filename, "utf8") }, options: [], report: ({ message }) => found.push(/\[([\w-]+)\]/.exec(message)?.[1] ?? message) }).ImportDeclaration({ type: "ImportDeclaration", source: { value: "./page.html.js" } });
      }
      return found;
    };
    try {
      expect(lint()).toEqual([]);
      writeFileSync(join(dir, "x-card.html"), `<div>Open the card</div>\n`);
      expect(lint()).toEqual(["click-semantics"]);
      writeFileSync(join(dir, "x-card.ts"), component("Card", "x-card", `, { emits: { "card-close": event() } }`));
      expect(lint()).toEqual(["click-semantics", "unknown-event"]);
      writeFileSync(join(dir, "x-card.html"), `<button type="button">Open the card</button>\n`);
      expect(lint()).toEqual(["unknown-event"]);
    } finally {
      process.chdir(cwd);
    }
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
    return { save, warned, dir };
  };
  it("reads only the saved file again when the others did not change", () => {
    later(10_000, () => {
      const { save, dir } = dev(8);
      for (const name of ["c1.html", "c2.ts"]) {
        const read = [...readsDuring(() => save(name, readFileSync(join(dir, "src", name), "utf8") + "\n")).keys()].filter((f) => !f.endsWith(".html.ts") && !f.endsWith("ts-dom-tags.ts"));
        expect(read).toEqual([join(dir, "src", name)]);
      }
    });
  });
  it("checks the parent template again when a child template it uses changes", () => {
    const { save, warned } = dev(3);
    expect(warned).toEqual([]);
    expect(save("c1.html", `<div>C1, no button</div>\n`).warned).toEqual(["page.html 2 click-semantics"]);
    expect(save("c1.html", `<button type="button">C1 again</button>\n`).warned).toEqual([]);
  });
  it("parses the same number of templates for a save whatever the size of the project", () => {
    const small = dev(4, 2).save("c1.html", `<div>C1, no button</div>\n`).parses;
    const large = dev(16, 2).save("c1.html", `<div>C1, no button</div>\n`).parses;
    expect(large).toBe(small);
    expect(small).toBeLessThanOrEqual(6);
  });
});

describe("the workspace that every tool runs through", () => {
  it("keeps findings and facts, never parse trees, and forgets deleted files", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 6; i++) {
      files[`src/c${i}.html`] = `<button type="button" data-ref="b">C${i}</button>\n`;
      files[`src/c${i}.ts`] = component(`C${i}`, `x-c${i}`).replace(`./x-c${i}.html.js`, `./c${i}.html.js`);
    }
    const dir = project(files);
    const ws = new Workspace();
    const src = join(dir, "src");
    lintRun([src], { ws, a11y: true });
    expect(ws.size.results).toBe(6);
    for (let i = 0; i < 3; i++) {
      rmSync(join(src, `c${i}.html`));
      rmSync(join(src, `c${i}.ts`));
    }
    expect(parsed(() => lintRun([src], { ws, a11y: true }))).toBe(0);
    const live = readdirSync(src).filter((f) => f.endsWith(".html") || (f.endsWith(".ts") && !f.endsWith(".html.ts"))).length;
    expect(ws.size.files).toBeLessThanOrEqual(live);
    expect(ws.size.results).toBe(3);
    const hasTree = (v: unknown, seen = new Set<unknown>()): boolean => {
      if (!v || typeof v !== "object" || seen.has(v)) return false;
      seen.add(v);
      return "nodeName" in v || "childNodes" in v || Object.values(v).some((x) => hasTree(x, seen));
    };
    expect(ws.size.values.some((v) => hasTree(v))).toBe(false);
  });
  it("ts-dom gen --watch parses only the saved template", async () => {
    const dir = project({ "src/a.html": `<p>{{ a }}</p>\n`, "src/a.ts": component("A", "x-a").replace("./x-a.html.js", "./a.html.js"), "src/b.ts": component("B", "x-b").replace("./x-b.html.js", "./b.html.js"), "src/b.html": `<p></p>\n` });
    const ws = new Workspace();
    const src = join(dir, "src");
    ws.index([src]);
    const before = parses.n;
    const generated = new Promise<string>((resolve) => {
      const stop = watchAll([src], { onGenerate: (f) => (stop(), resolve(f)) }, ws);
      setTimeout(() => writeFileSync(join(src, "a.html"), `<p>{{ a }} {{ b }}</p>\n`), 100);
    });
    expect(await generated).toBe(join(src, "a.html.ts"));
    expect(parses.n - before).toBe(1);
  }, 10_000);
});

describe("what the workspace's cache depends on", () => {
  const rewriteInOneTick = (file: string, text: string) => {
    writeFileSync(file, text);
    utimesSync(file, 1_000_000, 1_000_000);
  };
  it("sees a rewrite of the same size within one modification time tick", () => {
    const dir = project({ "src/a.html": `<p>{{ a }}</p>\n`, "src/a.ts": component("A", "x-a").replace("./x-a.html.js", "./a.html.js") });
    const html = join(dir, "src/a.html");
    utimesSync(html, 1_000_000, 1_000_000);
    const ws = new Workspace();
    expect(ws.text(html)).toBe(`<p>{{ a }}</p>\n`);
    rewriteInOneTick(html, `<p>{{ b }}</p>\n`);
    expect(ws.text(html)).toBe(`<p>{{ b }}</p>\n`);
    const ts = join(dir, "src/a.ts");
    utimesSync(ts, 1_000_000, 1_000_000);
    expect(ws.index([join(dir, "src")]).byTag.has("x-a")).toBe(true);
    rewriteInOneTick(ts, readFileSync(ts, "utf8").replace(`"x-a"`, `"x-b"`));
    expect([...ws.index([join(dir, "src")]).byTag.keys()]).toEqual(["x-b"]);
  });
  it("reads a file that has not changed since it was read only once, and looks for one that does not exist without reading it", () => {
    const dir = project({ "a.txt": "one" });
    const f = join(dir, "a.txt");
    const none = join(dir, "none.txt");
    later(10_000, () => {
      const ws = new Workspace();
      expect(readsDuring(() => ws.text(f)).get(f)).toBe(1);
      expect(readsDuring(() => [ws.text(f), ws.rev(f), ws.text(none), ws.rev(none)]).size).toBe(0);
      writeFileSync(f, "two");
      expect(ws.text(f)).toBe("two");
    });
  });
  it("reads a file again on each look while it changed too shortly before the last read for its timestamps to tell a later rewrite", () => {
    const dir = project({ "a.txt": "one" });
    const f = join(dir, "a.txt");
    const ws = new Workspace();
    ws.text(f);
    expect(readsDuring(() => ws.text(f)).get(f)).toBe(1);
  });
  it("gives one computation the same content of a file each time it looks", () => {
    const dir = project({ "f.txt": "one" });
    const f = join(dir, "f.txt");
    const ws = new Workspace();
    const { value } = ws.result("r", f, () => "", () => {
      const first = ws.text(f);
      writeFileSync(f, "two");
      return [first, ws.text(f)];
    });
    expect(value).toEqual(["one", "one"]);
    expect(ws.text(f)).toBe("two");
  });
  it("gives a result that uses a value kept with the index the files that value read", () => {
    const dir = project({ "src/a.ts": "", "f.txt": "one" });
    const f = join(dir, "f.txt");
    const ws = new Workspace();
    const value = () => {
      const index = ws.index([join(dir, "src")]);
      return ws.result("r", f, () => "", () => ws.derived(index, "k", () => ws.text(f))).value;
    };
    expect(value()).toBe("one");
    writeFileSync(f, "two");
    expect(value()).toBe("two");
  });
  it("lists the folders again within maxAge once it has seen a module it read deleted", () => {
    const dir = project({ "src/a.ts": component("A", "x-a"), "src/b.ts": component("B", "x-b") });
    const src = join(dir, "src");
    const ws = new Workspace();
    expect(ws.index([src], 60_000).modules.has(join(src, "b.ts"))).toBe(true);
    rmSync(join(src, "b.ts"));
    expect(ws.text(join(src, "b.ts"))).toBe(null);
    const index = ws.index([src], 60_000);
    expect(index.modules.has(join(src, "b.ts"))).toBe(false);
    expect(index.byTag.has("x-b")).toBe(false);
  });
  it("gives a result that reuses another the files the other read", () => {
    const dir = project({ "f.txt": "one" });
    const f = join(dir, "f.txt");
    const ws = new Workspace();
    const inner = () => ws.result("inner", f, () => "", () => ws.text(f)).value;
    const outer = () => ws.result("outer", f, () => "", () => inner()).value;
    expect(inner()).toBe("one");
    expect(outer()).toBe("one");
    writeFileSync(f, "two");
    expect(outer()).toBe("two");
  });
  it("checks a child tag against the child template once that template is created", () => {
    const dir = project({
      "src/kid.ts": component("Kid", "x-kid"),
      "src/page.html": `<x-kid data-on-click="go"></x-kid>\n`,
      "src/page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\n`,
    });
    const src = join(dir, "src");
    const ws = new Workspace();
    const clicks = () => lintRun([src], { ws, a11y: true, cwd: dir }).issues.filter((i) => i.rule === "click-semantics").map((i) => i.file);
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
    const ws = new Workspace();
    const rules = () => lintRun([src], { ws, cwd: dir }).issues.filter((i) => i.file.endsWith("page.html")).map((i) => i.rule);
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
    const ws = new Workspace();
    const rules = () => {
      lintRun([src], { ws, cwd: dir });
      return lintRun([src], { ws, cwd: dir, a11y: true }).issues.filter((i) => i.file.endsWith("page.html")).map((i) => i.rule);
    };
    expect(rules()).toEqual(["unchecked-custom-elements"]);
    rmSync(join(src, "a/x/package.json"));
    expect(rules()).toEqual(["unknown-prop"]);
  });
  it("the oxlint plugin computes only the groups of the rules that are on", () => {
    const dir = project({
      "x-kid.html": `<button type="button">Kid</button>\n`,
      "x-kid.ts": component("Kid", "x-kid"),
      "page.html": `<x-kid data-on-click="go"></x-kid>\n`,
      "page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\n`,
    });
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const filename = join(dir, "page.ts");
      const context = { filename, sourceCode: { text: readFileSync(filename, "utf8") }, options: [] as [], report() {} };
      const visitors = (["data-flow", "unused-markup"] as const).map((rule) => plugin.rules[rule].create(context));
      const node = { type: "ImportDeclaration" as const, source: { value: "./page.html.js" } };
      parses.n = 0;
      for (const v of visitors) v.ImportDeclaration(node);
      expect(parses.n).toBe(1);
    } finally {
      process.chdir(cwd);
    }
  });
  it("the oxlint plugin computes for a file only the groups of the rules that are on for that file", () => {
    const dir = project({
      "x-kid.html": `<button type="button">Kid</button>\n`,
      "x-kid.ts": component("Kid", "x-kid"),
      "page.html": `<x-kid data-on-click="go"></x-kid>\n`,
      "page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\n`,
      "plain.ts": `export const n = 1;\n`,
    });
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const context = (name: string) => ({ filename: join(dir, name), sourceCode: { text: readFileSync(join(dir, name), "utf8") }, options: [] as [], report() {} });
      for (const rule of ["a11y", "data-flow"] as const) plugin.rules[rule].create(context("plain.ts"));
      const visitors = (["data-flow", "unused-markup"] as const).map((rule) => plugin.rules[rule].create(context("page.ts")));
      parses.n = 0;
      for (const v of visitors) v.ImportDeclaration({ type: "ImportDeclaration", source: { value: "./page.html.js" } });
      expect(parses.n).toBe(1);
    } finally {
      process.chdir(cwd);
    }
  });
  it("reads a child template once for all the uses of the child in a parent template", () => {
    const dir = project({
      "src/x-kid.html": `<span>Kid</span>\n`,
      "src/x-kid.ts": component("Kid", "x-kid"),
      "src/page.html": `${Array.from({ length: 10 }, () => `<button type="button"><x-kid></x-kid></button>\n<x-kid data-on-click="go"></x-kid>`).join("\n")}\n`,
      "src/page.ts": `${H}import tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\n`,
    });
    const src = join(dir, "src");
    const ws = new Workspace();
    const kid = join(src, "x-kid.html");
    expect(readsDuring(() => lintRun([src], { ws, a11y: true, cwd: dir })).get(kid)).toBeLessThanOrEqual(3);
  });
});
