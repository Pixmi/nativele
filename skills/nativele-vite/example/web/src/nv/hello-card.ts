import { Component, define } from "@nativele/ts-dom";
import tpl from "./hello-card.html.js";

export class HelloCard extends Component(tpl, { props: { name: "" }, state: { count: 0 } }) {
  bump(): void {
    this.set({ count: this.state.count + 1 });
  }
}
define("hello-card", HelloCard);
