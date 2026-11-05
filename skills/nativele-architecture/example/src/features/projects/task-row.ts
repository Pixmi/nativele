import { Component, define, event } from "@nativele/ts-dom";
import type { Task } from "./projects-store.ts";
import tpl from "./task-row.html.js";

export class TaskRow extends Component(tpl, {
  props: { task: { id: "", projectId: "", title: "", done: false } as Task },
  derive: { title: (v) => v.task.title },
  emits: { "task-toggle": event() },
}) {
  onChange(): void {
    this.emit("task-toggle");
  }

  override render(view: { task: Task }): void {
    this.refs.check.checked = view.task.done;
  }
}
define("task-row", TaskRow);
