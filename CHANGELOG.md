# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning is described below.

## Versioning policy

- Version `0.x`: the API is still evolving. **A minor version (0.Y.0) may contain breaking changes**; a patch version (0.Y.Z) only fixes bugs and documentation.
- From `1.0.0` on, [SemVer](https://semver.org/) applies: breaking changes only in major versions.
- Public API: the exports of `ts-dom`, `@nativele/ts-dom/vite` and `@nativele/ts-dom/oxlint`; the commands and flags of the `ts-dom` CLI; the `data-*` and `{{ }}` syntax of templates; rule ids (`ts-dom/unused-markup`, `ts-dom/a11y`, `ts-dom/data-flow` and their `ignore` ids).
- Adding a lint rule is a minor change; lint rules are warnings or opt-in and do not count as breaking.
- Before every release run `npm run verify:pack` (`publint` and `attw`), `tsc`, the unit tests, the browser tests, `npm run smoke` and `npm run smoke:no-bundler`; all of them run in `.github/workflows/ci.yml`.

## 0.4.3

Not published on its own; it ships with the last 0.4.x version.

- `ts-dom check [dirs...]` runs everything in one pass for agents and CI: template diagnostics, generated files (regenerated, or reported as stale with `--no-write`), the project's own `tsc` (TypeScript 5, 6 or 7), and the lint rules (`--a11y` adds accessibility). TypeScript errors from the template contract point at the template line and column (`missing-binding`, `missing-handler`), item component problems get their own rule ids, and errors that only follow from a broken class are left out. `--json` prints the issues as data; `--strict` fails on warnings.
- The README, the rules for AI agents and `llms.txt` use `ts-dom check` as the command to run after a change.

## 0.4.2

Not published on its own; it ships with the last 0.4.x version.

- `ts-dom gen --check` writes nothing and lists generated files that are missing, outdated or orphaned (a deleted template), with exit code 1 if there are any; `--json` prints them as data. Codegen exposes `renderFile`, `renderTags`, `planGenerated` and `staleGenerated` for tools that need the generated output without writing it.

## 0.4.1

Not published on its own; it ships with the last 0.4.x version.

- `npm run bench` measures lists of 1,000 to 10,000 items in real Chrome (create, update 10%, reverse, remove half, append) for component items, plain elements and a direct DOM baseline; the README's Performance section shows the results and when to choose which.
- Assigning `items` sets the prop of a new item before its element goes into the document, so the item component is connected with its item already set and renders once instead of first rendering without it. `replace()` and `upsert()` keep inserting first.
- README: a fourth example, a list of components (add, remove, sort, toggle, events up from the item), the one-line rule for choosing between `items =` and `replace()`, and how moving an item affects `connected()` and subscriptions with and without `moveBefore`. The introduction and the package description say what the library is built for: type safety and AI coding agents, which can correct their own mistakes from `tsc` errors and the `Fix:` hints of every diagnostic.
- `state`, `props`, the `view` passed to `render` and the argument of `derive` functions are typed `DeepReadonly` (exported, with `PropAccessors`): changing an array or object inside them in place is a `tsc` error, since the list and child props compare by reference and would not update. `set()` accepts read-only values. A parent can still assign a child's props.

### Breaking changes

- Code that annotates `render`'s `view`, or a helper that takes the state, with mutable array types (`Item[]`) must use read-only ones (`readonly Item[]` or `DeepReadonly<State>`), and code that changes state objects in place no longer compiles.

## 0.4.0

### Lists of components

- `<template data-each="todos" data-key="id" data-prop="todo"><todo-row role="listitem"></todo-row></template>` and `this.lists.todos.items = todos`: each item is one component that receives its item as a property, matched by key. An element is kept for a key that stays (moved with `moveBefore`), created for a new key and removed for a key that is gone; reading `items` returns the items in document order.
- `tsc` checks the assigned items against the property type the item component declares and the `data-key` field (a string or a number). An item component defined in a scanned folder must be exported and listed in `ts-dom-tags.ts`, otherwise the assignment is a type error that names the cause; only components from outside the scanned folders get a loose type.
- New codegen rules `each-binding-incomplete`, `invalid-each-binding` and `each-binding-root`, and runtime errors with a `Fix:` hint for what types cannot see (`invalid-items`, `invalid-item`, `missing-key`, `duplicate-key`, `list-not-bound`, `unknown-prop`). A wrong `data-prop` throws before the list changes.
- The accessibility check `list-structure` accepts a custom element with `role="listitem"` as a list item.
- `replace()` stays for lists of plain elements, and `data-each` still cannot be nested: a list inside an item is that component's own list.

### Vite dev server

- Editing a template regenerates its `x.html.ts` and reloads the page once if a page uses it; a save that changes nothing does not reload. This works under Vite and Vite+ (which reports changed files by relative path).
- Deleting a template removes its generated module, and adding or removing a `define()` updates `ts-dom-tags.ts` and the child imports of the templates.
- A generated module rewritten by something else (`ts-dom gen --watch`, a checkout) reloads the page through Vite; duplicate change events and identical rewrites by other dev servers no longer reload it twice.
- `dirs` are resolved against Vite's `root` instead of the working directory. The `define()` scan is cached and redone only when a `.ts` file with a `define()` changes. Messages go to the logger of the server that saw the change.

### Fixes

- The accessibility messages say "natively" again where it had been replaced by "ts-domy".

### Breaking changes

- The Vite plugin's `dirs` are relative to Vite's `root`; a project whose `root` differs from the working directory must adjust them.
- A project whose item component class is not exported, or whose `ts-dom-tags.ts` is stale, now gets a type error on `items`.

## 0.3.0

- `ts-dom gen` rejects `<html>`, `<head>` and `<body>` inside a template (rule `document-tag`) instead of silently dropping them; a file that starts with `<!doctype html>` or `<html>` is still a page entry whatever its name.
- `tpl.instantiate().rootElement` is the template's only top-level element, typed by its tag; the type has it only for a template with exactly one top-level element (generated `x.html.ts` files carry a `rootElement` field, so regenerate them with `ts-dom gen`).
- Non-bubbling events such as media events (`canplay`, `loadeddata`, ...), `close`, `cancel` and `invalid` now reach `data-on-*` handlers; they were listened for in the bubble phase and never fired.

## 0.2.1

- Releases are published through npm Trusted Publishing: the release workflow stages the version without an npm token, and a maintainer approves it on npm. No library code changes.

## 0.2.0

First release.

### Core

- `Component(tpl, options)`: Light DOM by default, `shadow: true` for Shadow DOM (verified in real Chrome, including Shadow/Light mixed composition).
- `state`, `props`, `derive`, `emits` options. `{{ hole }}` and `data-if` bind automatically to same-named state, props and derived values; names are checked by tsc.
- `set(patch | updater)` is the only way to change state (shallow merge, no change means no render). `render(view, changed)` handles what automatic binding cannot do. `batch(fn)` coalesces updates. Rendering is synchronous.
- `props` are owned by the parent and read-only inside the component. They can be set from HTML attributes (converted by the type of the default value, camelCase <-> kebab-case) or JS properties, and a value assigned before the element is upgraded is kept.
- `emits` declares events; `emit(name, detail)` is type checked and does not bubble by default. `EmitEvent<Child, "name">` gives the event type.
- `data-on-<event>="method"`: event delegation to a method `(event, { el, key, item })`; non-bubbling events use the capture phase; only elements of the component's own template are owned; `define()` verifies in the types that the methods exist.
- Lists: `lists.name.replace(items, key, update, { skipUnchanged })`, `upsert`, `remove`, `clear`; per-item `data-if` and `{{ }}`.
- Light DOM `<slot>`: named, default, fallback, dynamic assignment (including a changed `slot` attribute), `slotchange()`, `assignedNodes()`.
- Light DOM `<style>` is injected once per document; `<style scoped>` uses the native `@scope` and falls back to CSS nesting.
- `createStore` (`get` / `set` / `subscribe`), `bind`, `on`, `onCleanup`.
- Trusted Types compatible: the generated `x.html.ts` holds the parsed markup as data and the runtime builds it with `createElement`, `setAttribute` and `createTextNode`, so no HTML string is parsed and pages that enforce `require-trusted-types-for 'script'` work without a policy (verified in real Chrome).
- Components accept atomic moves (`connectedMoveCallback`) and keyed lists reorder with `moveBefore` where available, so a moved item is not disconnected and keeps its focus and subscriptions.
- `tpl.instantiate()` builds a template without a component and returns typed `root`, `refs`, `lists`, `text` and `show`.
- `ts-dom gen` rejects `<script>`, `on*` attributes, `srcdoc` and `javascript:` URLs (rules `forbidden-tag`, `forbidden-attribute`, `unsafe-url`), because they run code or are blocked when Trusted Types is enforced.
- `whitespace: "collapse"` (CLI `--whitespace=collapse`, Vite plugin option) collapses whitespace runs and drops line-break-only text between tags; the default keeps text as written.
- `replace()` throws `[duplicate-key]` for two items with the same key and leaves the list untouched. `EventHit<Item>` types `hit.item` when the handler annotates it. `bind` accepts any source with `get` and `subscribe` (`ReadableStore`).
- `ts-dom gen --include=<glob> --exclude=<glob>` (and the Vite plugin options) generate only the selected templates, for migrating a project in steps.
### Composition

- Child components used in a template are imported automatically by the generated `x.html.ts`; HTML is the only source of dependencies.
- `ts-dom gen` also generates `ts-dom-tags.ts`, which registers every exported `define("tag", Class)` component in `HTMLElementTagNameMap`, so `refs.child` is fully typed. `define()` calls inside strings and comments are ignored.

### Tooling

- No Vite or bundler required: `ts-dom gen` writes `x.html.ts` (a real TypeScript module with the template markup and its types), imported as `./x.html.js`; the compiled JS runs in a browser with an import map. `ts-dom gen --watch` is available.
- `ts-dom` CLI: `gen [--watch]`, `lint [--a11y] [--strict] [--json]`, `rules`.
- `@nativele/ts-dom/vite`: optional plugin (generate, watch, optional a11y warnings).
- Every diagnostic has a stable rule id, an HTML location where possible, and says what is wrong and how to fix it. `ts-dom rules` lists them.
- `@nativele/ts-dom/oxlint` rules: `unused-markup` (errors), `data-flow` (warnings: `prop-forwarding`, `emit-forwarding`, `props-mutation`, `custom-event-on-native`, plus the HTML-level child contract checks `unknown-prop`, `invalid-prop-value`, `unknown-event`), `a11y` (21 rules, opt in).

### Design decisions

- One direction of data flow: state is changed by its owner, props by the parent, events go up. Events do not bubble by default; data needed several levels down belongs in a shared store, not in forwarded props or re-emitted events.
- `{{ }}` accepts a single identifier only; there are no expressions and no attribute bindings.
- `<slot>` is not allowed inside `data-each` (the item repeats, the user content does not); `data-if` is not allowed on a list item root; `data-each` cannot be nested.
- No fine-grained reactivity: `derive` is recomputed and `render` is called as a whole after every change.

### Known limitations

See the "Limitations" section of the README.
