// Compile-only: the first parameter of a data-on-* handler is checked against the event the template binds it to (checked by `tsc`, not run by vitest).
// Every @ts-expect-error below MUST be a real type error; every line without one MUST compile.
import { Component, define, event, template } from "@nativele/ts-dom";
import type { EmitEvent, EventHit } from "@nativele/ts-dom";
import type { FieldChild } from "./compose/child.ts";
import tpl from "./typed/handlers.html.js";
import treeTpl from "./typed/tree.html.js";
import "./typed/tree.ts";

export class Typed extends Component(tpl) {
  onValue(e: EmitEvent<FieldChild, "value-change">): void {
    void e.detail.value;
  }
  onClick(e: MouseEvent): void {
    void e.button;
  }
  onKey(e: KeyboardEvent): void {
    void e.key;
  }
  onChange(_e: Event): void {}
  onSubmit(e: SubmitEvent): void {
    void e.submitter;
  }
  onUnknown(_e: Event): void {}
  onBoth(_e: MouseEvent | CustomEvent<void>): void {}
  onRow(_e: MouseEvent, hit: EventHit): void {
    void hit.key;
  }
}
define("x-typed", Typed);

export class Untyped extends Component(tpl) {
  onValue(_e: Event): void {}
  onClick(_e: Event): void {}
  onKey(_e: Event): void {}
  onChange(_e: Event): void {}
  onSubmit(_e: Event): void {}
  onUnknown(_e: Event): void {}
  onBoth(_e: Event): void {}
  onRow(_e: Event, _hit: EventHit): void {}
}
define("x-untyped", Untyped);

export class NoParameters extends Component(tpl) {
  onValue(): void {}
  onClick(): void {}
  onKey(): void {}
  onChange(): void {}
  onSubmit(): void {}
  onUnknown(): void {}
  onBoth(): void {}
  onRow(): void {}
}
define("x-no-parameters", NoParameters);

class Other extends Component(
  template<{ refs: Record<never, never>; lists: Record<never, never>; ifs: never; slots: never; rootElement: never; text: never; events: Record<never, never> }>([]),
  { emits: { x: event<{ n: number }>() } },
) {}

// Each override below compiles, because TypeScript compares method parameters bivariantly; define() still rejects it.
class WrongChild extends Untyped {
  override onValue(_e: EmitEvent<Other, "x">): void {}
}
// @ts-expect-error wrongHandlerParameters: onValue receives the value-change event of <x-child>, not another component's event
define("x-wrong-child", WrongChild);

class WrongNative extends Untyped {
  override onClick(_e: KeyboardEvent): void {}
}
// @ts-expect-error wrongHandlerParameters: onClick is bound to click, which is a MouseEvent
define("x-wrong-native", WrongNative);

class Narrower extends Untyped {
  override onChange(_e: InputEvent): void {}
}
// @ts-expect-error wrongHandlerParameters: the change event is typed Event, so InputEvent is narrower than what the handler receives
define("x-narrower", Narrower);

class OneOfTwo extends Untyped {
  override onBoth(_e: MouseEvent): void {}
}
// @ts-expect-error wrongHandlerParameters: onBoth is bound to click on <button> and closed on <x-child>, and MouseEvent does not accept the second
define("x-one-of-two", OneOfTwo);

class WrongInList extends Untyped {
  override onRow(_e: KeyboardEvent, _hit: EventHit): void {}
}
// @ts-expect-error wrongHandlerParameters: an item's handler is checked too
define("x-wrong-in-list", WrongInList);

// A component whose template uses its own tag: the event type is resolved at define(), after the class is complete.
class WrongTree extends Component(treeTpl) {
  onToggle(_e: KeyboardEvent): void {}
  onClick(): void {}
}
// @ts-expect-error wrongHandlerParameters: onToggle receives the tree-toggle event of <x-tree>
define("x-wrong-tree", WrongTree);
