// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import { openPage } from "./server.ts";

let page: Page;
let errors: string[];
let close: () => Promise<void>;
let calls = 0;

beforeAll(async () => {
  ({ page, errors, close } = await openPage({
    path: "/browser/fixtures/recipes-page.html",
    before: async (page) => {
      await page.route("**/api/contacts", async (route) => {
        calls++;
        if (calls === 1) return route.fulfill({ status: 500, body: "" });
        await route.fulfill({
          json: [
            { id: 1, name: "Ada", email: "ada@example.com" },
            { id: 2, name: "Grace", email: "grace@example.com" },
          ],
        });
      });
    },
  }));
}, 60_000);

afterAll(() => close());

const names = () => page.$$eval("#app contact-row span:first-child", (els) => els.map((e) => e.textContent));
const total = () => page.textContent("#app contact-stats p");

describe("docs/recipes.md in real Chrome", () => {
  it("shows the error state, then loads on retry", async () => {
    await page.waitForSelector("#app p[role=alert]");
    expect(await page.textContent("#app p[role=alert]")).toContain("HTTP 500");
    await page.click("#app p[role=alert] button");
    await page.waitForSelector("#app contact-row");
    expect(await names()).toEqual(["Ada", "Grace"]);
    expect(await page.$("#app p[role=alert]")).toBeNull();
    expect(await total()).toBe("2 contacts");
  });

  it("filters through a derived list guarded by changed.has", async () => {
    await page.fill("#app input[type=search]", "gr");
    expect(await names()).toEqual(["Grace"]);
    await page.fill("#app input[type=search]", "zz");
    expect(await names()).toEqual([]);
    expect(await page.$("#app p:has-text('No contacts match.')")).not.toBeNull();
    await page.fill("#app input[type=search]", "");
    expect(await page.$("#app p:has-text('No contacts match.')")).toBeNull();
    expect(await names()).toEqual(["Ada", "Grace"]);
  });

  it("validates the dialog form, then adds a contact", async () => {
    await page.click("#app button:has-text('Add contact')");
    expect(await page.$eval("#app dialog", (d) => (d as HTMLDialogElement).open)).toBe(true);
    await page.click("#app dialog button[type=submit]");
    expect(await page.$$eval("#app dialog p[role=alert]", (els) => els.map((e) => e.textContent))).toEqual(["Name is required", "Enter a valid email"]);
    await page.fill("#app dialog input[name=name]", "Linus");
    expect(await page.$$("#app dialog p[role=alert]")).toHaveLength(0);
    await page.fill("#app dialog input[name=email]", "linus@example.com");
    await page.click("#app dialog button[type=submit]");
    expect(await page.$eval("#app dialog", (d) => (d as HTMLDialogElement).open)).toBe(false);
    expect(await names()).toEqual(["Ada", "Grace", "Linus"]);
    expect(await total()).toBe("3 contacts");
  });

  it("removes a contact with a typed hit.key", async () => {
    await page.click("#app contact-row:nth-of-type(1) button");
    expect(await names()).toEqual(["Grace", "Linus"]);
    expect(await total()).toBe("2 contacts");
    expect(errors).toEqual([]);
  });
});
