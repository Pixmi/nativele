// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;
const errors: string[] = [];

beforeAll(async () => {
  const s = await startServer(5316);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${s.url}/browser/fixtures/page.html`);
  await page.waitForFunction(() => customElements.get("locale-greeting") && customElements.get("locale-cart"));
  await page.evaluate(() => {
    const cart = document.createElement("locale-cart");
    cart.count = 3;
    document.body.append(document.createElement("locale-greeting"), cart);
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

// A string, so that vitest does not rewrite the dynamic import that runs in the page
const setLocale = (l: string) => page.evaluate(`import("/browser/fixtures/locale.ts").then((m) => m.setLocale(${JSON.stringify(l)}))`);
const texts = () => page.evaluate(() => [document.querySelector("locale-greeting")?.textContent?.trim(), document.querySelector("locale-cart")?.textContent?.trim(), document.documentElement.lang]);

describe("Re-rendering on a locale change (real Chrome)", () => {
  it("switching the locale updates every mounted component and the document language", async () => {
    expect(await texts()).toEqual(["Hello", "3 items", ""]);
    await setLocale("fr");
    expect(await texts()).toEqual(["Bonjour", "3 articles", "fr"]);
  });

  it("a removed component stops updating, and binds again when it is inserted again", async () => {
    const removed = await page.evaluateHandle(() => {
      const el = document.querySelector("locale-greeting")!;
      el.remove();
      return el;
    });
    await setLocale("en");
    expect(await removed.evaluate((el) => el.textContent?.trim())).toBe("Bonjour");
    expect(await texts()).toEqual([undefined, "3 items", "en"]);
    await removed.evaluate((el) => document.body.append(el));
    expect(await texts()).toEqual(["Hello", "3 items", "en"]);
    expect(errors).toEqual([]);
  });
});
