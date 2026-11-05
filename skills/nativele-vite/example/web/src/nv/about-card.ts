import { Component, define } from "@nativele/ts-dom";
import tpl from "./about-card.html.js";

export class AboutCard extends Component(tpl, { state: { version: "1" } }) {}
define("about-card", AboutCard);
