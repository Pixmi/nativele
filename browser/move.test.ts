// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;

beforeAll(async () => {
  const s = await startServer(5306);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  await page.goto(`${s.url}/browser/fixtures/page.html`);
  await page.waitForSelector("light-card");
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

describe("Atomic moves (real Chrome)", () => {
  it("reordering a keyed list keeps its items connected where the browser has moveBefore", async () => {
    const result = await page.evaluate(() => {
      const el = document.createElement("light-card") as HTMLElement & {
        lists: { rows: { replace(i: string[], k: (s: string) => string, u: (s: string, c: { text: { n: string } }) => void): void } };
      };
      document.body.append(el);
      const upd = (s: string, c: { text: { n: string } }) => (c.text.n = s);
      el.lists.rows.replace(["a", "b", "c"], (s) => s, upd);
      const items = [...el.querySelectorAll("li")];
      const input = items[0]?.appendChild(document.createElement("input"));
      input?.focus();
      el.lists.rows.replace(["c", "b", "a"], (s) => s, upd);
      return {
        hasMoveBefore: "moveBefore" in Element.prototype,
        keptFocus: document.activeElement === input,
        order: [...el.querySelectorAll("li")].map((li) => li.firstChild?.textContent),
      };
    });
    expect(result.order).toEqual(["c", "b", "a"]);
    expect(result.hasMoveBefore).toBe(true);
    expect(result.keptFocus).toBe(true);
  });
});
