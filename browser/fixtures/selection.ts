import { Component, define } from "@nativele/ts-dom";
import formTpl from "./order-form.html.js";
import itemTpl from "./variant-item.html.js";
import pickTpl from "./variant-pick.html.js";

export class OrderForm extends Component(formTpl) {
  read(): Record<string, unknown> {
    const { fee, note, tags, plan, gift } = this.refs.form.elements;
    return {
      fee: fee instanceof HTMLInputElement && fee.value,
      note: note instanceof HTMLTextAreaElement && note.value,
      tags: tags instanceof HTMLSelectElement && [...tags.selectedOptions].map((o) => o.value),
      plan: plan instanceof RadioNodeList && plan.value,
      gift: gift instanceof HTMLInputElement && gift.checked,
    };
  }
}
define("order-form", OrderForm);

export interface Variant {
  id: string;
  label: string;
}

export const renders: string[] = [];

export class VariantItem extends Component(itemTpl, {
  props: { variant: null as Variant | null, selected: false },
  derive: { label: (s) => `${s.variant?.label ?? ""}${s.selected ? " (selected)" : ""}` },
}) {
  override render(): void {
    renders.push(this.variant?.id ?? "");
  }
}
define("variant-item", VariantItem);

export class VariantPick extends Component(pickTpl, {
  state: { variants: [] as Variant[], selectedId: "" },
}) {
  override render(view: { variants: readonly Variant[]; selectedId: string }, changed: ReadonlySet<string>): void {
    if (changed.has("variants")) this.lists.variants.items = view.variants;
    for (const v of view.variants) {
      const row = this.lists.variants.get(v.id);
      if (row) row.el.selected = v.id === view.selectedId;
    }
  }
  takeRenders(): string[] {
    return renders.splice(0).sort();
  }
}
define("variant-pick", VariantPick);
