// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page, Route } from "playwright-core";
import { openPage } from "./server.ts";

let page: Page;
let errors: string[];
let close: () => Promise<void>;
const held: Route[] = [];
let requests = 0;
let aborted = 0;

beforeAll(async () => {
  ({ page, errors, close } = await openPage({
    path: "/browser/fixtures/page.html",
    ready: "light-card",
    before: async (page, errors) => {
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("requestfailed", (r) => r.url().endsWith("/api/slow") && aborted++);
      await page.route("**/api/slow", (route) => {
        requests++;
        held.push(route);
      });
    },
  }));
}, 60_000);

afterAll(() => close());

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
