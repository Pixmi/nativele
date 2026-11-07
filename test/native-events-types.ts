// Compile-only: the event names the runtime and lint treat as native are exactly those the element event maps of lib.dom declare (checked by `tsc`, not run by vitest).
import type { ELEMENT_EVENT_NAMES, OTHER_NATIVE_EVENT_NAMES } from "../src/lib/events.ts";

// test/third-party-types.ts adds vendor-change to the maps of this program.
type Element = Exclude<keyof HTMLElementEventMap, "vendor-change">;
type Declared = Exclude<keyof HTMLElementEventMap | keyof HTMLMediaElementEventMap | keyof HTMLVideoElementEventMap | keyof HTMLBodyElementEventMap | keyof HTMLFrameSetElementEventMap | keyof SVGElementEventMap | keyof SVGSVGElementEventMap | keyof MathMLElementEventMap, "vendor-change">;
type ElementListed = (typeof ELEMENT_EVENT_NAMES)[number];
type Listed = ElementListed | (typeof OTHER_NATIVE_EVENT_NAMES)[number];

export const elementMissing: [Exclude<Element, ElementListed>] extends [never] ? true : Exclude<Element, ElementListed> = true;
export const elementExtra: [Exclude<ElementListed, Element>] extends [never] ? true : Exclude<ElementListed, Element> = true;
export const missing: [Exclude<Declared, Listed>] extends [never] ? true : Exclude<Declared, Listed> = true;
export const extra: [Exclude<Listed, Declared>] extends [never] ? true : Exclude<Listed, Declared> = true;
