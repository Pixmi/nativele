import { describe, expect, it } from "vitest";
import { scenarios } from "../browser/fixtures/top-level/scenarios.ts";
import { expected } from "../browser/fixtures/top-level/expected.ts";
import type { ScenarioName } from "../browser/fixtures/top-level/expected.ts";

describe("Light DOM template top level: list items, slots and fallback", () => {
  for (const name of Object.keys(expected) as ScenarioName[]) {
    it(name, async () => {
      expect(await scenarios[name]()).toEqual(expected[name]);
    });
  }
});
