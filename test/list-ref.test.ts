import { describe, expect, it } from "vitest";
import { Component, define } from "../src/lib/index.ts";
import tpl from "./list-ref.html.js";

interface Row {
  id: number;
  label: string;
}

export class ListRef extends Component(tpl) {
  fill(rows: readonly Row[]): void {
    this.lists.rows.replace(rows, (r) => r.id, (r, { refs, show, text }) => {
      show("flagged", true);
      text.label = r.label;
      refs.note.title = `note ${r.id}`;
    });
  }
}
define("t-list-ref", ListRef);

describe("lists: data-ref inside a data-if of an item", () => {
  it("is in the item's refs, also while the block is hidden at creation", () => {
    const el = document.createElement("t-list-ref") as ListRef;
    document.body.append(el);
    el.fill([{ id: 1, label: "a" }, { id: 2, label: "b" }]);
    expect([...el.querySelectorAll("span")].map((s) => [s.textContent, s.title])).toEqual([
      ["a", "note 1"],
      ["b", "note 2"],
    ]);
    el.remove();
  });
});
