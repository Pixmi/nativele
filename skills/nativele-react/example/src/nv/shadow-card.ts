import { Component, define } from "@nativele/ts-dom";
import tpl from "./shadow-card.html.js";

export class ShadowCard extends Component(tpl, { shadow: true }) {}
define("shadow-card", ShadowCard);
