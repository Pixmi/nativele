import { Component, define } from "@nativele/ts-dom";
import type { EmitEvent } from "@nativele/ts-dom";
import type { QuantityInput } from "./quantity-input.js";
import tpl from "./order-line.html.js";

export class OrderLine extends Component(tpl, {
  state: { quantity: 1, price: 20 },
  derive: { total: (s) => s.quantity * s.price },
}) {
  // Event up: the child asked for a new quantity; the parent decides.
  onQuantity(e: EmitEvent<QuantityInput, "quantity-change">): void {
    this.set({ quantity: e.detail.value });
  }

  // Data down: the child's props are typed (a wrong name or type is a tsc error).
  override render(view: { quantity: number }): void {
    this.refs.qty.value = view.quantity;
  }
}
define("order-line", OrderLine);
