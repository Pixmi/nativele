import { Component, define } from "ts-dom";
import tpl from "./scoped.html.js";

/** `scoped` has no effect in Shadow DOM (the shadow root already isolates the style). */
export class ShadowScoped extends Component(tpl, { shadow: true }) {}
define("sh-scoped", ShadowScoped);
