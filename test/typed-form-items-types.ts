// Compile-only: a form's elements and a list item's root element are typed from the template (checked by `tsc`, not run by vitest).
// Every @ts-expect-error below MUST be a real type error; every line without one MUST compile.
import { Component, define } from "@nativele/ts-dom";
import type { Branch } from "./typed/branch.ts";
import formTpl from "./typed/form.html.js";
import itemsTpl from "./typed/items.html.js";
import type { Variant } from "./typed/variant-row.ts";
import "./typed/branch.ts";
import "./typed/variant-row.ts";

export class OrderForm extends Component(formTpl) {
  read(): void {
    const form = this.refs.order;
    const { elements } = form;
    elements.fee satisfies HTMLInputElement;
    elements.tags satisfies HTMLSelectElement;
    elements.note satisfies HTMLTextAreaElement;
    elements.go satisfies HTMLButtonElement;
    elements.total satisfies HTMLOutputElement;
    elements.extra satisfies HTMLFieldSetElement;
    elements.code satisfies HTMLInputElement;
    elements.owned satisfies HTMLInputElement;
    elements.plan satisfies RadioNodeList;
    elements.opt satisfies RadioNodeList;
    elements.maybe satisfies HTMLInputElement | undefined;
    elements.pair satisfies HTMLInputElement | RadioNodeList;
    void elements.fee.value;
    void elements.plan.value;
    void [...elements.tags.selectedOptions].map((o) => o.value);
    elements.length satisfies number;
    elements.namedItem("fee") satisfies RadioNodeList | Element | null;
    elements.item(0) satisfies Element | null;
    for (const el of elements) el satisfies Element;
    form.reset();
    form.requestSubmit();
    this.refs.empty.elements satisfies HTMLFormControlsCollection;
    this.lists.rows.replace([{ id: 1 }], (r) => r.id, (_r, { refs }) => {
      refs.row.elements.qty satisfies HTMLInputElement;
    });

    // @ts-expect-error a misspelled name is not a control of the form
    void elements.feee;
    // @ts-expect-error a control inside data-if may be missing
    elements.maybe satisfies HTMLInputElement;
    // @ts-expect-error several controls with one name are a RadioNodeList, not one element
    void elements.plan.checked;
    // @ts-expect-error a name hidden by a member of the collection reads that member
    elements.length satisfies HTMLInputElement;
    // @ts-expect-error <input type="image"> is not in form.elements
    void elements.pic;
    // @ts-expect-error a control inside a nested component is not known to the parent template
    void elements.slotted;
    // @ts-expect-error a control whose form attribute names another form belongs to that form
    void elements.elsewhere;
    // @ts-expect-error a control outside the form, associated with form="order", is not typed
    void elements.outside;
  }
}
define("x-order-form", OrderForm);

export class VariantList extends Component(itemsTpl) {
  select(id: string): void {
    const row = this.lists.variants.get(id);
    if (!row) return;
    row.el.selected = true;
    row.el.variant satisfies Variant | null;
    // @ts-expect-error the item component declares no "chosen" prop
    row.el.chosen = true;
    // @ts-expect-error selected is a boolean prop
    row.el.selected = "yes";
  }
  fill(): void {
    this.lists.tags.replace(["a"], (t) => t, (t, { el, text }) => {
      el satisfies HTMLLIElement;
      text.label = t;
    });
    this.lists.icons.replace(["a"], (t) => t, (_t, { el }) => {
      el satisfies SVGElement;
    });
    const tag = this.lists.tags.get("a");
    // @ts-expect-error an <li> has a number value
    if (tag) tag.el.value = "a";
  }
}
define("x-variant-list", VariantList);

declare const branch: Branch;
const child = branch.lists.children.get(1);
if (child) {
  child.el satisfies Branch;
  child.el.open = true;
  // @ts-expect-error open is a boolean prop of the item component, which is the component itself
  child.el.open = 1;
}
