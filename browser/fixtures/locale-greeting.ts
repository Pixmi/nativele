import { Component, define } from "@nativele/ts-dom";
import { locale, messages } from "./locale.js";
import tpl from "./locale-greeting.html.js";

export class LocaleGreeting extends Component(tpl) {
  override connected(): void {
    this.bind(locale, (l) => (this.text.hello = messages[l].hello));
  }
}
define("locale-greeting", LocaleGreeting);
