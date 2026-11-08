// @vitest-environment node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import { generateFile } from "../src/lib/codegen.ts";
import { openPage } from "./server.ts";

const template = new URL("./fixtures/hot.html", import.meta.url).pathname;
const generated = `${template}.ts`;
const original = readFileSync(template, "utf8");
let page: Page;
let close: () => Promise<void>;
let navigations = 0;

beforeAll(async () => {
  ({ page, close } = await openPage({
    path: "/browser/fixtures/hot-page.html",
    ready: "#hot p",
    before: async (page) => {
      page.on("framenavigated", () => navigations++);
    },
  }));
}, 60_000);

afterAll(async () => {
  writeFileSync(template, original);
  generateFile(template, { runtime: "@nativele/ts-dom" }, new URL("./fixtures", import.meta.url).pathname, dirname(template));
  await close();
});

const shows = (text: string, timeout: number) =>
  page
    .waitForFunction((t) => document.querySelector("#hot p")?.textContent === t, text, { timeout })
    .then(() => true)
    .catch(() => false);

// The dev servers of the other browser tests watch the same folder, and a busy machine can drop a file event, so a missed edit is written again.
async function edit(write: (attempt: number) => string): Promise<number> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (await shows(write(attempt), 8_000)) return attempt;
  }
  throw new Error("the page never showed the edit");
}

describe("Editing while the dev server runs (real Chrome)", () => {
  it("a template edit regenerates it and reloads the page once", async () => {
    expect(await page.textContent("#hot p")).toBe("first version");
    const before = navigations;
    const attempts = await edit((n) => {
      const text = `second version ${n}`;
      writeFileSync(template, original.replace("first version", text));
      return text;
    });
    await page.waitForTimeout(1500);
    expect(navigations - before).toBeLessThanOrEqual(attempts);
    expect(navigations - before).toBeGreaterThanOrEqual(1);
  }, 40_000);

  it("a generated module rewritten by something else (ts-dom gen --watch, a checkout) also reloads the page", async () => {
    const before = navigations;
    await edit((n) => {
      const text = `rewritten ${n}`;
      writeFileSync(generated, readFileSync(generated, "utf8").replace(/(second version \d|rewritten \d|first version)/, text));
      return text;
    });
    expect(navigations - before).toBeGreaterThanOrEqual(1);
  }, 40_000);
});
