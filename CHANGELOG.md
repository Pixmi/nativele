# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning is described below.

## Versioning policy

- Version `0.x`: the API is still evolving. **A minor version (0.Y.0) may contain breaking changes**; a patch version (0.Y.Z) only fixes bugs and documentation.
- From `1.0.0` on, [SemVer](https://semver.org/) applies: breaking changes only in major versions.
- Public API: the exports of `ts-dom`, `@nativele/ts-dom/vite` and `@nativele/ts-dom/oxlint`; the commands and flags of the `ts-dom` CLI; the `data-*` and `{{ }}` syntax of templates; rule ids (`ts-dom/unused-markup`, `ts-dom/a11y`, `ts-dom/data-flow` and their `ignore` ids).
- Adding a lint rule is a minor change; lint rules are warnings or opt-in and do not count as breaking.
- Before every release run `npm run verify:pack` (`publint` and `attw`), `tsc`, the unit tests, the browser tests, `npm run smoke` and `npm run smoke:no-bundler`; all of them run in `.github/workflows/ci.yml`.

## Unreleased

- The Vite plugin regenerates a template when it changes while the dev server runs and reloads the page once with the new markup. Before, the regeneration never ran under Vite+ (it reports changed files by relative path), so editing a template left the old one in the page.
- The accessibility messages say "natively" again where a rename had turned it into "ts-domy".
- `<template data-each data-key="id" data-prop="todo">` with one custom element as the item, and `this.lists.todos.items = todos`: items are components that receive each item as a property, matched by key. New rules `each-binding-incomplete`, `invalid-each-binding` and `each-binding-root`. `tsc` checks the assigned items against the item component's property type and the `data-key` field. The accessibility check `list-structure` accepts a custom element with `role="listitem"` as a list item. `replace()` stays for lists of plain elements. `data-each` still cannot be nested.

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
