// Compile-only: `any` in a component's own contract is a tsc error, `anyInContract`, that names where it is (checked by `tsc`, not run by vitest).
// Every @ts-expect-error below MUST be a real type error; every line without one MUST compile.
import { Component, define, event } from "@nativele/ts-dom";
import type { Template } from "@nativele/ts-dom";
import tpl from "./compose/child.html.js";

declare const loose: any;
declare const parsed: ReturnType<typeof JSON.parse>;
const base = { label: "", value: "", error: "", maxLength: 10 };
const yes = <T extends true>(): T | undefined => undefined;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// `unknown` is a declared type, to be narrowed where it is read: no error.
export class Unknowns extends Component(tpl, {
  props: { ...base, extra: undefined as unknown },
  state: { dirty: false, rows: [] as unknown[], cache: {} as Record<string, unknown> },
  derive: { first: (s) => s.rows[0] },
  emits: { pick: event<unknown>() },
}) {
  onInput(_e: unknown): void {}
}
define("x-unknowns", Unknowns);

type ErrorOf<C> = C extends { anyInContract: infer A } ? A : never;

// @ts-expect-error anyInContract: "props.item"
export class AnyProp extends Component(tpl, { props: { ...base, item: loose as any }, state: { dirty: false } }) {}
// @ts-expect-error anyInContract: "state.data", inferred from JSON.parse
export class InferredState extends Component(tpl, { props: base, state: { dirty: false, data: parsed } }) {}
// @ts-expect-error anyInContract: "state.rows[]" | "state.user.name" | "state.pair[1]"
export class Nested extends Component(tpl, { props: base, state: { dirty: false, rows: [] as any[], user: { name: loose }, pair: [1, loose] as [number, any] } }) {}
// @ts-expect-error anyInContract: "derive.total"
export class AnyDerive extends Component(tpl, { props: base, state: { dirty: false }, derive: { total: (s) => s.maxLength as any } }) {}
// @ts-expect-error anyInContract: "emits.pick"
export class AnyDetail extends Component(tpl, { props: base, state: { dirty: false }, emits: { pick: event<any>() } }) {}
// @ts-expect-error anyInContract: "state", and no other error: a whole option typed any has every name
export class WholeState extends Component(tpl, { props: base, state: loose }) {}

// Types the component holds but does not declare are not looked into: elements, events, Window, Storage, functions, Promise.
export class Foreign extends Component(tpl, {
  props: { ...base, host: null as HTMLElement | null },
  state: { dirty: false, form: null as HTMLFormElement | null, ev: null as CustomEvent | null, win: null as Window | null, store: null as Storage | null, pending: null as Promise<any> | null, done: (_x: any) => {} },
}) {}
type Tree = { name: string; kids: Tree[] };
type Loose = { kids: Loose[]; meta: any; parent: Loose | null };
// A recursive type is looked into once; a path names a key that is not an identifier in brackets, and any value under an index signature or in a Map as [key].
const paths = Component(tpl, {
  props: base,
  state: { dirty: false, tree: { name: "", kids: [] } as Tree, loose: {} as Loose, deep: { a: { b: { c: { d: loose } } } }, cache: {} as Record<string, any>, byId: new Map<string, any>(), tags: new Set<any>(), "a.b": loose, 'q"x': loose },
  emits: { "card-picked": event<any>(), ok: event<{ id: any }>() },
});
yes<Same<ErrorOf<typeof paths>, "state.loose.meta" | "state.deep.a.b.c.d" | "state.cache[key]" | "state.byId[key]" | "state.tags[]" | 'state["a.b"]' | 'state["q\\"x"]' | 'emits["card-picked"]' | "emits.ok.id">>();

declare const anyTemplate: Template<any>;
declare const untyped: Template;
// @ts-expect-error anyInContract: "template"
export class AnyTemplate extends Component(anyTemplate) {}
// @ts-expect-error anyInContract: "template"
export class AnyTemplateData extends Component(anyTemplate, { state: { dirty: false } }) {}
// @ts-expect-error anyInContract: "template"
export class LooseTemplate extends Component(loose, { state: { dirty: false } }) {}
yes<Same<ErrorOf<ReturnType<typeof Component<any>>>, "template">>();
const bare = Component(untyped, { state: { dirty: false } });
yes<Same<ErrorOf<typeof bare>, "template">>();

const wrong = Component(tpl, { props: { ...base, item: loose as any }, state: { dirty: false } });
yes<Same<ErrorOf<typeof wrong>, "props.item">>();
const nested = Component(tpl, { props: base, state: { dirty: false, rows: [] as any[], user: { name: loose } } });
yes<Same<ErrorOf<typeof nested>, "state.rows[]" | "state.user.name">>();
const whole = Component(tpl, { props: base, state: loose });
yes<Same<typeof whole, { anyInContract: "state" } & { template: "compose/child.html" }>>();
// An option whose type is an error is reported by tsc where the error is, not as any in the contract.
// @ts-expect-error the name does not exist
const broken = Component(tpl, { props: base, state: { dirty: false }, derive: { bad: (s) => s.nope } });
void broken;

class AnyHandler extends Component(tpl, { props: base, state: { dirty: false } }) {
  onInput(_e: any): void {}
}
// @ts-expect-error anyInContract: "this.onInput(event)"
define("x-any-handler", AnyHandler);

class RestHandler extends Component(tpl, { props: base, state: { dirty: false } }) {
  onInput(..._args: any[]): void {}
}
// @ts-expect-error anyInContract: "this.onInput(event)"
define("x-rest-handler", RestHandler);

class AnyMethod extends Component(tpl, { props: base, state: { dirty: false } }) {
  onInput: any = () => {};
}
// @ts-expect-error anyInContract: "this.onInput"
define("x-any-method", AnyMethod);

class NoParameter extends Component(tpl, { props: base, state: { dirty: false } }) {
  onInput(): void {}
}
define("x-no-parameter", NoParameter);

yes<Same<ErrorOf<Parameters<typeof define<typeof AnyMethod>>[1]>, "this.onInput">>();
yes<Same<ErrorOf<Parameters<typeof define<typeof AnyHandler>>[1]>, "this.onInput(event)">>();
