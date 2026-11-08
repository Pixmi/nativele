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
    ready: () => customElements.get("variant-pick") && customElements.get("order-form"),
  }));
}, 60_000);

afterAll(() => close());

describe("Typed form elements and item elements in a real browser", () => {
  it("form.elements returns the element of each named control, and a RadioNodeList for a radio group", async () => {
    const read = await page.evaluate(() => {
      const form = document.createElement("order-form") as HTMLElement & { read(): unknown };
      document.body.append(form);
      return form.read();
    });
    expect(read).toEqual({ fee: "12", note: "hi", tags: ["a", "c"], plan: "pro", gift: true });
    expect(errors).toEqual([]);
  });

  it("setting an extra prop per row through get(key).el re-renders only the rows whose value changed", async () => {
    const renders = await page.evaluate(() => {
      type Variant = { id: string; label: string };
      const pick = document.createElement("variant-pick") as HTMLElement & { set(p: object): void; takeRenders(): string[] };
      document.body.append(pick);
      const variants: Variant[] = [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ];
      const texts = () => [...pick.querySelectorAll("variant-item")].map((r) => r.textContent?.trim());
      pick.set({ variants });
      const steps: Record<string, unknown> = { created: pick.takeRenders() };
      pick.set({ selectedId: "b" });
      steps.selectB = pick.takeRenders();
      steps.textsB = texts();
      pick.set({ selectedId: "c" });
      steps.selectC = pick.takeRenders();
      steps.textsC = texts();
      pick.set({ variants: variants.map((v) => ({ ...v })) });
      steps.newObjects = pick.takeRenders();
      return steps;
    });
    expect(renders).toEqual({
      created: ["a", "b", "c"],
      selectB: ["b"],
      textsB: ["A", "B (selected)", "C"],
      selectC: ["b", "c"],
      textsC: ["A", "B", "C (selected)"],
      newObjects: ["a", "b", "c"],
    });
    expect(errors).toEqual([]);
  });
});
