import { Component, define } from "@nativele/ts-dom";
import tpl from "./variant-row.html.js";

export interface Variant {
  id: string;
  label: string;
}

export class VariantRow extends Component(tpl, {
  props: { variant: null as Variant | null, selected: false },
  derive: { label: (s) => s.variant?.label ?? "" },
}) {}
define("variant-row", VariantRow);
