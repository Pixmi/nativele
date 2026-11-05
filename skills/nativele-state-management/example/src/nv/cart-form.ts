import { Component, define } from "@nativele/ts-dom";
import { cart } from "../stores/cart.ts";
import tpl from "./cart-form.html.js";

export class CartForm extends Component(tpl) {
  addApple(): void {
    cart.getState().add("apple");
  }
  onNote(): void {
    cart.getState().setNote(this.refs.note.value);
  }
}
define("cart-form", CartForm);
