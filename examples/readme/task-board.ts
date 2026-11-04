import { Component, define } from "@nativele/ts-dom";
import type { EventHit } from "@nativele/ts-dom";
import type { Task } from "./task-row.js";
import tpl from "./task-board.html.js";

export class TaskBoard extends Component(tpl, { state: { tasks: [] as Task[], nextId: 1 } }) {
  add(e: Event): void {
    e.preventDefault();
    const title = this.refs.title.value.trim();
    if (!title) return;
    this.set((s) => ({ tasks: [...s.tasks, { id: s.nextId, title, done: false }], nextId: s.nextId + 1 }));
    this.refs.title.value = "";
  }
  // A changed task is a new object: the list sets the prop only on items that are not the same object as before.
  toggleTask(_e: Event, hit: EventHit): void {
    this.set((s) => ({ tasks: s.tasks.map((t) => (t.id === hit.key ? { ...t, done: !t.done } : t)) }));
  }
  removeTask(_e: Event, hit: EventHit): void {
    this.set((s) => ({ tasks: s.tasks.filter((t) => t.id !== hit.key) }));
  }
  sortByTitle(): void {
    this.set((s) => ({ tasks: [...s.tasks].sort((a, b) => a.title.localeCompare(b.title)) }));
  }
  override render(view: { tasks: Task[] }, changed: ReadonlySet<string>): void {
    if (changed.has("tasks")) this.lists.tasks.items = view.tasks;
  }
}
define("task-board", TaskBoard);
