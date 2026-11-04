import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./task-row.html.js";

export interface Task {
  id: number;
  title: string;
  done: boolean;
}

/** One item of the list: it receives its task as a prop and asks the parent for changes through events. */
export class TaskRow extends Component(tpl, {
  props: { task: null as Task | null },
  derive: { title: (s) => s.task?.title ?? "" },
  emits: { "task-toggle": event(), "task-remove": event() },
}) {
  override render(view: { task: Task | null }): void {
    const done = view.task?.done ?? false;
    if (this.refs.done.checked !== done) this.refs.done.checked = done;
  }
  toggle(): void {
    this.emit("task-toggle");
  }
  drop(): void {
    this.emit("task-remove");
  }
}
define("task-row", TaskRow);
