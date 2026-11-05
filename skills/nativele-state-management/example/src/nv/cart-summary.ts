import { Component, define } from "@nativele/ts-dom";
import { cart } from "../stores/cart.ts";
import tpl from "./cart-summary.html.js";

export class CartSummary extends Component(tpl, { state: { count: 0 } }) {
  override connected(): void {
    this.bind({ get: cart.getState, subscribe: cart.subscribe }, (s) => this.set({ count: s.items.length }));
  }
}
define("cart-summary", CartSummary);
