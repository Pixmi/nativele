import { Component, define } from "@nativele/ts-dom";
import childTpl from "./order-child.html.js";
import parentTpl from "./order-parent.html.js";

export class OrderChild extends Component(childTpl, { props: { label: "" } }) {
  seen: string[] = [];
  override connected(): void {
    this.seen.push(`connected:${this.props.label}`);
  }
  override render(view: { label: string }): void {
    this.seen.push(`render:${view.label}`);
  }
}
define("b-order-child", OrderChild);

export class OrderLight extends Component(parentTpl, { state: { name: "Ada" } }) {
  override render(view: { name: string }): void {
    this.refs.kid.label = view.name;
  }
}
define("b-order-light", OrderLight);

export class OrderShadow extends Component(parentTpl, { shadow: true, state: { name: "Ada" } }) {
  override render(view: { name: string }): void {
    this.refs.kid.label = view.name;
  }
}
define("b-order-shadow", OrderShadow);
