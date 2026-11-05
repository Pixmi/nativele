// Compile-only regression file (checked by `tsc`, not run by vitest).
// Any option shape below that stops compiling is a typing regression.
import { Component } from "@nativele/ts-dom";
import type { EventHit } from "@nativele/ts-dom";
import tpl from "./stateful.html.js";

const state = { title: "", count: 1, open: true };

// `shadow` together with `derive`: the parameter of the derive function must still be inferred
// (it used to become an implicit any because the plain overload was tried first).
export class ShadowFirst extends Component(tpl, { shadow: true, state, derive: { double: (s) => s.count * 2 } }) {
  inc(): void {}
  del(): void {}
  focused(): void {}
}
export class ShadowLast extends Component(tpl, { state, derive: { double: (s) => s.count * 2 }, shadow: true }) {
  inc(): void {}
  del(): void {}
  focused(): void {}
}
export class ShadowFalse extends Component(tpl, { shadow: false, state, derive: { double: (s) => s.count * 2 } }) {
  inc(): void {}
  del(): void {}
  focused(): void {}
}

// The plain forms keep returning the plain instance type.
export class Plain extends Component(tpl) {}
export class PlainShadow extends Component(tpl, { shadow: true }) {}
export class PlainEmpty extends Component(tpl, {}) {}

// `changed` holds state, prop and derived names; annotating it with those names lets tsc check every `changed.has(...)`.
export class ChangedNames extends Component(tpl, { state, derive: { double: (s) => s.count * 2 } }) {
  inc(): void {}
  del(): void {}
  focused(): void {}
  override render(_v: unknown, changed: ReadonlySet<"title" | "count" | "open" | "double">): void {
    if (changed.has("double")) return;
    // @ts-expect-error: "doubled" is not a state, prop or derived name
    if (changed.has("doubled")) return;
  }
}
export class ChangedTypo extends Component(tpl, { state, derive: { double: (s) => s.count * 2 } }) {
  inc(): void {}
  del(): void {}
  focused(): void {}
  // @ts-expect-error: the annotation names a field that does not exist
  override render(_v: unknown, _changed: ReadonlySet<"tilte">): void {}
}

// EventHit with the item type and its key field types both `item` and `key`; without them both stay optional and untyped.
interface Todo {
  id: number;
  text: string;
}
export const typedHit = (hit: EventHit<Todo, "id">): number => hit.key + hit.item.text.length;
export const plainHit = (hit: EventHit): PropertyKey | undefined => hit.key;
// @ts-expect-error: "name" is not a field of Todo
export const badField = (hit: EventHit<Todo, "name">) => hit;
