import { Component, define } from "@nativele/ts-dom";
import { session } from "../stores/session.ts";
import tpl from "./sign-in.html.js";

export class SignIn extends Component(tpl) {
  signIn(): void {
    session.set((s) => ({ ...s, user: "Ada" }));
  }
}
define("sign-in", SignIn);
