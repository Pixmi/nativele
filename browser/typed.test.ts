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
    ready: () => customElements.get("typed-box"),
  }));
}, 60_000);

afterAll(() => close());

describe("Typed handler parameters in a real browser", () => {
  it("each handler receives the event its parameter is typed as", async () => {
    await page.evaluate(() => document.body.append(document.createElement("typed-box")));
    await page.click("typed-child button");
    await page.press("typed-box input", "k");
    await page.click("typed-box li button");
    const received = await page.evaluate(() => (document.querySelector("typed-box") as HTMLElement & { received: string[] }).received);
    expect(received).toEqual(["pick CustomEvent=true MouseEvent=true button=0", "key KeyboardEvent=true key=k", "row MouseEvent=true button=0 key=a"]);
    expect(errors).toEqual([]);
  });
});
