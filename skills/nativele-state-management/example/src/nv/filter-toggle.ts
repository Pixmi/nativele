import { Component, define } from "@nativele/ts-dom";
import { fromStore } from "../stores/from-store.ts";
import { setFilter, store } from "../stores/counter.ts";
import tpl from "./filter-toggle.html.js";

const currentFilter = fromStore(store, (s) => s.filter);

export class FilterToggle extends Component(tpl, { state: { filter: "all" as "all" | "done" } }) {
  override connected(): void {
    this.bind(currentFilter, (filter) => this.set({ filter }));
  }
  toggle(): void {
    store.dispatch(setFilter(this.state.filter === "all" ? "done" : "all"));
  }
}
define("filter-toggle", FilterToggle);
