import { Component, define } from "@nativele/ts-dom";
import tpl from "./light-panel.html.js";

export class LightPanel extends Component(tpl) {
  override slotchange(name: "title" | ""): void {
    this.dataset.changed = name || "default";
  }
}
define("light-panel", LightPanel);
