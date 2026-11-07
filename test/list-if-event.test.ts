import { expect, it } from "vitest";
import { Component, define } from "@nativele/ts-dom";
import tpl from "./list-if-event.html.js";

const hits: string[] = [];
class IfRows extends Component(tpl) {
  hitAlways(): void {
    hits.push("always");
  }
  hitShown(): void {
    hits.push("shown");
  }
}
define("t-if-rows", IfRows);

it("a data-on-* inside a data-if block of a list item fires once the block is shown", () => {
  const r = document.createElement("t-if-rows") as IfRows;
  document.body.append(r);
  r.lists.rows.replace(["x"], (s) => s, (_s, { show }) => show("on", true));
  r.querySelector<HTMLElement>(".always")?.click();
  r.querySelector<HTMLElement>(".shown")?.click();
  expect(hits).toEqual(["always", "shown"]);
});
