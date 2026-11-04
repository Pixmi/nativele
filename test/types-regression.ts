// Compile-only regression file (checked by `tsc`, not run by vitest).
// Any option shape below that stops compiling is a typing regression.
import { Component } from "nativele";
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
