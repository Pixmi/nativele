# Lists

Part of the [Nativele](../README.md) documentation.

## Example: Todo list (lists, event delegation, `hit.key`)

```html
<form data-on-submit="add">
  <input data-ref="input" aria-label="New todo" />
  <button type="submit">Add</button>
</form>
<ul>
  <template data-each="items">
    <li>
      <input type="checkbox" data-ref="check" data-on-change="toggle" />
      <span>{{ title }}</span>
      <button type="button" data-on-click="removeItem">Delete</button>
    </li>
  </template>
</ul>
<p>{{ remaining }} left</p>
```

```ts
import { Component, define } from "@nativele/ts-dom";
import type { EventHit } from "@nativele/ts-dom";
import tpl from "./todo-list.html.js";

interface Item {
  id: number;
  title: string;
  done: boolean;
}

export class TodoList extends Component(tpl, {
  state: { items: [] as Item[] },
  derive: { remaining: (s) => s.items.filter((i) => !i.done).length },
}) {
  #nextId = 1;

  add(e: Event): void {
    e.preventDefault();
    const title = this.refs.input.value.trim();
    this.refs.input.value = "";
    if (title) this.set((s) => ({ items: [...s.items, { id: this.#nextId++, title, done: false }] }));
  }
  toggle(_e: Event, hit: EventHit): void {
    this.set((s) => ({ items: s.items.map((i) => (i.id === hit.key ? { ...i, done: !i.done } : i)) }));
  }
  removeItem(_e: Event, hit: EventHit): void {
    this.set((s) => ({ items: s.items.filter((i) => i.id !== hit.key) }));
  }

  // Automatic binding handles {{ remaining }}; the list is filled here.
  override render(view: { items: readonly Item[] }, changed: ReadonlySet<"items">): void {
    if (!changed.has("items")) return;
    this.lists.items.replace(
      view.items,
      (i) => i.id,
      (i, { text, refs }) => {
        text.title = i.title;
        refs.check.checked = i.done;
        refs.check.setAttribute("aria-label", `Done: ${i.title}`);
      },
      { skipUnchanged: true },
    );
  }
}
define("todo-list", TodoList);
```

- The `<template>` with `data-each` is the list item; automatic binding does not handle lists, so the list is filled in `render` with `replace`.
- Events use delegation: for `data-on-change` and `data-on-click` inside a list item, the `hit.key` they receive is that item's key.
- `{{ remaining }}` is a derived value and updates automatically.

## Lists

There are two ways to fill a list, and one rule decides between them: **an item that has anything of its own (state, events, a nested list) is a component, filled with `items =`; an item that is a few texts and `data-if` is plain elements, filled with `replace()`.** The README's second example shows the first, and the example at the top of this page the second.

### Items as components: `items = ...`

Name the field that identifies an item and the property that receives it, on the `<template data-each>`; the item is one custom element:

```html
<ul>
  <template data-each="todos" data-key="id" data-prop="todo">
    <todo-row role="listitem" data-on-toggled="toggle"></todo-row>
  </template>
</ul>
```

```ts
render(view, changed) {
  if (changed.has("todos")) this.lists.todos.items = view.todos;
}
toggle(_e: Event, hit: EventHit<Todo, "id">) { /* hit.key is the item's id, typed Todo["id"]; hit.item is the Todo */ }
```

Assigning `items` keeps the element of each key that stays (moved with `moveBefore` where the browser has it, so focus and state survive), creates one for a new key, removes the ones that are gone, and sets `todo` on each element whose item is not the same object as last time. Use immutable updates: changing a field of an object you already assigned and assigning the same object again does not update the item component, because props are compared by reference; assign a new object instead, for example `{ ...todo, done: true }`. Each item component receives its whole item through that one property; to give it more (whether it is selected, its rank), map the items to objects that carry it before assigning, for example `items.map((t) => ({ ...t, selected: t.id === selectedId }))`. The item component declares `todo` in its `props`, shows it however it likes, and tells the parent with `emit`; the parent reads `hit.key` in the handler. Reading `items` returns what was last assigned. `tsc` checks the assignment: each item must have the type of the `todo` property that `<todo-row>` declares and a `data-key` field (`id`), and the item component must declare the `data-prop` property; a list without `data-key` and `data-prop` takes no items. This relies on the component being registered in `ts-dom-tags.ts` (an exported `define("todo-row", TodoRow)` in a scanned directory). When the component is defined in a scanned directory but its class is not exported, or `ts-dom-tags.ts` does not list it yet, the assignment is a type error that says so (`itemComponentClassNotExported`, `itemComponentMissingFromTagMap`); a component from outside the scanned directories has no item type to check against, so the list accepts an object literal or a type alias with the `id` field, but rejects items typed by an interface (`Index signature for type 'string' is missing in type 'Tag'`): map them to new objects (`items.map((t) => ({ ...t }))`), or bring the component's tag map into the program (a component package exports it from its entry). At runtime, assigning throws when the value is not an array of objects, when an item has no string or number `id`, when two items share one, or when the template has no `data-key` and `data-prop`.

Inside a `<ul>` or `<ol>` the item component needs `role="listitem"`, because a custom element is not an `<li>`; the accessibility check (`list-structure`) asks for it. `data-each` cannot be nested, on purpose: an item is one component, so a list inside an item is that component's own `data-each`. Every template then holds one level, with its own `refs`, `text` and event handling.

### Items as plain elements: `replace()`

```html
<ul>
  <template data-each="tags">
    <li><span>{{ label }}</span> <b data-if="hot">🔥</b></li>
  </template>
</ul>
```

```ts
this.lists.tags.replace(
  tags,
  (t) => t.id, // key
  (t, { text, refs, show, el }) => {
    text.label = t.label;
    show("hot", t.hot === true);
  },
);
```

| Method | Description |
|---|---|
| `replace(items, key, update, opts?)` | Keyed reconciliation: remove the extra items, create the missing ones, reorder in sequence, and call `update` for each item. With `opts.skipUnchanged: true`, `update` is skipped when the item reference is the same as last time (off by default: it is safe only when you use immutable updates; if you mutate objects directly, the view stays on the old value) |
| `upsert(key, item, update)` | Add (at the end) or update a single item |
| `remove(key)` | Remove a single item |
| `clear()` | Clear everything |
| `has(key)` / `get(key)` / `size` | Queries |

`replace` only does one-dimensional key matching; the DOM nodes of existing items are kept and moved, and subtrees are not compared. The content of an item is entirely decided by your `update`.

Notes:

- `data-ref`, holes, and `data-if` inside an item belong to that item and do not appear in the component-level `refs` / `text`.
- `data-if` cannot be placed on an item's root element; wrap it in one more layer.
- `data-each` cannot be nested. Split it into two templates: put the inner list in its own `.html` (a child component with its own `data-each`) and use that component's tag inside the outer item.
- `<slot>` cannot be placed inside an item.

### Moving items, connecting and subscriptions

- In a browser with `moveBefore`, a moved item stays connected: neither `disconnected()` nor `connected()` runs, and its focus, scroll position and subscriptions are untouched.
- Without it (older browsers, and DOM implementations for tests such as happy-dom and jsdom), a moved item is removed and inserted again: `disconnected()` runs and releases everything registered with `bind`, `on` and `onCleanup`, then `connected()` runs again, and a focused input in it loses focus. Its element, props and state stay the same.
- So subscribe in `connected()` (`this.bind(store, ...)`, `this.on(...)`), not in the constructor or a field initializer: then the subscription is made again after a move in every browser. A subscription made in the constructor is released by the first move and never comes back.
- Data that every item needs (a theme, the current user, a registry) belongs in a `createStore` that the item component binds in `connected()`, not copied into every item object.

### Order of list updates

Assigning `items` sets the `data-prop` property of a new item before its element goes into the document, so the item component is connected with its item already set and its first render shows it. `replace()` and `upsert()` put a new item's element into the document first and then call `update`, so a child component placed in such an item is connected before the parent has set its properties; there, build per-item state when the child first receives data (for example in a property setter), and guard a render in `connected()` with the data it needs.
