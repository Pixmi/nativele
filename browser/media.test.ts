// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;

beforeAll(async () => {
  const s = await startServer(5307);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  await page.goto(`${s.url}/browser/fixtures/page.html`);
  await page.waitForSelector("light-card");
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

describe("Events that do not bubble (real Chrome)", () => {
  it("media and dialog events reach data-on-* handlers", async () => {
    const seen = await page.evaluate(() => {
      const box = document.createElement("media-box") as HTMLElement & { seen: string[]; refs: { video: HTMLElement; dialog: HTMLElement } };
      document.body.append(box);
      box.refs.video.dispatchEvent(new Event("canplay"));
      box.refs.dialog.dispatchEvent(new Event("close"));
      return box.seen;
    });
    expect(seen).toEqual(["canplay", "close"]);
  });
});
