// Compile-only: an `any` read from a type Nativele did not write counts as not declared (checked by `tsc`, not run by vitest).
// Every @ts-expect-error below MUST be a real type error; every line without one MUST compile.
import { Component, define } from "@nativele/ts-dom";
import type { El, EmitEvent, ListItem } from "@nativele/ts-dom";
import tpl from "./typed/loose.html.js";

interface VendorTyped extends HTMLElement {
  onanyprop: any;
  onanyparam: ((ev: any) => void) | null;
  ondetail: ((ev: CustomEvent) => void) | null;
}

declare global {
  interface HTMLElementTagNameMap {
    "vendor-loose": any;
    "vendor-typed": VendorTyped;
    "vendor-row": HTMLElement & { item: any };
  }
  interface HTMLElementEventMap {
    "mapped-any": any;
    "mapped-detail": CustomEvent;
  }
}

type IsAny<T> = 0 extends 1 & T ? true : false;
const yes = <T extends true>(): T | undefined => undefined;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Lists = (typeof tpl extends { readonly __schema?: infer S } ? NonNullable<S> : never) extends { lists: infer L } ? L : never;
type Row = Lists extends { rows: infer R } ? R : never;
type LooseRow = Lists extends { looseRows: infer R } ? R : never;

// A tag map entry typed any reads as an unlisted tag: HTMLElement.
yes<Same<El<"vendor-loose">, HTMLElement>>();
// A data-prop typed any, or an item tag typed any, takes items as a component from elsewhere does.
yes<Same<ListItem<Row>, { [field: string]: unknown } & { id: string | number }>>();
yes<Same<ListItem<LooseRow>, { [field: string]: unknown } & { id: string | number }>>();
// A component typed any emits no declared events.
yes<Same<EmitEvent<any, "x">, never>>();

export class Loose extends Component(tpl) {
  read(): void {
    yes<Same<typeof this.refs.loose, HTMLElement>>();
    // @ts-expect-error an element typed any in the tag map is an HTMLElement, which has no such member
    void this.refs.loose.vendorOnly;
    this.lists.rows.items = [{ id: 1, label: "a" }];
    // @ts-expect-error the data-key field is still checked
    this.lists.rows.items = [{ label: "a" }];
    this.lists.rows.replace([{ id: 1 }], (r) => r.id, (_r, ctx) => {
      yes<Same<typeof ctx.el, El<"vendor-row">>>();
    });

    // An on<name> property typed any, or whose listener takes any, does not declare the event: the listener gets what its annotation names, or Event.
    this.on(this.refs.typed, "anyprop", (e) => {
      yes<Same<typeof e, Event>>();
    });
    this.on(this.refs.typed, "anyparam", (e: MouseEvent) => void e.button);
    // An HTMLElementEventMap entry typed any does not declare the event either.
    this.on(this.refs.typed, "mapped-any", (e) => {
      yes<Same<typeof e, Event>>();
    });
    this.on(this.refs.typed, "mapped-any", (e: KeyboardEvent) => void e.key);

    // A CustomEvent whose detail is any is checked to be a CustomEvent; the detail is not checked, and reads as unknown where the parameter is typed for it.
    this.on(this.refs.typed, "detail", (e: CustomEvent<{ id: number }>) => void e.detail.id);
    // @ts-expect-error a MouseEvent is not the CustomEvent the property declares
    this.on(this.refs.typed, "detail", (e: MouseEvent) => void e.button);
    this.on(this.refs.typed, "mapped-detail", (e) => {
      yes<Same<typeof e, CustomEvent<unknown>>>();
      yes<IsAny<typeof e.detail> extends true ? false : true>();
    });
    this.on(this.refs.typed, "mapped-detail", (e: CustomEvent<string>) => void e.detail.length);
    // @ts-expect-error a MouseEvent is not the CustomEvent HTMLElementEventMap declares
    this.on(this.refs.typed, "mapped-detail", (e: MouseEvent) => void e.button);
    // MessageEvent's data defaults to any as well.
    this.on(window, "message", (e: MessageEvent<{ kind: string }>) => void e.data.kind);
    // @ts-expect-error a CustomEvent is not the MessageEvent the window declares
    this.on(window, "message", (e: CustomEvent) => void e.detail);
  }
  onLoose(_e: CustomEvent<{ id: number }>): void {}
  onAnyProp(_e: CustomEvent<{ id: number }>): void {}
  onAnyParam(_e: KeyboardEvent): void {}
  onDetail(_e: CustomEvent<{ id: number }>): void {}
  onMappedAny(_e: CustomEvent<{ id: number }>): void {}
  onMappedDetail(_e: CustomEvent<{ id: number }>): void {}
}
// Handlers of events that a source types any are not checked, and any CustomEvent is accepted for a detail typed any.
define("x-loose", Loose);

class Untyped extends Component(tpl) {
  onLoose(_e: Event): void {}
  onAnyProp(_e: Event): void {}
  onAnyParam(_e: Event): void {}
  onDetail(_e: Event): void {}
  onMappedAny(_e: Event): void {}
  onMappedDetail(_e: Event): void {}
}
define("x-loose-untyped", Untyped);

class WrongDetailKind extends Untyped {
  override onDetail(_e: MouseEvent): void {}
}
// @ts-expect-error wrongHandlerParameters: onDetail receives a CustomEvent, named CustomEvent<unknown> in the error
define("x-wrong-detail-kind", WrongDetailKind);

class WrongMappedDetailKind extends Untyped {
  override onMappedDetail(_e: FocusEvent): void {}
}
// @ts-expect-error wrongHandlerParameters: onMappedDetail receives a CustomEvent
define("x-wrong-mapped-detail-kind", WrongMappedDetailKind);

// A class typed any is not checked: define() cannot read its handlers.
declare const untyped: any;
define("x-untyped-any", untyped);
