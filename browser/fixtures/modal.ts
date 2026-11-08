import { Component, define } from "@nativele/ts-dom";
import tpl from "./modal.html.js";
import parentTpl from "./modal-parent.html.js";

class CountConnects extends HTMLElement {
  static connects = 0;
  connectedCallback(): void {
    CountConnects.connects++;
  }
}
customElements.define("b-count-connects", CountConnects);

export class Modal extends Component(tpl) {
  override connected(): void {
    this.refs.content.remove();
  }
  open(): void {
    this.append(this.refs.content);
  }
}
define("b-modal", Modal);

export class ModalParent extends Component(parentTpl, { state: { on: false } }) {
  fill(names: string[]): void {
    this.lists.rows.replace(names, (n) => n, (n, { text }) => {
      text.n = n;
    });
  }
}
define("b-modal-parent", ModalParent);
Object.assign(window, { CountConnects });
