import { Component, define } from "@nativele/ts-dom";
import tpl from "./route-message.html.js";

export class RouteMessage extends Component(tpl, { props: { heading: "", detail: "" } }) {}
define("route-message", RouteMessage);
