import { Component, define, event } from "nativel";
import tpl from "./quantity-input.html.js";

/** A child component: the parent owns the value (a prop); the child only asks for a change through an event. */
export class QuantityInput extends Component(tpl, {
  props: { value: 0, min: 0, max: 10 },
  emits: { "quantity-change": event<{ value: number }>() },
}) {
  dec(): void {
    if (this.props.value > this.props.min) this.emit("quantity-change", { value: this.props.value - 1 });
  }
  inc(): void {
    if (this.props.value < this.props.max) this.emit("quantity-change", { value: this.props.value + 1 });
  }
}
define("quantity-input", QuantityInput);
