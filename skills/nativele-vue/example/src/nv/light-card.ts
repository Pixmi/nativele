import { Component, define } from "@nativele/ts-dom";
import tpl from "./light-card.html.js";

export class LightCard extends Component(tpl) {}
define("nv-light-card", LightCard);
