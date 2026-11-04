// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;
const errors: string[] = [];

beforeAll(async () => {
  const s = await startServer(5305);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/browser/fixtures/page.html", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": "require-trusted-types-for 'script'" },
    });
  });
  await page.goto(`${s.url}/browser/fixtures/page.html`);
  await page.waitForSelector("light-card");
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

describe("Trusted Types enforced (real Chrome)", () => {
  it("the policy is active: assigning an HTML string is blocked", async () => {
    const blocked = await page.evaluate(() => {
      try {
        document.createElement("div").innerHTML = "<b>x</b>";
        return false;
      } catch {
        return true;
      }
    });
    expect(blocked).toBe(true);
  });
  it("components render without any Trusted Types violation", async () => {
    expect(errors).toEqual([]);
    expect(await page.textContent("#parsed")).toContain("body");
    expect(await page.$("#parsed *")).not.toBeNull();
    expect(await page.$("#shadow")).not.toBeNull();
  });
});
