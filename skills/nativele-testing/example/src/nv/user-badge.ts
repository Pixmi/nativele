import { Component, define } from "@nativele/ts-dom";
import tpl from "./user-badge.html.js";
import { session } from "./session.ts";

export class UserBadge extends Component(tpl) {
  override connected(): void {
    this.bind(session, (s) => (this.text.user = s.user));
  }
}
define("user-badge", UserBadge);
