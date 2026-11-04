// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;
const errors: string[] = [];

beforeAll(async () => {
  const s = await startServer(5310);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${s.url}/browser/fixtures/tasks-page.html`);
  await page.waitForSelector("#board form");
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

const titles = () => page.$$eval("#board task-row label", (els) => els.map((e) => e.textContent?.trim()));
const add = async (title: string) => {
  await page.fill("#board input[aria-label='New task']", title);
  await page.press("#board input[aria-label='New task']", "Enter");
};

describe("README example 4 in real Chrome: a list of components", () => {
  it("adds, toggles, sorts without losing focus, and removes", async () => {
    await add("write");
    await add("read");
    expect(await titles()).toEqual(["write", "read"]);

    await page.click("#board task-row:nth-of-type(2) input[type=checkbox]");
    expect(await page.isChecked("#board task-row:nth-of-type(2) input[type=checkbox]")).toBe(true);

    await page.focus("#board task-row:nth-of-type(2) input[type=checkbox]");
    await page.evaluate(() => (document.querySelector("#board > button") as HTMLButtonElement).click());
    expect(await titles()).toEqual(["read", "write"]);
    expect(await page.evaluate(() => document.activeElement?.closest("task-row")?.querySelector("label")?.textContent?.trim())).toBe("read");
    expect(await page.isChecked("#board task-row:nth-of-type(1) input[type=checkbox]")).toBe(true);

    await page.click("#board task-row:nth-of-type(1) button");
    expect(await titles()).toEqual(["write"]);
    expect(errors).toEqual([]);
  });
});
