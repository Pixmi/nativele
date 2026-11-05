import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./info-card.html.js";

export interface Item {
  id: number;
  name: string;
}

export class InfoCard extends Component(tpl, {
  props: { label: "", count: 0, item: null as Item | null },
  emits: { "item-select": event<{ id: number }>() },
}) {
  pick(): void {
    const item = this.props.item;
    if (item) this.emit("item-select", { id: item.id });
  }
  override render(view: { item: Item | null }): void {
    this.refs.itemName.textContent = view.item ? view.item.name : "-";
  }
}
define("nv-info-card", InfoCard);
