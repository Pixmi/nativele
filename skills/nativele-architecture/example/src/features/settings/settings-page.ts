import { Component, define } from "@nativele/ts-dom";
import { preferences } from "../../shared/stores/preferences.ts";
import tpl from "./settings-page.html.js";

export class SettingsPage extends Component(tpl, { state: { saved: false } }) {
  override connected(): void {
    const p = preferences.get();
    this.refs.userName.value = p.userName;
    this.refs.showDone.checked = p.showDone;
  }

  save(e: Event): void {
    e.preventDefault();
    preferences.set({ userName: this.refs.userName.value.trim(), showDone: this.refs.showDone.checked });
    this.set({ saved: true });
  }
}
define("settings-page", SettingsPage);
