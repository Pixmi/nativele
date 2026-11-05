import { Component, define } from "@nativele/ts-dom";
import { fromStore } from "../stores/from-store.ts";
import { increment, store } from "../stores/counter.ts";
import tpl from "./counter-view.html.js";

const counterValue = fromStore(store, (s) => s.counter.value);

export class CounterView extends Component(tpl, { state: { value: 0 } }) {
  override connected(): void {
    this.bind(counterValue, (value) => this.set({ value }));
  }
  increment(): void {
    store.dispatch(increment());
  }
}
define("counter-view", CounterView);
