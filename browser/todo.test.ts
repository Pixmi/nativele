// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;

beforeAll(async () => {
  const s = await startServer(5302);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${s.url}/`);
  await page.waitForSelector("todo-app form");
  expect(errors).toEqual([]);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

const add = async (title: string) => {
  await page.fill("todo-app #todo-new", title);
  await page.press("todo-app #todo-new", "Enter");
};
const titles = () => page.$$eval("todo-app li span", (e) => e.map((x) => x.textContent));
const remaining = () => page.textContent("todo-app footer span");

describe("Todo list e2e (real Chrome)", () => {
  it("initial: empty state, slot title, 0 left", async () => {
    expect(await page.textContent("todo-app h1")).toBe("Todo list");
    expect(await page.textContent("todo-app p")).toBe("No matching todos");
    expect(await remaining()).toBe("0 left");
  });
  it("add: empty state disappears, input is cleared and keeps focus", async () => {
    await add("Buy milk");
    await add("Write code");
    await add("   "); // blank input is not added
    expect(await titles()).toEqual(["Buy milk", "Write code"]);
    expect(await page.$("todo-app p")).toBeNull();
    expect(await remaining()).toBe("2 left");
    expect(await page.inputValue("#todo-new")).toBe("");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("todo-new");
  });
  it("check: count updates, styling, aria-label", async () => {
    await page.check("todo-app li:first-child input[type=checkbox]");
    expect(await remaining()).toBe("1 left");
    expect(await page.getAttribute("todo-app li:first-child", "class")).toBe("done");
    expect(await page.getAttribute("todo-app li:first-child input", "aria-label")).toBe("Complete: Buy milk");
  });
  it("filter: aria-pressed stays in sync, list shows only matching items", async () => {
    await page.click("todo-app footer button:has-text('Active')");
    expect(await titles()).toEqual(["Write code"]);
    expect(await page.getAttribute("todo-app footer button:has-text('Active')", "aria-pressed")).toBe("true");
    expect(await page.getAttribute("todo-app footer button:has-text('All')", "aria-pressed")).toBe("false");
    await page.click("todo-app footer button:has-text('Done')");
    expect(await titles()).toEqual(["Buy milk"]);
    await page.click("todo-app footer button:has-text('All')");
    expect(await titles()).toEqual(["Buy milk", "Write code"]);
  });
  it("delete keeps existing nodes", async () => {
    await add("Do laundry");
    const keep = await page.evaluateHandle(() => document.querySelectorAll("todo-app li")[1]);
    await page.click("todo-app li:first-child button");
    expect(await titles()).toEqual(["Write code", "Do laundry"]);
    // the second item's DOM node is still the same after deleting the first (keyed diffing, no rebuild)
    expect(await page.evaluate((el) => document.querySelectorAll("todo-app li")[0] === el, keep)).toBe(true);
  });
  it("filtering to no results shows the empty state", async () => {
    await page.click("todo-app footer button:has-text('Done')");
    expect(await titles()).toEqual([]);
    expect(await page.textContent("todo-app p")).toBe("No matching todos");
  });
  it("<style> is injected only once across multiple component instances", async () => {
    expect(await page.$$eval("style[data-ts-dom='todo-app']", (e) => e.length)).toBe(1);
  });
});
