---
name: nativele-core
description: "Build and change web components with Nativele (@nativele/ts-dom): the write-check-fix loop, templates, state, lists and data flow. Use whenever a project depends on @nativele/ts-dom and you add or change an .html template or a component."
metadata:
  tier: official
  nativele: ">=0.7.0 <0.8.0"
  verified: "2026-11-06"
  tools: "typescript@7.0.2"
  author: "Nativele maintainers"
  detects: "@nativele/ts-dom"
---

# Nativele core

## When to use

- The project depends on `@nativele/ts-dom` and you write or change a component: an `x.html` template with its `x.ts` class.
- Not for using Nativele components from a framework (React, Vue, ...): see the integration Skills (`npx ts-dom skills`), which build on this one.

A component is two files. The HTML holds structure and names (`{{ name }}`, `data-ref`, `data-if`, `data-each`, `data-on-*`), never expressions; the TypeScript class holds state and behavior. `ts-dom gen` turns each `x.html` into a typed `x.html.ts`, and `tsc` checks that the two files agree.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.7.0 (the last agent trial) |
| typescript | 7.0.2 |

Verified on 2026-11-06 by agent trials: fresh agents built real components with only this Skill, and the results were checked independently. The library's own CI type-checks, lints and runs the examples in the repository in real Chrome.

## Set-up

1. `npm i @nativele/ts-dom` and `npm i -D typescript`.
2. Put the components under `src/`, the folder every `ts-dom` command scans by default; for another folder, pass it to each command (`npx ts-dom check web/ui`).
3. The tsconfig must cover the folders with templates and meet Nativele's few requirements (`strict`, `DOM`, a resolution that finds packages, and `"type": "module"` when `tsc` emits): check and adjust it with the TypeScript Skill (`npx ts-dom skills nativele-typescript`). A complete one for the no-bundler case is in the setup guide: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#installation-and-setup
4. With Vite, add `tsDom()` from `@nativele/ts-dom/vite` to `plugins`, and set up the rest with the Vite Skill (`npx ts-dom skills nativele-vite`): `tsDom()` generates for the dev server and `vite build`, not for a `tsc` that runs before them, so Vite's template script `tsc && vite build` fails on a clean checkout until it generates first. Without a bundler, `ts-dom gen` plus `tsc` compiles the code, and the page needs an import map for `@nativele/ts-dom` plus a `<script type="module">` for the compiled entry, a module that imports the top-level components: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#running-in-the-browser-no-bundler
5. Add `*.html.ts` and `ts-dom-tags.ts` to `.gitignore`: they are generated.
6. Run `npx ts-dom doctor` once; fix every error and warning it reports. Its `info` lines name the other Skills that fit the project.

## Example

A list whose items are components, with a store, a derived value and events from the items:

```html
<!-- src/todo-item.html -->
<input type="checkbox" data-ref="check" data-on-change="onToggle" />
<span>{{ text }}</span>
<button type="button" data-on-click="onRemove">remove</button>
```

```ts
// src/todo-item.ts
import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./todo-item.html.js";
import type { Todo } from "./store.js";

export class TodoItem extends Component(tpl, {
  props: { todo: { id: 0, title: "", done: false } as Todo },
  derive: { text: (v) => v.todo.title },
  emits: { toggled: event(), removed: event() },
}) {
  onToggle(): void {
    this.emit("toggled");
  }
  onRemove(): void {
    this.emit("removed");
  }
  override render(view: { todo: Todo }, changed: ReadonlySet<"todo">): void {
    if (changed.has("todo")) this.refs.check.checked = view.todo.done;
  }
}
define("todo-item", TodoItem);
```

```html
<!-- src/todo-app.html -->
<p data-if="empty">Nothing to do</p>
<ul>
  <template data-each="items" data-key="id" data-prop="todo">
    <todo-item role="listitem" data-on-toggled="toggle" data-on-removed="drop"></todo-item>
  </template>
</ul>
<p>{{ remaining }} left</p>
```

```ts
// src/todo-app.ts
import { Component, define, type EventHit } from "@nativele/ts-dom";
import tpl from "./todo-app.html.js";
import { todos, type Todo } from "./store.js"; // export const todos = createStore<readonly Todo[]>([]);
import "./todo-item.js";

export class TodoApp extends Component(tpl, {
  state: { items: [] as readonly Todo[] },
  derive: {
    remaining: (v) => v.items.filter((t) => !t.done).length,
    empty: (v) => v.items.length === 0,
  },
}) {
  override connected(): void {
    this.bind(todos, (items) => this.set({ items }));
  }
  toggle(_e: Event, hit: EventHit<Todo, "id">): void {
    todos.set((s) => s.map((t) => (t.id === hit.key ? { ...t, done: !t.done } : t)));
  }
  drop(_e: Event, hit: EventHit<Todo, "id">): void {
    todos.set((s) => s.filter((t) => t.id !== hit.key));
  }
  override render(view: { items: readonly Todo[] }, changed: ReadonlySet<"items">): void {
    if (changed.has("items")) this.lists.items.items = view.items;
  }
}
define("todo-app", TodoApp);
```

- A `derive` function gets the state and props merged: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-and-view-state-optional
- Declare each event in `emits` with `event()` or `event<Detail>()`; the parent's handler declares the event it receives, `onX(e: EmitEvent<Child, "name">)`, and reads `e.detail`; `define()` checks that type against the `data-on-*` binding: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-flow-props-down-events-up
- Call `bind` in `connected()`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#state-store-when-not-using-state

## The loop

1. Write the `.html` and the `.ts` of a component together. Import the template as `./x.html.js`.
2. Run `npx ts-dom check` (add `--json` to read the result as data). It regenerates the generated files, runs `tsc`, points template contract errors at the template line and column, and runs the lint rules. Use `--no-write` only where the generated files are committed; CI steps are covered by `npx ts-dom skills nativele-ci`.
3. Fix every issue by its `Fix:` hint. Never cast a type error away, and never edit `x.html.ts` or `ts-dom-tags.ts`: they are generated.
4. `npx ts-dom rules --explain=<id>` explains any rule id from a diagnostic, with a wrong and a right example.
5. Repeat until `ts-dom check` prints `no issues`.

## Rules

- No expressions in HTML: `{{ name }}` is a single identifier; compute in `derive` or TypeScript: https://github.com/Pixmi/nativele/blob/main/docs/templates.md#html-syntax
- Read `this.state.x` and `this.props.x` (in `render`, its `view`); change state only with `this.set()`; `this.batch()` combines updates: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-and-view-state-optional
- With `state`, `props` or `derive`, every `{{ hole }}` and `data-if` outside a list item names one of them; show store data by copying it into state in the `bind` callback: https://github.com/Pixmi/nativele/blob/main/docs/recipes.md#showing-data-from-a-store
- `store.set` replaces the whole value (`this.set` merges): spread the rest yourself: https://github.com/Pixmi/nativele/blob/main/docs/components.md#state-store-when-not-using-state
- Lists, attributes and focus go in `render(view, changed)`; annotate `changed` with the names you check (`ReadonlySet<"items" | "visible">`), never `ReadonlySet<string>`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-and-view-state-optional
- Props go down, events go up; `emit` does not bubble; data needed several levels away goes in a shared `createStore`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-flow-props-down-events-up
- State, props and the view are deeply read-only: replace objects (`{ ...todo, done: true }`), never change them in place: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-and-view-state-optional
- A `data-each` list is never nested: the inner list belongs to its own item component: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#items-as-plain-elements-replace
- A list of plain elements has no `data-key` or `data-prop` and is filled with `this.lists.x.replace(items, (item) => item.id, (item, { text, refs, show, el }) => { ... })` in `render`: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#items-as-plain-elements-replace
- A list of components has `data-key` and `data-prop` on the `<template data-each>`, `role="listitem"` on the item inside `<ul>` or `<ol>`, `this.lists.x.items = ...` in `render`, and `hit: EventHit<Item, "id">` in item handlers; extra data per row that the parent owns (selected, leading) is a separate prop of the item component, set on each row through `const row = this.lists.x.get(id); if (row) row.el.selected = ...` (typed by the item component), never by mapping the items to new objects, which re-renders every row: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#per-row-state-selected-rank
- Do not name a handler or prop like a DOM or Nativele member (`remove`, `click`, `title`, `text`, `refs`, `state`, `render`, ...), or an emitted event like a native event (`click`, `change`, `input`, ...); `ts-dom check` reports both: https://github.com/Pixmi/nativele/blob/main/docs/components.md#safeguards-in-types-and-at-runtime

## Known limitations

- Holes are text only; attributes are set in TypeScript through `data-ref`.
- Put `data-ref` only on an element the class reads through `this.refs`: an unused ref is the error `unused-ref`. Read a form's controls through one ref on the `<form>`, `this.refs.form.elements.<name>`, typed by each control's tag: https://github.com/Pixmi/nativele/blob/main/docs/components.md#reading-a-form
- A handler on an element inside any list item, a component list or a list of plain elements, receives `(e, hit: EventHit<Item, "id">)`, and `hit.key` is the item's key: https://github.com/Pixmi/nativele/blob/main/docs/components.md#events-data-on-
- A derived value cannot read another derived value; share the calculation as a plain function: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-and-view-state-optional
- `data-if` removes the element from the page (its state is kept in memory); to hide an element while it keeps focus or media playback, set `this.refs.x.hidden` in `render`.
- Nativele has no router, data fetching, form validation library, styling system or global state manager by design; use the project's tools for those, and see the other Skills for how they connect.

## Verify

```sh
npx ts-dom check --strict    # expect: ts-dom check: no issues
npx ts-dom doctor            # expect: ts-dom doctor: the set-up looks right (info lines are suggestions)
npx tsc --noEmit             # after check, which generated the files: expect no errors
```

Then exercise the changed component in a real browser (the project's own test runner, or the browser).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ReferenceError: exports is not defined` in the browser | `package.json` has no `"type": "module"`, so `tsc` emitted CommonJS | set `"type": "module"` (`nativele-typescript`), delete the output folder, run `tsc` again |
| `Failed to resolve module specifier "@nativele/ts-dom"` | no bundler and no import map | add the import map from the setup guide before the module script |
| `Cannot find module './x.html.js'` | the generated file is missing | run `npx ts-dom check` (or `ts-dom gen`) |
| `missing-binding` at a template line | a hole or `data-if` name that state, props and derive do not have | add the field, or rename the hole |
| A list stays empty | `render` never assigns it, or guards it with a name that is not in `changed` | assign `this.lists.x.items` in `render`, guarded by the name of what it shows |
| A child component does not update | an object prop was changed in place | pass a new object |
| No types in a parent's `refs.child` | the child class is not exported, or is defined outside the scanned folders | `export class`, and keep it in a folder `ts-dom gen` scans; a component from another workspace package comes from that package's exports (`nativele-monorepo`) |

## See also

The guides linked here are also in the installed package, under `node_modules/@nativele/ts-dom/docs/`.

- Templates: https://github.com/Pixmi/nativele/blob/main/docs/templates.md
- Components and data flow: https://github.com/Pixmi/nativele/blob/main/docs/components.md
- Lists: https://github.com/Pixmi/nativele/blob/main/docs/lists.md
- Recipes (loading states, dialogs, forms, store data): https://github.com/Pixmi/nativele/blob/main/docs/recipes.md
- Setup, checks and lint: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md
- The tsconfig, lint, formatter, CI and workspace set-up: `npx ts-dom skills nativele-typescript`, `nativele-linting`, `nativele-formatting`, `nativele-ci`, `nativele-monorepo`
