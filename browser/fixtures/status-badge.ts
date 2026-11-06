import { Component, define } from "@nativele/ts-dom";
import type { User } from "./users.js";
import tpl from "./status-badge.html.js";

export class StatusBadge extends Component(tpl, { props: { status: "active" as User["status"] } }) {}
define("status-badge", StatusBadge);
