import { Component, define } from "@nativele/ts-dom";
import tpl from "./bench-row.html.js";

export interface Row {
  id: number;
  label: string;
}

export class BenchRow extends Component(tpl, {
  props: { row: null as Row | null },
  derive: { label: (s) => s.row?.label ?? "" },
}) {}
define("bench-row", BenchRow);
