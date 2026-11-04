import { Component, define } from "@nativele/ts-dom";
import tpl from "./hot.html.js";

export class HotBox extends Component(tpl) {}
define("hot-box", HotBox);
