// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;
const errors: string[] = [];

beforeAll(async () => {
  const s = await startServer(5312);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${s.url}/browser/fixtures/page.html`);
  await page.waitForFunction(() => customElements.get("typed-box"));
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

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
