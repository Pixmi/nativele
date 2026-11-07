import fs, { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { watchAll } from "../src/lib/codegen.ts";
import { Workspace } from "../src/lib/components.ts";
import { lintRun } from "../src/lib/lint.ts";
import plugin from "../src/lib/oxlint-plugin.ts";
import { tsDom } from "../src/lib/vite-plugin.ts";

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

/** Count the files read from disk while `fn` runs. */
function reads(fn: () => void): number {
  let n = 0;
  const real = fs.readFileSync;
  fs.readFileSync = ((...args: Parameters<typeof real>) => (n++, real(...args))) as typeof real;
  syncBuiltinESMExports();
  try {
    fn();
  } finally {
    fs.readFileSync = real;
    syncBuiltinESMExports();
  }
  return n;
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
  const dev = (children: number) => {
    const files: Record<string, string> = {};
    for (let i = 0; i < children; i++) {
      files[`src/c${i}.html`] = `<button type="button">C${i}</button>\n`;
      files[`src/c${i}.ts`] = component(`C${i}`, `x-c${i}`).replace(`./x-c${i}.html.js`, `./c${i}.html.js`);
    }
    files["src/page.html"] = `${Array.from({ length: children }, (_, i) => `<x-c${i} data-on-click="go"></x-c${i}>`).join("\n")}\n`;
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
      const n = reads(() => p.handleHotUpdate({ file: join(dir, "src", name), server }));
      return { reads: n, warned: warned.map((w) => /([\w-]+\.html):(\d+):\d+ warning \[([\w-]+)\]/.exec(w)?.slice(1).join(" ")) };
    };
    return { save, warned };
  };
  it("checks the parent template again when a child template it uses changes", () => {
    const { save, warned } = dev(3);
    expect(warned).toEqual([]);
    expect(save("c1.html", `<div>C1, no button</div>\n`).warned).toEqual(["page.html 2 click-semantics"]);
    expect(save("c1.html", `<button type="button">C1 again</button>\n`).warned).toEqual([]);
  });
  it("reads the same number of files for a save whatever the size of the project", () => {
    const small = dev(4).save("c1.html", `<div>C1, no button</div>\n`).reads;
    const large = dev(16).save("c1.html", `<div>C1, no button</div>\n`).reads;
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
    const before = ws.reads;
    lintRun([src], { ws, a11y: true });
    expect(ws.reads).toBe(before);
    const live = fs.readdirSync(src).filter((f) => f.endsWith(".html") || (f.endsWith(".ts") && !f.endsWith(".html.ts"))).length;
    expect(ws.size.files).toBeLessThanOrEqual(live);
    expect(ws.size.results).toBe(3);
    const hasTree = (v: unknown, seen = new Set<unknown>()): boolean => {
      if (!v || typeof v !== "object" || seen.has(v)) return false;
      seen.add(v);
      return "nodeName" in v || "childNodes" in v || Object.values(v).some((x) => hasTree(x, seen));
    };
    expect(ws.size.values.some((v) => hasTree(v))).toBe(false);
  });
  it("ts-dom gen --watch reads only the saved template", async () => {
    const dir = project({ "src/a.html": `<p>{{ a }}</p>\n`, "src/a.ts": component("A", "x-a").replace("./x-a.html.js", "./a.html.js"), "src/b.ts": component("B", "x-b").replace("./x-b.html.js", "./b.html.js"), "src/b.html": `<p></p>\n` });
    const ws = new Workspace();
    const src = join(dir, "src");
    ws.index([src]);
    const before = ws.reads;
    const generated = new Promise<string>((resolve) => {
      const stop = watchAll([src], { onGenerate: (f) => (stop(), resolve(f)) }, ws);
      setTimeout(() => writeFileSync(join(src, "a.html"), `<p>{{ a }} {{ b }}</p>\n`), 100);
    });
    expect(await generated).toBe(join(src, "a.html.ts"));
    expect(ws.reads - before).toBe(1);
  }, 10_000);
});
