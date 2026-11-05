import { Component, define } from "@nativele/ts-dom";
import tpl from "./shadow-panel.html.js";

export class ShadowPanel extends Component(tpl, { shadow: true }) {}
define("shadow-panel", ShadowPanel);
