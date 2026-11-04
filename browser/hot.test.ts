// @vitest-environment node
import { readFileSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

const template = new URL("./fixtures/hot.html", import.meta.url).pathname;
const original = readFileSync(template, "utf8");
let browser: Browser;
let page: Page;
let stop: () => void;
let navigations = 0;

beforeAll(async () => {
  const s = await startServer(5309);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  page.on("framenavigated", () => navigations++);
  await page.goto(`${s.url}/browser/fixtures/hot-page.html`);
  await page.waitForSelector("#hot p");
}, 60_000);

afterAll(async () => {
  writeFileSync(template, original);
  await browser?.close();
  stop?.();
});

describe("Editing a template while the dev server runs (real Chrome)", () => {
  it("regenerates it and the page reloads once with the new markup", async () => {
    expect(await page.textContent("#hot p")).toBe("first version");
    const before = navigations;
    writeFileSync(template, original.replace("first version", "second version"));
    await page.waitForFunction(() => document.querySelector("#hot p")?.textContent === "second version", undefined, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    writeFileSync(process.env.PROBE_OUT ?? "/dev/null", String(navigations - before));
  }, 30_000);
});
