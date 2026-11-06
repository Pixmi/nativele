// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page, Route } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;
const errors: string[] = [];
const held: Route[] = [];
let requests = 0;
let aborted = 0;

beforeAll(async () => {
  const s = await startServer(5312);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("requestfailed", (r) => r.url().endsWith("/api/slow") && aborted++);
  await page.route("**/api/slow", (route) => {
    requests++;
    held.push(route);
  });
  await page.goto(`${s.url}/browser/fixtures/page.html`);
  await page.waitForSelector("light-card");
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

const settle = () => page.evaluate(() => new Promise((r) => setTimeout(r, 100)));
const status = () => page.evaluate(() => document.querySelector("abort-load")?.textContent?.trim());

describe("Cancelling a request when the component is removed (real Chrome)", () => {
  it("aborts on removal, ignores the AbortError, and starts again on the next connection", async () => {
    await page.evaluate(() => document.body.append(document.createElement("abort-load")));
    await settle();
    expect([requests, aborted]).toEqual([1, 0]);

    await page.evaluate(() => document.querySelector("abort-load")?.remove());
    await settle();
    expect(aborted).toBe(1);

    await page.evaluate(() => document.body.append(document.createElement("abort-load")));
    await settle();
    expect(requests).toBe(2);
    await held.at(-1)?.fulfill({ body: "done" });
    await page.waitForFunction(() => document.querySelector("abort-load")?.textContent?.trim() === "done");
    expect(await status()).toBe("done");
    await page.evaluate(() => document.querySelector("abort-load")?.remove());
  });

  it("a move without moveBefore aborts and restarts the request; a move with moveBefore keeps it", async () => {
    const before = { requests, aborted };
    await page.evaluate(() => {
      const ul = document.createElement("ul");
      ul.id = "moves";
      ul.append(document.createElement("abort-load"), document.createElement("li"));
      document.body.append(ul);
    });
    await settle();
    expect(requests - before.requests).toBe(1);

    await page.evaluate(() => {
      const ul = document.querySelector("#moves")!;
      ul.moveBefore(ul.querySelector("abort-load")!, null);
    });
    await settle();
    expect([requests - before.requests, aborted - before.aborted]).toEqual([1, 0]);

    await page.evaluate(() => {
      const ul = document.querySelector("#moves")!;
      ul.insertBefore(ul.querySelector("abort-load")!, ul.firstElementChild);
    });
    await settle();
    expect([requests - before.requests, aborted - before.aborted]).toEqual([2, 1]);
    expect(errors).toEqual([]);
  });
});
