import { Component, define, type EventHit } from "@nativele/ts-dom";
import tpl from "./todo-list.html.js";
import type { Todo } from "./todo-row.ts";

export class TodoList extends Component(tpl, {
  props: { todos: [] as Todo[] },
  state: { done: [] as number[] },
  derive: { empty: (s) => s.todos.length === 0 },
}) {
  toggle(_e: Event, hit: EventHit<Todo, "id">): void {
    this.set((s) => ({ done: [...s.done, hit.key] }));
  }
  override render(view: { todos: readonly Todo[] }, changed: ReadonlySet<"todos">): void {
    if (changed.has("todos")) this.lists.todos.items = view.todos;
  }
}
define("todo-list", TodoList);
