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
    ready: "light-card",
    before: async (page) => {
      await page.route("**/browser/fixtures/page.html", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          headers: {
            ...response.headers(),
            "content-security-policy": "require-trusted-types-for 'script'",
          },
        });
      });
    },
  }));
}, 60_000);

afterAll(() => close());

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
