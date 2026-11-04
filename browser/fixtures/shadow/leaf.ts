import { Component, define, event } from "nativele";
import tpl from "./leaf.html.js";

// The same component in both modes, to compare Shadow DOM against Light DOM.
export class ShadowLeaf extends Component(tpl, {
  shadow: true,
  props: { label: "", count: 0 },
  state: { clicks: 0 },
  derive: { big: (s) => s.clicks >= 2 },
  emits: { bumped: event<{ clicks: number }>() },
}) {
  focusCount = 0;
  bump(): void {
    this.set((s) => ({ clicks: s.clicks + 1 }));
    this.emit("bumped", { clicks: this.state.clicks });
  }
  onFocus(): void {
    this.focusCount++;
  }
}

export class LightLeaf extends Component(tpl, {
  props: { label: "", count: 0 },
  state: { clicks: 0 },
  derive: { big: (s) => s.clicks >= 2 },
  emits: { bumped: event<{ clicks: number }>() },
}) {
  focusCount = 0;
  bump(): void {
    this.set((s) => ({ clicks: s.clicks + 1 }));
    this.emit("bumped", { clicks: this.state.clicks });
  }
  onFocus(): void {
    this.focusCount++;
  }
}

define("sh-leaf", ShadowLeaf);
define("lt-leaf", LightLeaf);
