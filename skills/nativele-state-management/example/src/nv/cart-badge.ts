import { Component, define } from "@nativele/ts-dom";
import { cart } from "../stores/cart.ts";
import { fromStore } from "../stores/from-store.ts";
import tpl from "./cart-badge.html.js";

const itemCount = fromStore(cart, (s) => s.items.length);

export class CartBadge extends Component(tpl, { state: { count: 0 } }) {
  override connected(): void {
    this.bind(itemCount, (count) => this.set({ count }));
  }
}
define("cart-badge", CartBadge);
