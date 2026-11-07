// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";
import { expected } from "./fixtures/top-level/expected.ts";
import type { ScenarioName } from "./fixtures/top-level/expected.ts";

let browser: Browser;
let page: Page;
let stop: () => void;
const errors: string[] = [];

beforeAll(async () => {
  const s = await startServer(5318);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${s.url}/browser/fixtures/top-level/page.html`);
  await page.waitForFunction(() => "scenarios" in window);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

describe("Light DOM template top level (real browser)", () => {
  for (const name of Object.keys(expected) as ScenarioName[]) {
    it(name, async () => {
      const got = await page.evaluate((n) => (window as unknown as { scenarios: Record<string, () => Promise<unknown>> }).scenarios[n]?.(), name);
      expect(got).toEqual(expected[name]);
      expect(errors).toEqual([]);
    });
  }
});
