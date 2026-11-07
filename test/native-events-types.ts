// Compile-only: the event names the runtime and lint treat as native are exactly those lib.dom declares (checked by `tsc`, not run by vitest).
import type { ELEMENT_EVENT_NAMES } from "../src/lib/events.ts";
import type { TAG_EVENT_NAMES } from "../src/lib/lint.ts";

// test/third-party-types.ts and test/any-types.ts add events to the maps of this program.
type Element = Exclude<keyof HTMLElementEventMap, "vendor-change" | "mapped-any" | "mapped-detail">;
type Declared = Exclude<keyof HTMLElementEventMap | keyof HTMLMediaElementEventMap | keyof HTMLVideoElementEventMap | keyof HTMLBodyElementEventMap | keyof HTMLFrameSetElementEventMap | keyof SVGElementEventMap | keyof SVGSVGElementEventMap | keyof MathMLElementEventMap, "vendor-change" | "mapped-any" | "mapped-detail">;
type ElementListed = (typeof ELEMENT_EVENT_NAMES)[number];
type Listed = ElementListed | (typeof TAG_EVENT_NAMES)[keyof typeof TAG_EVENT_NAMES][number];

export const elementMissing: [Exclude<Element, ElementListed>] extends [never] ? true : Exclude<Element, ElementListed> = true;
export const elementExtra: [Exclude<ElementListed, Element>] extends [never] ? true : Exclude<ElementListed, Element> = true;
export const missing: [Exclude<Declared, Listed>] extends [never] ? true : Exclude<Declared, Listed> = true;
export const extra: [Exclude<Listed, Declared>] extends [never] ? true : Exclude<Listed, Declared> = true;

// Per tag, TAG_EVENT_NAMES lists what the element's on* properties (where EventOf reads an event from) add to those of every element of its namespace.
type OnNames<T> = { [P in keyof T]-?: P extends `on${infer N}` ? (NonNullable<T[P]> extends (this: never, ev: never) => unknown ? N : never) : never }[keyof T];
type TagListed<K> = K extends keyof typeof TAG_EVENT_NAMES ? (typeof TAG_EVENT_NAMES)[K][number] : never;
type Wrong<M, Base> = { [K in Exclude<keyof M, `${string}-${string}`>]: [Exclude<OnNames<M[K]>, OnNames<Base>>] extends [TagListed<K>] ? ([TagListed<K>] extends [Exclude<OnNames<M[K]>, OnNames<Base>>] ? never : K) : K }[Exclude<keyof M, `${string}-${string}`>];

export const htmlTags: [Wrong<HTMLElementTagNameMap, HTMLElement>] extends [never] ? true : Wrong<HTMLElementTagNameMap, HTMLElement> = true;
export const svgTags: [Wrong<Omit<SVGElementTagNameMap, keyof HTMLElementTagNameMap>, SVGElement>] extends [never] ? true : Wrong<Omit<SVGElementTagNameMap, keyof HTMLElementTagNameMap>, SVGElement> = true;
export const mathTags: [Wrong<MathMLElementTagNameMap, MathMLElement>] extends [never] ? true : Wrong<MathMLElementTagNameMap, MathMLElement> = true;
