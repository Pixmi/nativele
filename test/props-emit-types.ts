// Compile-only type matrix for props / emits (checked by `tsc`, not run by vitest).
// Every @ts-expect-error below MUST be a real type error; every line without one MUST compile.
import { Component, define, event } from "nativele";
import type { EmitEvent } from "nativele";
import { FieldChild } from "./compose/child.ts";
import tpl from "./compose/child.html.js";

declare const child: FieldChild;
declare const el: HTMLElement;
type IsNever<T> = [T] extends [never] ? true : false;
const yes = <T extends true>(): T | undefined => undefined;

// ---- props: the type comes from the default value --------------------------------------------
child.label = "x"; // string
child.maxLength = 3; // number
child.disabled = true; // boolean
child.items = ["a"]; // string[] (declared with `as string[]`)
// @ts-expect-error label is a string
child.label = 1;
// @ts-expect-error maxLength is a number
child.maxLength = "3";
// @ts-expect-error disabled is a boolean
child.disabled = "yes";
// @ts-expect-error items is a string[]
child.items = [1];
// @ts-expect-error unknown prop
child.nope = 1;
// @ts-expect-error props is read-only as a whole
child.props = { label: "", value: "", error: "", maxLength: 1, disabled: false, items: [] };
// @ts-expect-error a single field of props is read-only
child.props.label = "x";
const label: string = child.props.label;
const max: number = child.props.maxLength;
void [label, max];

// ---- state is separate from props ------------------------------------------------------------
child.set({ dirty: true });
// @ts-expect-error dirty is a boolean
child.set({ dirty: "x" });
// @ts-expect-error a prop is not part of state
child.set({ label: "x" });
// @ts-expect-error unknown field
child.set({ nope: 1 });
child.set((s) => ({ dirty: !s.dirty }));
// @ts-expect-error the updater must return state fields only
child.set(() => ({ label: "x" }));
const dirty: boolean = child.state.dirty;
void dirty;
// @ts-expect-error props are not on state
void child.state.label;

// ---- emit: name and detail are checked --------------------------------------------------------
child.emit("value-change", { value: "x" });
child.emit("closed"); // declared with event() (no detail): the detail is optional
child.emit("ping");
// @ts-expect-error not declared in emits
child.emit("nope");
// @ts-expect-error a native event name cannot be emitted (it is not declared either)
child.emit("click");
// @ts-expect-error the detail is required
child.emit("value-change");
// @ts-expect-error wrong detail type
child.emit("value-change", { value: 1 });
// @ts-expect-error extra field in the detail
child.emit("value-change", { value: "x", extra: 1 });
// @ts-expect-error an event without detail does not take one
child.emit("ping", { value: "x" });

// ---- EmitEvent: the event type a parent handler casts to --------------------------------------
declare const e: EmitEvent<FieldChild, "value-change">;
const v: string = e.detail.value;
// @ts-expect-error wrong detail type
const n: number = e.detail.value;
void [v, n];
yes<IsNever<EmitEvent<FieldChild, "not-declared">>>(); // an undeclared event is `never`
// An HTMLElement that is not a nativele component has no emitted events
yes<IsNever<EmitEvent<HTMLElement, "value-change">>>();
void el;

// ---- derive sees props AND state, and render's view has everything ----------------------------
export class Both extends Component(tpl, {
  props: { label: "", value: "", error: "", maxLength: 10 },
  state: { dirty: false },
  derive: {
    summary: (s) => `${s.label}:${s.maxLength}:${s.dirty}`, // props and state are both visible
    // @ts-expect-error derive cannot see names that do not exist
    bad: (s) => s.nope,
  },
  emits: { "value-change": event<{ value: string }>() },
}) {}

export class RenderView extends Component(tpl, {
  props: { label: "", value: "", error: "", maxLength: 10 },
  state: { dirty: false },
  derive: { summary: (s) => `${s.label}:${s.dirty}` },
  emits: { "value-change": event<{ value: string }>() },
}) {
  override render(view: { label: string; dirty: boolean; summary: string; maxLength: number }, changed: ReadonlySet<string>): void {
    const s: string = view.summary + view.label;
    const b: boolean = view.dirty;
    const n: number = view.maxLength;
    void [s, b, n, changed];
  }
}

// ---- the problems reported in the type of `extends Component(...)` ---------------------------
// (each one is also thrown at runtime; see test/compose.test.ts)
// @ts-expect-error missingStateKeys: the HTML uses label/error/dirty but only value is declared
export class Missing extends Component(tpl, { props: { value: "" } }) {}
// @ts-expect-error conflictingKeys: label is both state and prop
export class Conflict extends Component(tpl, { props: { label: "", error: "" }, state: { label: "", dirty: false } }) {}
// @ts-expect-error reservedPropNames: `title` is an HTMLElement member
export class Reserved extends Component(tpl, { props: { title: "", label: "", error: "" }, state: { dirty: false } }) {}
// @ts-expect-error nativeEventNames: `change` is a native event
export class Native extends Component(tpl, { props: { label: "", error: "" }, state: { dirty: false }, emits: { change: event() } }) {}

// ---- define() verifies the handlers named in the HTML -----------------------------------------
define("x-ok", FieldChild);
class NoHandler extends Component(tpl, {
  props: { label: "", value: "", error: "" },
  state: { dirty: false },
}) {}
// @ts-expect-error missingHandlers: the HTML refers to onInput but the class does not have it
define("x-no-handler", NoHandler);
