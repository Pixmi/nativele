import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/option/option.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import type { WaClearEvent, WaHideEvent } from "@awesome.me/webawesome";
import { Component, define, type EmitEvent, type EventHit } from "@nativele/ts-dom";
import tpl from "./signup-form.html.js";
import { THEMES, type ThemePicker } from "./theme-picker.js";

export class SignupForm extends Component(tpl, { state: { status: "", note: "", summary: "" } }) {
  override connected(): void {
    this.refs.themes.themes = THEMES;
  }
  onEmail(_e: InputEvent): void {
    this.set({ status: `Email: ${this.refs.email.value ?? ""}` });
  }
  onClear(e: WaClearEvent): void {
    this.set({ note: `Cleared by ${e.type}` });
  }
  onPlan(): void {
    this.set({ status: `Plan: ${String(this.refs.plan.value)}` });
  }
  save(e: SubmitEvent): void {
    e.preventDefault();
    const data = new FormData(this.refs.form);
    this.set({ summary: `${String(data.get("email"))} on ${String(data.get("plan"))}, news: ${data.has("news") ? "yes" : "no"}` });
    this.refs.dialog.open = true;
  }
  onTheme(e: EmitEvent<ThemePicker, "theme-change">): void {
    this.set({ status: `Theme: ${e.detail.theme.label}` });
  }
  closeDialog(): void {
    this.refs.dialog.open = false;
  }
  onDialogHide(e: WaHideEvent, hit: EventHit): void {
    if (e.target !== hit.el) return;
    this.set({ status: "Dialog closed" });
  }
}
define("signup-form", SignupForm);
