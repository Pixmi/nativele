// Compile-only: the event names lint treats as native are exactly those the element event maps of lib.dom declare (checked by `tsc`, not run by vitest).
import type { NATIVE_EVENT_NAMES } from "../src/lib/lint.ts";

// test/third-party-types.ts adds vendor-change to the maps of this program.
type Declared = Exclude<keyof HTMLElementEventMap | keyof HTMLMediaElementEventMap | keyof HTMLVideoElementEventMap | keyof HTMLBodyElementEventMap | keyof HTMLFrameSetElementEventMap | keyof SVGElementEventMap | keyof SVGSVGElementEventMap | keyof MathMLElementEventMap, "vendor-change">;
type Listed = (typeof NATIVE_EVENT_NAMES)[number];

export const missing: [Exclude<Declared, Listed>] extends [never] ? true : Exclude<Declared, Listed> = true;
export const extra: [Exclude<Listed, Declared>] extends [never] ? true : Exclude<Listed, Declared> = true;
