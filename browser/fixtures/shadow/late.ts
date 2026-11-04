import { Component } from "nativele";
import tpl from "./late.html.js";

/** Deliberately not defined: tests "a prop assigned before the element is upgraded" in Shadow DOM mode. */
export class LateShadow extends Component(tpl, { shadow: true, props: { label: "" } }) {}
Object.assign(window, { LateShadow });
