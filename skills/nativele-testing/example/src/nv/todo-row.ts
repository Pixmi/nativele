import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./todo-row.html.js";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
}

export class TodoRow extends Component(tpl, {
  props: { todo: null as Todo | null },
  derive: { title: (s) => s.todo?.title ?? "" },
  emits: { "todo-toggle": event() },
}) {
  toggle(): void {
    this.emit("todo-toggle");
  }
  override render(view: { todo: Todo | null }): void {
    this.refs.done.checked = view.todo?.done ?? false;
  }
}
define("todo-row", TodoRow);
