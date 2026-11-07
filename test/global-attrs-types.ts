// Compile-only: the attributes lint never reads as props hold every attribute HTMLElement reflects in lib.dom (checked by `tsc`, not run by vitest).
import type { GLOBAL_ATTRIBUTES } from "../src/lib/lint.ts";

type IfEqual<X, Y, A, B> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B;
type Writable<T> = { [P in keyof T]-?: IfEqual<{ [Q in P]: T[P] }, { -readonly [Q in P]: T[P] }, P, never> }[keyof T];
type Settable<T> = { [P in Writable<T>]: P extends `on${string}` | `aria${string}` ? never : T[P] extends (...args: never[]) => unknown ? never : P }[Writable<T>];
// The writable properties that reflect no attribute, and className, which reflects class.
type NotReflected = "classList" | "className" | "innerHTML" | "innerText" | "nodeValue" | "outerHTML" | "outerText" | "scrollLeft" | "scrollTop" | "textContent";
type Reflected = Lowercase<Exclude<Settable<HTMLElement>, NotReflected>> | "class";

export const missing: [Exclude<Reflected, (typeof GLOBAL_ATTRIBUTES)[number]>] extends [never] ? true : Exclude<Reflected, (typeof GLOBAL_ATTRIBUTES)[number]> = true;
