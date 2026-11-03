import { Component } from "ts-dom";
import tpl from "./lazy.html.js";

/** Deliberately not defined: tests "a prop assigned before the element is upgraded" */
export class Lazy extends Component(tpl, { props: { label: "" } }) {}
Object.assign(window, { Lazy });
