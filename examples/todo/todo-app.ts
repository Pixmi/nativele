import { Component, define } from "@nativele/ts-dom";
import type { DeepReadonly, EventHit } from "@nativele/ts-dom";
import tpl from "./todo-app.html.js";

export interface Todo {
  id: number;
  title: string;
  done: boolean;
}
export type Filter = "all" | "active" | "done";
interface State {
  items: Todo[];
  filter: Filter;
}

const FILTERS = ["all", "active", "done"] as const;
const visibleOf = (s: DeepReadonly<State>) =>
  s.items.filter((t) => s.filter === "all" || (s.filter === "active" ? !t.done : t.done));

export class TodoApp extends Component(tpl, {
  state: { items: [], filter: "all" } as State,
  // Derived values: {{ remaining }} and data-if="empty" use them directly, no manual updates
  derive: {
    remaining: (s) => s.items.filter((t) => !t.done).length,
    empty: (s) => visibleOf(s).length === 0,
  },
}) {
  #nextId = 1;

  // ---- Events: data-on-*="methodName" in the HTML; always change data through this.set ----
  add(e: Event): void {
    e.preventDefault();
    const title = this.refs.input.value.trim();
    this.refs.input.value = "";
    this.refs.input.focus();
    if (title) this.set((s) => ({ items: [...s.items, { id: this.#nextId++, title, done: false }] }));
  }
  toggle(_e: Event, hit: EventHit): void {
    this.set((s) => ({ items: s.items.map((t) => (t.id === hit.key ? { ...t, done: !t.done } : t)) }));
  }
  removeTodo(_e: Event, hit: EventHit): void {
    this.set((s) => ({ items: s.items.filter((t) => t.id !== hit.key) }));
  }
  setFilter(_e: Event, hit: EventHit): void {
    this.set({ filter: (hit.el as HTMLElement).dataset.filter as Filter });
  }

  // ---- View: what automatic binding cannot do (attributes, lists) lives here ----
  override render(v: DeepReadonly<State>, changed: ReadonlySet<string>): void {
    if (changed.has("filter")) {
      for (const f of FILTERS) this.refs[f].setAttribute("aria-pressed", String(f === v.filter));
    }
    if (changed.has("items") || changed.has("filter")) {
      this.lists.items.replace(
        visibleOf(v),
        (t) => t.id,
        (t, { el, refs, text }) => {
          text.title = t.title;
          el.classList.toggle("done", t.done);
          refs.check.checked = t.done;
          refs.check.setAttribute("aria-label", `Complete: ${t.title}`);
          refs.remove.setAttribute("aria-label", `Delete: ${t.title}`);
        },
        { skipUnchanged: true },
      );
    }
  }
}
define("todo-app", TodoApp);
