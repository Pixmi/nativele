import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./child.html.js";

export class FieldChild extends Component(tpl, {
  props: { label: "", value: "", error: "", maxLength: 10, disabled: false, items: [] as string[] },
  state: { dirty: false },
  emits: { "value-change": event<{ value: string }>(), closed: event({ bubbles: true }), ping: event() },
}) {
  renders = 0;
  onInput(): void {
    this.set({ dirty: true });
    this.emit("value-change", { value: this.refs.input.value });
  }
  close(): void {
    this.emit("closed");
  }
  override render(v: { value: string }, changed: ReadonlySet<"value">): void {
    this.renders++;
    // Do not write input.value every time: writing the same value moves the caret to the end
    if (changed.has("value") && this.refs.input.value !== v.value) this.refs.input.value = v.value;
  }
}
define("x-child", FieldChild);
