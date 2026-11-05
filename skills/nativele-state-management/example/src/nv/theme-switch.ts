import { Component, define } from "@nativele/ts-dom";
import { $theme } from "../stores/theme.ts";
import tpl from "./theme-switch.html.js";

export class ThemeSwitch extends Component(tpl, { state: { theme: "light" as "light" | "dark" } }) {
  override connected(): void {
    this.bind({ get: $theme.get, subscribe: $theme.listen }, (theme) => this.set({ theme }));
  }
  toggle(): void {
    $theme.set($theme.get() === "light" ? "dark" : "light");
  }
}
define("theme-switch", ThemeSwitch);
