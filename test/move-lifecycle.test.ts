import { describe, expect, it } from "vitest";
import { Component, createStore, define } from "../src/lib/index.ts";
import listTpl from "./move-lifecycle.html.js";
import rowTpl from "./store-row.html.js";

const theme = createStore("light");

export class StoreRow extends Component(rowTpl, { props: { row: null as { id: number } | null } }) {
  disconnects = 0;
  override connected(): void {
    this.bind(theme, (t) => (this.refs.label.textContent = `${this.props.row?.id}:${t}`));
  }
  override disconnected(): void {
    this.disconnects++;
  }
}
define("t-store-row", StoreRow);

class StoreList extends Component(listTpl) {}
define("t-store-list", StoreList);

describe("moving list items without moveBefore", () => {
  it("a subscription made in connected() is made again after the item is moved", () => {
    expect("moveBefore" in Element.prototype).toBe(false);
    const list = document.createElement("t-store-list") as StoreList;
    document.body.append(list);
    const a = { id: 1 };
    const b = { id: 2 };
    list.lists.rows.items = [a, b];
    list.lists.rows.items = [b, a];
    const rows = [...list.querySelectorAll<StoreRow>("t-store-row")];
    expect(rows.some((r) => r.disconnects > 0)).toBe(true);
    theme.set("dark");
    expect(rows.map((r) => r.textContent?.trim())).toEqual(["2:dark", "1:dark"]);
  });
});
