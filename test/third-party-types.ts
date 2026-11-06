// Compile-only: a custom element from another library, used in a template (checked by `tsc`, not run by vitest).
// Every @ts-expect-error below MUST be a real type error; every line without one MUST compile.
import { Component, define } from "@nativele/ts-dom";
import tpl from "./typed/third-party.html.js";

interface VendorPicker extends HTMLElement {
  value: string;
  open(): void;
}

declare global {
  interface HTMLElementTagNameMap {
    "vendor-picker": VendorPicker;
  }
  interface GlobalEventHandlersEventMap {
    "vendor-change": CustomEvent<{ value: string }>;
  }
}

export class UsesThirdParty extends Component(tpl) {
  onPick(e: CustomEvent<{ value: string }>): void {
    this.refs.picker.value = e.detail.value;
    this.refs.picker.open();
  }
  onOther(_e: Event): void {
    // @ts-expect-error a tag that HTMLElementTagNameMap does not list is an HTMLElement
    void this.refs.other.value;
  }
}
define("x-uses-third-party", UsesThirdParty);

class NarrowOther extends UsesThirdParty {
  override onOther(_e: CustomEvent<{ n: number }>): void {}
}
// @ts-expect-error wrongHandlerParameters: an event that no event map declares is received as Event
define("x-narrow-other", NarrowOther);

class WrongDetail extends Component(tpl) {
  onPick(_e: CustomEvent<{ id: number }>): void {}
  onOther(): void {}
}
// @ts-expect-error wrongHandlerParameters: onPick receives the declared CustomEvent<{ value: string }>
define("x-wrong-detail", WrongDetail);
