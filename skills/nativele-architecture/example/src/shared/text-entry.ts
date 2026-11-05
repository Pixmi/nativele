import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./text-entry.html.js";

export class TextEntry extends Component(tpl, {
  props: { label: "", action: "Add" },
  emits: { "entry-submit": event<{ value: string }>() },
}) {
  submit(e: Event): void {
    e.preventDefault();
    const value = this.refs.input.value.trim();
    if (!value) return;
    this.refs.input.value = "";
    this.emit("entry-submit", { value });
  }
}
define("text-entry", TextEntry);
