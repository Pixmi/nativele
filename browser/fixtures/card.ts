import { Component, define } from "@nativele/ts-dom";
import tpl from "./card.html.js";
import parentTpl from "./card-parent.html.js";

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
export class CardParent extends Component(parentTpl, { state: { on: false } }) {}
define("light-card", LightCard);
define("shadow-card", ShadowCard);
define("light-card-parent", CardParent);
Object.assign(window, { LightCard, ShadowCard, CardParent });
