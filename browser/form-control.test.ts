// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import { openPage } from "./server.ts";

let page: Page;
let errors: string[];
let close: () => Promise<void>;

beforeAll(async () => {
  ({ page, errors, close } = await openPage({
    path: "/browser/fixtures/page.html",
    ready: () => customElements.get("rating-input"),
  }));
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.id = "review";
    const fieldset = document.createElement("fieldset");
    const rating = document.createElement("rating-input");
    rating.setAttribute("name", "rating");
    rating.setAttribute("required", "");
    fieldset.append(rating);
    form.append(fieldset);
    document.body.append(form);
  });
}, 60_000);

afterAll(() => close());

const formValue = () => page.evaluate(() => new FormData(document.querySelector<HTMLFormElement>("#review")!).get("rating"));
const invalid = () => page.evaluate(() => document.querySelector("rating-input")!.matches(":invalid"));

describe("Form-associated component (real Chrome)", () => {
  it("is a control of the outer form", async () => {
    expect(await page.evaluate(() => [...document.querySelector<HTMLFormElement>("#review")!.elements].includes(document.querySelector("rating-input")!))).toBe(true);
  });

  it("setValidity makes the form invalid with the message until a value is chosen", async () => {
    expect(await formValue()).toBeNull();
    expect(await invalid()).toBe(true);
    expect(await page.evaluate(() => document.querySelector<HTMLFormElement>("#review")!.checkValidity())).toBe(false);
    expect(await page.evaluate(() => document.querySelector<HTMLFormElement>("#review")!.reportValidity())).toBe(false);
    expect(await page.evaluate(() => [document.activeElement?.textContent, document.querySelector("#review")!.matches(":invalid")])).toEqual(["1", true]);
  });

  it("setFormValue puts the chosen value into the outer form's FormData", async () => {
    await page.click("rating-input button:nth-of-type(4)");
    expect(await formValue()).toBe("4");
    expect(await invalid()).toBe(false);
    expect(await page.$$eval("rating-input button", (b) => b.map((x) => x.ariaPressed))).toEqual(["true", "true", "true", "true", "false"]);
    expect(await page.evaluate(() => document.querySelector<HTMLFormElement>("#review")!.checkValidity())).toBe(true);
  });

  it("form.reset() calls formResetCallback", async () => {
    await page.evaluate(() => document.querySelector<HTMLFormElement>("#review")!.reset());
    expect(await formValue()).toBeNull();
    expect(await invalid()).toBe(true);
  });

  it("a disabled fieldset calls formDisabledCallback", async () => {
    await page.evaluate(() => (document.querySelector("fieldset")!.disabled = true));
    expect(await page.evaluate(() => document.querySelector("rating-input")!.matches(":disabled"))).toBe(true);
    expect(await page.$$eval("rating-input button", (b) => b.every((x) => (x as HTMLButtonElement).disabled))).toBe(true);
    await page.evaluate(() => (document.querySelector("fieldset")!.disabled = false));
    expect(await page.$$eval("rating-input button", (b) => b.some((x) => (x as HTMLButtonElement).disabled))).toBe(false);
    expect(errors).toEqual([]);
  });
});
