import { Component, define, event } from "@nativele/ts-dom";
import type { EventHit } from "@nativele/ts-dom";
import tpl from "./rows.html.js";
import itemTpl from "./row-item.html.js";

export interface Row {
  id: string;
  label: string;
}

export class RowItem extends Component(itemTpl, {
  props: { row: null as Row | null },
  derive: { label: (s) => s.row?.label ?? "" },
  emits: { picked: event<void>() },
}) {
  pick(): void {
    this.emit("picked");
  }
}
define("row-item", RowItem);

export class RowsBox extends Component(tpl) {
  picked: PropertyKey[] = [];
  onPicked(_e: Event, hit: EventHit): void {
    this.picked.push(hit.key as PropertyKey);
  }
}
define("rows-box", RowsBox);
