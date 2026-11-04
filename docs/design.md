# Design

Part of the [Nativele](../README.md) documentation.

## Design Principles

- HTML is the single source of structure.
- TypeScript is the single source of behavior and state.
- The DOM is the single source of truth for the UI; there is no virtual tree.
- Updates are explicit, local DOM operations; there is no whole-tree diff.
- Component lifecycle reuses Custom Elements.
- State subscriptions exist only where you call `bind`.
- There is no template language: HTML contains only **names**, never expressions.
- Type safety: names are derived by codegen, and tsc and lint can check that the HTML and TS match.

Comparison with Vue templates:

| Vue | ts-dom | Difference |
|---|---|---|
| `{{ expr }}` | `{{ name }}` | Must be a single identifier, not a path or an operation |
| `v-if` | `data-if="name"` | The condition is decided by TS calling `show(name, bool)` |
| `v-for` | `<template data-each="name">` | The list is updated by TS calling methods such as `replace` |
| `<slot>` | `<slot name>` | In Light mode the library moves the content; with `shadow: true` it uses native slots |
| `<style scoped>` | `<style scoped>` | Implemented with native `@scope`; without `scoped` it is global |
| `<template>` | The HTML file itself | One `.html` file is one component template |

## Design Decisions

These are deliberate trade-offs, not missing features:

- **`{{ }}` is only a single identifier**: paths and expressions would give the HTML a second data shape and slide toward a template language. If you need computation, do it in TS and fill a named hole.
- **No attribute binding**: get the element with `data-ref`, then set the attribute in TS.
- **`<slot>` cannot be placed inside a `data-each` item**: items repeat, but user-provided content exists only once, and the semantics of native Shadow DOM are also that only the first slot of a given name gets the content. To give each item its own content, you would need a mechanism like a Vue scoped slot that "passes the item data to the slot", which would require expressions. Fill it in with TS in the `update` callback instead, or make the item content another component.
- **The data flow goes in only one direction**: state is changed by itself, props are changed by the parent, events go up; `emit` does not bubble by default, and to cross layers you handle it explicitly or use a shared store; there is no implicit cross-layer passing.
- **One entry point for data, one place for the view** (`set` and `render`): "how data becomes the view" is concentrated in `render`, and to trace data changes you only need to look at the calls to `set`.
- **Synchronous rendering, no implicit asynchronous batching**: reading the DOM right after `set` always gives the new state, and tests need no waiting; to combine updates, use `batch` explicitly.
- **No fine-grained reactive system**: `derive` is recomputed every time and `render` re-runs as a whole every time, in exchange for predictable behavior and no dependency-tracking magic.
- **`data-if` is hidden by default**: state lives only in TS, and nothing is shown unless it says so.
- **`data-if` cannot be on an item root element and `data-each` cannot be nested**: removing the root element would make the list lose its ordering anchor, and one template then holds exactly one level of list. A nested list is a second template (a child component), which keeps each template's `refs`, `text` and event handling in a single scope.

## Limitations

- When running directly in the browser (no bundler), you must provide an import map for `ts-dom` yourself, and relative imports must use the `.js` extension (the NodeNext convention).
- Event names for `data-on-*` must be lowercase; non-bubbling events handle only the target itself.
- Automatic import and tag types of child components scan only the directories given to `gen`; third-party components or those outside the directories must be imported by you, and you must declare `HTMLElementTagNameMap` yourself. A class passed to `define` without `export` gets no tag type.
- The `CustomEvent` received by an event handler method must be cast with `EmitEvent<child component, "event name">`, because HTML attributes cannot carry types.
- `props` can be passed through HTML attributes only when the default value is a string / number / boolean.
- Automatic binding covers only text holes and `data-if`; lists and attributes must be written in `render`.
- Version 0.x, and the API may still change (for example, the `Update` callback signature has changed twice); see [CHANGELOG.md](../CHANGELOG.md) for the versioning policy.
- No SSR or hydration.
- No attribute binding (deliberately; use `refs`).
- The unused-markup lint compares against the class body text, and is looser for names inside list items (it only looks at identifiers).
- `<style scoped>` falls back to CSS nesting in browsers that do not support `@scope`, which requires browser support for nesting (mainstream since 2023).
- ARIA checks cover only common items in static HTML (see the list above) and are not a complete accessibility audit.
- Browser tests are based on Chromium; Firefox 157 passed manual verification, and WebKit (Safari) is not verified.
