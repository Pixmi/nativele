---
name: nativele-core
description: "Build and change web components with Nativele (@nativele/ts-dom): the write-check-fix loop, templates, state, lists and data flow. Use whenever a project depends on @nativele/ts-dom and you add or change an .html template or a component."
metadata:
  tier: official
  nativele: ">=0.5.0 <0.6.0"
  verified: "2026-11-05"
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
| @nativele/ts-dom | 0.5.0 |
| typescript | 7.0.2 |

Verified on 2026-11-05 by the library's own CI, which type-checks, lints and runs every example in the repository in real Chrome.

## Set-up

1. `npm i @nativele/ts-dom` and `npm i -D typescript`, and set `"type": "module"` in `package.json` (with or without a bundler).
2. Put the components under `src/`, the folder every `ts-dom` command scans by default; for another folder, pass it to each command (`npx ts-dom check web/ui`).
3. `tsconfig.json` with `"strict": true`, `"lib"` including `"DOM"`, and `"moduleResolution"` `"NodeNext"` or `"bundler"`; its `include` must cover the folders with templates. A complete one for the no-bundler case is in the setup guide: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#installation-and-setup
4. With Vite, add `tsDom()` from `@nativele/ts-dom/vite` to `plugins`. Without a bundler, `ts-dom gen` plus `tsc` compiles the code, and the page needs an import map for `@nativele/ts-dom` plus a `<script type="module">` for the compiled entry, a module that imports the top-level components: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#running-in-the-browser-no-bundler
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

- A `derive` function takes one argument: the state and props merged into one read-only object (other derived values are not in it).
- `emits` declares each event with `event()`, or `event<Detail>()` when it carries data; send the data with `this.emit("name", detail)`. The parent listens with `data-on-<event>` on the child tag and reads the data as `(e as EmitEvent<Child, "name">).detail`, because an HTML attribute cannot carry the event's type.
- `bind` goes in `connected()`; the subscription is released when the element is removed.

## The loop

1. Write the `.html` and the `.ts` of a component together. Import the template as `./x.html.js`.
2. Run `npx ts-dom check` (add `--json` to read the result as data). It regenerates the generated files, runs `tsc`, points template contract errors at the template line and column, and runs the lint rules. Use `--no-write` where the working tree must not change.
3. Fix every issue by its `Fix:` hint. Never cast a type error away, and never edit `x.html.ts` or `ts-dom-tags.ts`: they are generated.
4. `npx ts-dom rules --explain=<id>` explains any rule id from a diagnostic, with a wrong and a right example.
5. Repeat until `ts-dom check` prints `no issues`.

## Rules

- No expressions in HTML: `{{ name }}` is a single identifier. Compute in `derive` (or in TypeScript) and fill a named hole.
- Change state only with `this.set()`. Rendering is synchronous; `this.batch()` combines updates.
- Once a component has `state`, `props` or `derive`, every `{{ hole }}` and `data-if` outside a `<template data-each>` must name one of them (holes inside a plain-element list are filled by `replace`). Show store data by copying it into state in the `bind` callback.
- `store.set` replaces the whole value; a component's `this.set` merges. Spread the rest yourself: `store.set((s) => ({ ...s, status: "loading" }))`.
- Lists, attributes and focus go in `render(view, changed)`. `changed` holds the state, prop and derived names that changed; annotate it with the names you check (`changed: ReadonlySet<"items" | "visible">`), never `ReadonlySet<string>`.
- Props go down (the parent sets them), events go up (`emit`, handled with `data-on-<event>` on the child tag). `emit` does not bubble; data needed several levels away goes in a shared `createStore` that the components `bind`.
- State, props and the view are deeply read-only: replace objects instead of changing them (`{ ...todo, done: true }`).
- A `data-each` list cannot be nested: the inner list belongs to its own item component.
- A list of plain elements (no item component) has neither `data-key` nor `data-prop`; fill it with `this.lists.x.replace(items, key, fill)` in `render`: https://github.com/Pixmi/nativele/blob/main/docs/lists.md
- For a list of components, write `data-key` and `data-prop` on the `<template data-each>`, give the item component `role="listitem"` inside `<ul>` or `<ol>`, assign `this.lists.x.items = ...` in `render`, and type item handlers as `hit: EventHit<Item, "id">`. Each item component gets its item through that one prop; to pass more (selected, leading), map the items to objects that carry it before assigning.
- Do not name a handler or prop like a DOM or Nativele member (`remove`, `click`, `title`, `text`, `refs`, `state`, `render`, ...), or an emitted event like a native event (`click`, `change`, `input`, ...); `ts-dom check` reports both.

## Known limitations

- Holes are text only; attributes are set in TypeScript through `data-ref`.
- A derived value cannot read another derived value; share the calculation as a plain function.
- `data-if` removes the element from the page (its state is kept in memory); to hide an element while it keeps focus or media playback, set `this.refs.x.hidden` in `render`.
- Nativele has no router, data fetching, form validation library, styling system or global state manager by design; use the project's tools for those, and see the other Skills for how they connect.

## Verify

```sh
npx ts-dom check --strict    # expect: ts-dom check: no issues
npx ts-dom doctor            # expect: ts-dom doctor: the set-up looks right (info lines are suggestions)
npx tsc --noEmit             # expect: no errors
```

Then exercise the changed component in a real browser (the project's own test runner, or the browser).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ReferenceError: exports is not defined` in the browser | `package.json` has no `"type": "module"`, so `tsc` emitted CommonJS | set `"type": "module"`, delete the output folder, run `tsc` again |
| `Failed to resolve module specifier "@nativele/ts-dom"` | no bundler and no import map | add the import map from the setup guide before the module script |
| `Cannot find module './x.html.js'` | the generated file is missing | run `npx ts-dom check` (or `ts-dom gen`) |
| `missing-binding` at a template line | a hole or `data-if` name that state, props and derive do not have | add the field, or rename the hole |
| A list stays empty | `render` never assigns it, or guards it with a name that is not in `changed` | assign `this.lists.x.items` in `render`, guarded by the name of what it shows |
| A child component does not update | an object prop was changed in place | pass a new object |
| No types in a parent's `refs.child` | the child class is not exported, or is defined outside the scanned folders | `export class`, and keep it in a folder `ts-dom gen` scans |

## See also

- Templates: https://github.com/Pixmi/nativele/blob/main/docs/templates.md
- Components and data flow: https://github.com/Pixmi/nativele/blob/main/docs/components.md
- Lists: https://github.com/Pixmi/nativele/blob/main/docs/lists.md
- Recipes (loading states, dialogs, forms, store data): https://github.com/Pixmi/nativele/blob/main/docs/recipes.md
- Setup, checks and lint: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md
