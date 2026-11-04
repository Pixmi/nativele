import { Component, define } from "nativele";
import tpl from "./host.html.js";

/** A Light DOM parent that contains a Shadow DOM child. */
export class LightHost extends Component(tpl, { state: { total: 0 } }) {
  onBumped(): void {
    this.set((s) => ({ total: s.total + 1 }));
  }
}
define("lt-host", LightHost);
