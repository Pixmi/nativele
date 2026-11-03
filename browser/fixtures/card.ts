import { Component, define } from "ts-dom";
import tpl from "./card.html.js";

export class LightCard extends Component(tpl) {
  changes: string[] = [];
  override connected(): void {
    this.text.title = "light";
  }
  override slotchange(name: "head" | ""): void {
    this.changes.push(name);
  }
}
export class ShadowCard extends Component(tpl, { shadow: true }) {
  override connected(): void {
    this.text.title = "shadow";
  }
}
define("light-card", LightCard);
define("shadow-card", ShadowCard);
Object.assign(window, { LightCard, ShadowCard });
