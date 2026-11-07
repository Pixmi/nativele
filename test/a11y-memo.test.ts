import { expect, it } from "vitest";
import { checkA11y } from "../src/lib/a11y.ts";
import type { A11yChildren } from "../src/lib/a11y.ts";

it("reads a component's template once per slot, however many children fill it", () => {
  let reads = 0;
  const templates: Record<string, string> = {
    "x-list": `<ul><li><x-row><slot></slot></x-row></li></ul>`,
    "x-row": `<div><x-cell><slot></slot></x-cell><x-cell></x-cell></div>`,
    "x-cell": `<span><x-leaf><slot></slot></x-leaf></span>`,
    "x-leaf": `<label><slot></slot></label>`,
  };
  const children: A11yChildren = new (class extends Map<string, { template: { file: string; html: string } }> {
    override get(tag: string) {
      reads++;
      return super.get(tag);
    }
  })(Object.entries(templates).map(([tag, html]) => [tag, { template: { file: `${tag}.html`, html } }]));
  checkA11y(`<x-list>${`<input type="text">`.repeat(200)}</x-list>`, [], children);
  expect(reads).toBeLessThan(40);
});
