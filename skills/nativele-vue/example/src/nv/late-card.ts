import { Component, define } from "@nativele/ts-dom";
import tpl from "./late-card.html.js";
import type { Item } from "./info-card.js";

export class LateCard extends Component(tpl, { props: { item: null as Item | null } }) {
  override render(view: { item: Item | null }): void {
    this.refs.sel.textContent = view.item ? view.item.name : "-";
  }
}
define("nv-late-card", LateCard);
