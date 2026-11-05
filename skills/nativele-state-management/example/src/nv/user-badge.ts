import { Component, define } from "@nativele/ts-dom";
import { session } from "../stores/session.ts";
import tpl from "./user-badge.html.js";

export class UserBadge extends Component(tpl, { state: { user: "" } }) {
  override connected(): void {
    this.bind(session, (s) => this.set({ user: s.user }));
  }
}
define("user-badge", UserBadge);
