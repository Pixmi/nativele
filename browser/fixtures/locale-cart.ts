import { Component, define } from "@nativele/ts-dom";
import { locale, messages } from "./locale.js";
import type { Locale } from "./locale.js";
import tpl from "./locale-cart.html.js";

export class LocaleCart extends Component(tpl, {
  props: { count: 0 },
  state: { locale: "en" as Locale },
  derive: { summary: (s) => messages[s.locale].items(s.count) },
}) {
  override connected(): void {
    this.bind(locale, (l) => this.set({ locale: l }));
  }
}
define("locale-cart", LocaleCart);
