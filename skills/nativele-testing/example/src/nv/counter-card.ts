import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./counter-card.html.js";

export class CounterCard extends Component(tpl, {
  props: { label: "Count" },
  state: { count: 0 },
  derive: { many: (s) => s.count >= 3 },
  emits: { "count-change": event<{ count: number }>() },
}) {
  increment(): void {
    this.set({ count: this.state.count + 1 });
    this.emit("count-change", { count: this.state.count });
  }
}
define("counter-card", CounterCard);
