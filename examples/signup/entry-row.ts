import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./entry-row.html.js";

/** One row of the list: it only shows its props and tells the parent when Remove is pressed. */
export class EntryRow extends Component(tpl, {
  props: { name: "", email: "" },
  emits: { "remove-entry": event() },
}) {
  onRemove(): void {
    this.emit("remove-entry");
  }
}
define("entry-row", EntryRow);
