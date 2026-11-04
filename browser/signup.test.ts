// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Locator, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;

beforeAll(async () => {
  const s = await startServer(5303);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${s.url}/`);
  await page.waitForSelector("signup-form form-field input");
  // Record every field-input / remove-entry that bubbles up to window: child component events do not bubble by default, so there should be none
  await page.evaluate(() => {
    const w = window as unknown as { leaked: string[] };
    w.leaked = [];
    for (const t of ["field-input", "remove-entry"]) window.addEventListener(t, () => w.leaked.push(t));
  });
  expect(errors).toEqual([]);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

const field = (n: number): Locator => page.locator("signup-form form-field").nth(n);
const input = (n: number): Locator => field(n).locator("input");
const alerts = (n: number) => field(n).locator("[role=alert]").count();
const submit = (): Locator => page.locator("signup-form button[type=submit]");

describe("Signup form e2e (composition, props down, events up)", () => {
  it("initial: no error messages, submit button disabled, slot title, empty state", async () => {
    expect(await page.textContent("signup-form h2")).toBe("Sign up");
    expect(await alerts(0)).toBe(0);
    expect(await alerts(1)).toBe(0);
    expect(await submit().isDisabled()).toBe(true);
    expect(await page.textContent("signup-form p:has-text('Nobody has signed up yet')")).toBe("Nobody has signed up yet");
    expect(await page.textContent("signup-form >> text=0 signed up")).toBeTruthy();
  });
  it("the field's own touched state: the parent-computed error shows only after it has been touched", async () => {
    await input(1).fill("bad");
    expect(await alerts(1)).toBe(1);
    expect(await field(1).locator("[role=alert]").textContent()).toBe("Please enter a valid email");
    expect(await input(1).getAttribute("aria-invalid")).toBe("true");
    expect(await alerts(0)).toBe(0); // name has not been touched yet
    await input(0).focus();
    await input(0).blur(); // merely leaving it counts as touched
    expect(await field(0).locator("[role=alert]").textContent()).toBe("Please enter your name");
  });
  it("writing data back does not make the caret jump: inserting a character mid-string leaves the caret right after it", async () => {
    await input(0).fill("abc");
    await input(0).evaluate((el: HTMLInputElement) => el.setSelectionRange(1, 1));
    await page.keyboard.type("X");
    expect(await input(0).inputValue()).toBe("aXbc");
    expect(await input(0).evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(2);
  });
  it("the submit button is enabled only when all conditions are met", async () => {
    await input(0).fill("Ada");
    await input(1).fill("ada@example.com");
    expect(await submit().isDisabled()).toBe(true); // terms not agreed yet
    await page.check("signup-form input[type=checkbox]");
    expect(await submit().isDisabled()).toBe(false);
    expect(await alerts(0)).toBe(0);
    expect(await alerts(1)).toBe(0);
  });
  it("submit: adds a row (child component), clears fields and checkbox, no error messages appear", async () => {
    await submit().click();
    const rows = page.locator("signup-form entry-row");
    expect(await rows.count()).toBe(1);
    expect(await rows.first().textContent()).toContain("Ada <ada@example.com>");
    expect(await input(0).inputValue()).toBe("");
    expect(await input(1).inputValue()).toBe("");
    expect(await page.isChecked("signup-form input[type=checkbox]")).toBe(false);
    expect(await submit().isDisabled()).toBe(true);
    expect(await alerts(0)).toBe(0); // parent clears the fields → child component resets touched
    expect(await alerts(1)).toBe(0);
    expect(await page.textContent("signup-form >> text=1 signed up")).toBeTruthy();
    expect(await page.$("signup-form p:has-text('Nobody has signed up yet')")).toBeNull();
  });
  it("add another entry and remove the first: only the clicked row is removed, the other row's node is kept", async () => {
    await input(0).fill("Bob");
    await input(1).fill("bob@example.com");
    await page.check("signup-form input[type=checkbox]");
    await submit().click();
    const rows = page.locator("signup-form entry-row");
    expect(await rows.count()).toBe(2);
    const second = await rows.nth(1).elementHandle();
    await rows.first().locator("button").click();
    expect(await rows.count()).toBe(1);
    expect(await rows.first().textContent()).toContain("Bob");
    expect(await rows.first().evaluate((el, h) => el === h, second)).toBe(true);
  });
  it("removing everything returns to the empty state", async () => {
    await page.locator("signup-form entry-row button").first().click();
    expect(await page.locator("signup-form entry-row").count()).toBe(0);
    expect(await page.textContent("signup-form >> text=0 signed up")).toBeTruthy();
    expect(await page.textContent("signup-form p:has-text('Nobody has signed up yet')")).toBeTruthy();
  });
  it("events from child components do not bubble by default: window received none", async () => {
    expect(await page.evaluate(() => (window as unknown as { leaked: string[] }).leaked)).toEqual([]);
  });
  it("each component's <style> is injected only once", async () => {
    for (const tag of ["signup-form", "form-field"]) {
      expect(await page.$$eval(`style[data-nativele='${tag}']`, (e) => e.length)).toBe(1);
    }
  });
});
