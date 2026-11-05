import { Component, define } from "@nativele/ts-dom";
import tpl from "./progress-meter.html.js";

export class ProgressMeter extends Component(tpl, {
  props: { done: 0, total: 0 },
  derive: { summary: (v) => `${v.done} of ${v.total} done` },
}) {
  override render(view: { done: number; total: number }): void {
    this.refs.bar.max = Math.max(view.total, 1);
    this.refs.bar.value = view.done;
  }
}
define("progress-meter", ProgressMeter);
