// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;
const errors: string[] = [];

beforeAll(async () => {
  const s = await startServer(5308);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${s.url}/browser/fixtures/page.html`);
  await page.waitForSelector("light-card");
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

describe("List items assignment in real Chrome", () => {
  it("shows, reorders without disconnecting, removes, and reports events with the key", async () => {
    const result = await page.evaluate(() => {
      type Box = HTMLElement & { lists: { rows: { items: unknown } }; picked: string[] };
      const box = document.createElement("rows-box") as Box;
      document.body.append(box);
      const a = { id: "a", label: "A" };
      const b = { id: "b", label: "B" };
      const c = { id: "c", label: "C" };
      box.lists.rows.items = [a, b];
      const texts = () => [...box.querySelectorAll("row-item")].map((r) => r.textContent?.trim());
      const first = texts();
      const input = box.querySelector("row-item")?.appendChild(document.createElement("input"));
      input?.focus();
      box.lists.rows.items = [b, a, c];
      const reordered = texts();
      const keptFocus = document.activeElement === input;
      box.lists.rows.items = [c];
      const last = texts();
      (box.querySelector("row-item button") as HTMLButtonElement).click();
      return { first, reordered, keptFocus, last, picked: box.picked };
    });
    expect(result.first).toEqual(["A", "B"]);
    expect(result.reordered).toEqual(["B", "A", "C"]);
    expect(result.keptFocus).toBe(true);
    expect(result.last).toEqual(["C"]);
    expect(result.picked).toEqual(["c"]);
    expect(errors).toEqual([]);
  });
});
