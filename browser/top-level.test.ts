// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Page } from "playwright-core";
import { openPage } from "./server.ts";
import { expected } from "./fixtures/top-level/expected.ts";
import type { ScenarioName } from "./fixtures/top-level/expected.ts";

let page: Page;
let errors: string[];
let close: () => Promise<void>;

beforeAll(async () => {
  ({ page, errors, close } = await openPage({
    path: "/browser/fixtures/top-level/page.html",
    ready: () => "scenarios" in window,
  }));
}, 60_000);

afterAll(() => close());

describe("Light DOM template top level (real browser)", () => {
  for (const name of Object.keys(expected) as ScenarioName[]) {
    it(name, async () => {
      const got = await page.evaluate((n) => (window as unknown as { scenarios: Record<string, () => Promise<unknown>> }).scenarios[n]?.(), name);
      expect(got).toEqual(expected[name]);
      expect(errors).toEqual([]);
    });
  }
});
