import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./text-field.html.js";

export class TextField extends Component(tpl, {
  props: { value: "" },
  emits: { "value-change": event<{ value: string }>() },
}) {
  onInput(): void {
    this.emit("value-change", { value: this.refs.input.value });
  }
  override render(view: { value: string }): void {
    if (this.refs.input.value !== view.value) this.refs.input.value = view.value;
  }
}
define("nv-text-field", TextField);
