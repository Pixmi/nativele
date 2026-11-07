// Compile-only: the first parameter of a data-on-* handler is checked against the event the template binds it to (checked by `tsc`, not run by vitest).
// Every @ts-expect-error below MUST be a real type error; every line without one MUST compile.
import { Component, define, event, template } from "@nativele/ts-dom";
import type { EmitEvent, EventHit } from "@nativele/ts-dom";
import type { FieldChild } from "./compose/child.ts";
import tpl from "./typed/handlers.html.js";
import treeTpl from "./typed/tree.html.js";
import eventsTpl from "./typed/events.html.js";
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
  onFocusOut(e: FocusEvent): void {
    void e.relatedTarget;
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
  onFocusOut(_e: Event): void {}
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
  onFocusOut(): void {}
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

// HTMLFormElement's [name: string] index signature declares no on<name> property: focusout keeps its HTMLElementEventMap type.
class WrongFocus extends Untyped {
  override onFocusOut(_e: KeyboardEvent): void {}
}
// @ts-expect-error wrongHandlerParameters: onFocusOut is bound to focusout on <form>, which is a FocusEvent
define("x-wrong-focus", WrongFocus);

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

// The event of a name comes from the first source that declares it: the child's emits, the element's on<name> property, then HTMLElementEventMap; a name none declares is not checked.
export class Sources extends Component(eventsTpl) {
  onPip(e: PictureInPictureEvent): void {
    void e.pictureInPictureWindow;
  }
  onClosed(e: EmitEvent<FieldChild, "closed">): void {
    void e.detail;
  }
  onChange(_e: Event): void {}
  override connected(): void {
    this.on(this.refs.video, "enterpictureinpicture", (e: PictureInPictureEvent) => void e.pictureInPictureWindow);
    this.on(this.refs.video, "enterpictureinpicture", (e) => void e.type);
    this.on(this.refs.field, "keydown", (e) => void e.key);
    this.on(this.refs.form, "vendor-ready", (e: CustomEvent<{ id: number }>) => void e.detail.id);
    this.on(window, "resize", (e: UIEvent) => void e.detail);
    this.on(this.refs.field, "vendor-ready", (e: CustomEvent<{ id: number }>) => void e.detail.id);
    this.on(this.refs.field, "vendor-ready", (e) => void e.type);
    this.on(this, "click", (e) => void e.clientX);
    this.on(this, "vendor-ready", (e) => void e.type);
    this.on(document, "keydown", (e: KeyboardEvent) => void e.key);
    // @ts-expect-error a declared emit rejects another detail
    this.on(this.refs.child, "closed", (e: CustomEvent<{ id: number }>) => void e.detail.id);
    this.on(this.refs.child, "closed", (e: EmitEvent<FieldChild, "closed">) => void e.detail);
    // @ts-expect-error the change event is typed Event, so on() rejects a narrower parameter too
    this.on(this.refs.field, "change", (e: InputEvent) => void e.data);
    // @ts-expect-error on() types a known event: keydown is a KeyboardEvent
    this.on(this.refs.field, "keydown", (e: MouseEvent) => void e.button);
  }
}
define("x-sources", Sources);

class LooseSources extends Component(eventsTpl) {
  onPip(_e: Event): void {}
  onClosed(_e: Event): void {}
  onChange(_e: Event): void {}
}
define("x-loose-sources", LooseSources);

class WrongPip extends LooseSources {
  override onPip(_e: KeyboardEvent): void {}
}
// @ts-expect-error wrongHandlerParameters: <video> declares enterpictureinpicture as a PictureInPictureEvent
define("x-wrong-pip", WrongPip);

class OtherBubbling extends LooseSources {
  override onClosed(_e: EmitEvent<FieldChild, "value-change">): void {}
}
// A wrapper <div> declares no closed event, so the handler is not checked there.
define("x-other-bubbling", OtherBubbling);
