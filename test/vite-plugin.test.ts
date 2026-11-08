import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tsDom } from "../src/lib/vite-plugin.ts";
import { writeFiles, writeTree } from "./helpers.ts";

describe("the Vite plugin in a dev server", () => {
  it("several tsDom() share one watcher listener per event, and each still handles the files of its folders", () => {
    const n = 12;
    const root = writeTree(Object.fromEntries([...Array(n).keys()].map((i) => [`p${i}/x.html`, `<p>${i}</p>\n`])));
    const listeners: Record<string, ((f: string) => void)[]> = {};
    const watcher = { add: () => {}, on: (ev: string, fn: (f: string) => void) => (listeners[ev] ??= []).push(fn) };
    for (let i = 0; i < n; i++) {
      const p = tsDom({ dirs: [`p${i}`] });
      p.configResolved({ root });
      p.configureServer({ watcher, config: { logger: { error: () => {}, warn: () => {} } } });
    }
    expect(Object.fromEntries(Object.entries(listeners).map(([ev, fns]) => [ev, fns.length]))).toEqual({ add: 1, unlink: 1 });
    writeFiles(root, { "p0/y.html": `<b>y</b>\n`, [`p${n - 1}/z.html`]: `<b>z</b>\n` });
    for (const f of ["p0/y.html", `p${n - 1}/z.html`]) listeners.add?.[0]?.(join(root, f));
    expect([existsSync(join(root, "p0/y.html.ts")), existsSync(join(root, `p${n - 1}/z.html.ts`))]).toEqual([true, true]);
  });
});
