import { Component, define } from "@nativele/ts-dom";
import type { EventHit } from "@nativele/ts-dom";
import tpl from "./todo-list.html.js";

interface Item {
  id: number;
  title: string;
  done: boolean;
}

export class TodoList extends Component(tpl, {
  state: { items: [] as Item[] },
  derive: { remaining: (s) => s.items.filter((i) => !i.done).length },
}) {
  #nextId = 1;

  add(e: Event): void {
    e.preventDefault();
    const title = this.refs.input.value.trim();
    this.refs.input.value = "";
    if (title) this.set((s) => ({ items: [...s.items, { id: this.#nextId++, title, done: false }] }));
  }
  toggle(_e: Event, hit: EventHit): void {
    this.set((s) => ({ items: s.items.map((i) => (i.id === hit.key ? { ...i, done: !i.done } : i)) }));
  }
  removeItem(_e: Event, hit: EventHit): void {
    this.set((s) => ({ items: s.items.filter((i) => i.id !== hit.key) }));
  }

  // Automatic binding handles {{ remaining }}; the list is filled here.
  override render(view: { items: Item[] }, changed: ReadonlySet<string>): void {
    if (!changed.has("items")) return;
    this.lists.items.replace(
      view.items,
      (i) => i.id,
      (i, { text, refs }) => {
        text.title = i.title;
        refs.check.checked = i.done;
        refs.check.setAttribute("aria-label", `Done: ${i.title}`);
      },
      { skipUnchanged: true },
    );
  }
}
define("todo-list", TodoList);
