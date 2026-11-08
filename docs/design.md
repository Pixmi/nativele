# Design

Part of the [Nativele](../README.md) documentation.

## Design Principles

Nativele is a small, reliable UI layer for large applications, not a framework that does everything. These principles decide how a component is meant to be written. The trade-offs they lead to are listed under [Design Decisions](#design-decisions).

### HTML describes, TypeScript decides

- **Structure lives in the template.** A component's elements, their nesting and where data lands are written in its `.html`. TypeScript that builds the same structure with `createElement` or string assembly hides it from codegen, `tsc` and lint.
- **The template holds names, not logic.** HTML names holes, `data-if` blocks, lists, refs and handlers; a computed value is computed in TypeScript (`derive`, `render`) and lands in a named hole.
- **Behavior and state live in TypeScript.** Handlers are methods named by `data-on-*`; the state, props and derived values that the template's names bind to are declared and changed in TypeScript.

### The browser is the runtime

- **The DOM is the view.** There is no virtual tree to keep in sync: what the page shows is what the DOM holds. Holes, `data-if` and lists update it from the data; `render` reaches the rest through `refs`.
- **Native over invented.** Custom Elements give the lifecycle, Shadow DOM gives native slots, forms give `FormData` and validity, `<dialog>` gives modality. A component that rebuilds one of these in code carries a second, weaker copy of it.
- **Updates are explicit and local.** Each update changes what changed: a hole skips an unchanged value, a list keeps the elements of the keys that stay, and `render` guards its writes with `changed`.

### Data flows one way, one layer at a time

- **State is the component's own; props are the parent's.** A component changes its state with `set`, never its props, and tells its parent with `emit`.
- **Crossing layers is explicit.** An event is handled where it is caught, and data several layers away goes through a shared `createStore` bound where it is used, not passed down or re-emitted through every layer.

### Small surface, checked by tools

- **Every tool owns one layer.** The formatter owns markup structure, `ts-dom gen` the template rules, `tsc` names and types (codegen derives them from the HTML), lint usage and data flow, `ts-dom doctor` the project set-up. A rule is checked once, in its layer.
- **No abstraction for convenience.** The library adds no syntax or implicit behavior to save lines; convenience comes from better checks, messages, docs and Skills. The same holds for the code built on it: a layer that only forwards to the next one adds a place to read without adding a decision.
- **Few dependencies, no runtime parsing.** The runtime has no dependencies and never parses HTML strings, so it runs under Trusted Types and without a bundler.

### Integrations stay at the edge

- **Nativele does not own the app.** Routing, global state, data fetching, validation, styling and testing belong to mature tools; Nativele components plug into them through props, events, stores and refs.
- **A framework keeps its own children.** Children a framework renders go into `shadow: true` components; Light DOM slots take only content written in HTML.

## Compared with Vue templates

| Vue | ts-dom | Difference |
|---|---|---|
| `{{ expr }}` | `{{ name }}` | Must be a single identifier, not a path or an operation |
| `v-if` | `data-if="name"` | Bound to the state, prop or derived value of that name, or decided by TS calling `show(name, bool)` |
| `v-for` | `<template data-each="name">` | The list is updated by TS assigning `items` or calling `replace` |
| `<slot>` | `<slot name>` | In Light mode the library places the content written in HTML; with `shadow: true` it uses native slots |
| `<style scoped>` | `<style scoped>` | Implemented with native `@scope`; without `scoped` it is global |
| `<template>` | The HTML file itself | One `.html` file is one component template |

## Design Decisions

These are deliberate trade-offs, not missing features:

- **`{{ }}` is only a single identifier**: paths and expressions would give the HTML a second data shape and slide toward a template language. If you need computation, do it in TS and fill a named hole.
- **No attribute binding**: get the element with `data-ref`, then set the attribute in TS.
- **`<slot>` cannot be placed inside a `data-each` item**: items repeat, but user-provided content exists only once, and in native Shadow DOM only the first slot of a given name gets the content. Fill the item in with TS in the `update` callback instead, or make the item content another component.
- **Light DOM slots take only content written in HTML**: the children an element has when it is built, and what a Nativele list or `data-if` of the parent's template puts in later. A node that a framework or other code adds afterwards stays where it was put. Light DOM has no "child present but not rendered" state, so placing such a node would mean moving a node its owner still manages. Children a framework renders belong in a `shadow: true` component, whose slots the browser assigns; content from TypeScript goes into an element the component exposes through a ref.
- **No scoped slots**: giving each item its own slot content would need a mechanism like a Vue scoped slot that passes the item data to the slot, which requires expressions.
- **The data flow goes in only one direction**: state is changed by itself, props are changed by the parent, events go up; `emit` does not bubble by default, and to cross layers you handle it explicitly or use a shared store; there is no implicit cross-layer passing.
- **One entry point for data, one place for the view** (`set` and `render`): "how data becomes the view" is concentrated in `render`, and to trace data changes you only need to look at the calls to `set`.
- **Synchronous rendering, no implicit asynchronous batching**: reading the DOM right after `set` always gives the new state, and tests need no waiting; to combine updates, use `batch` explicitly.
- **No fine-grained reactive system**: `derive` is recomputed every time and `render` re-runs as a whole every time, in exchange for predictable behavior and no dependency-tracking magic.
- **`data-if` is hidden by default**: state lives only in TS, and nothing is shown unless it says so.
- **`data-if` cannot be on an item root element and `data-each` cannot be nested**: removing the root element would make the list lose its ordering anchor, and one template then holds exactly one level of list. A nested list is a second template (a child component), which keeps each template's `refs`, `text` and event handling in a single scope.

## Limitations

- When running directly in the browser (no bundler), you must provide an import map for `@nativele/ts-dom` yourself, and relative imports must use the `.js` extension (the NodeNext convention).
- Version 0.x, and the API may still change; see [CHANGELOG.md](../CHANGELOG.md) for the versioning policy.
- No SSR or hydration.
- The unused-markup lint compares against the class body text, and is looser for names inside list items (it only looks at identifiers).
- `<style scoped>` falls back to CSS nesting in browsers that do not support `@scope`, which requires browser support for nesting (mainstream since 2023).
- ARIA checks cover only common items in static HTML and are not a complete accessibility audit.
- Browser tests are based on Chromium; Firefox 157 passed manual verification, and WebKit (Safari) is not verified.
