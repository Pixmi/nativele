# Components and data flow

Part of the [Nativele](../README.md) documentation.

## Example: Parent and child components (props down, events up)

The child component owns only `props` (given by the parent, read-only). To change a value, it uses `emit` to ask the parent to handle it:

```html
<button type="button" data-on-click="dec">-</button>
<output>{{ value }}</output>
<button type="button" data-on-click="inc">+</button>
```

```ts
import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./quantity-input.html.js";

/** A child component: the parent owns the value (a prop); the child only asks for a change through an event. */
export class QuantityInput extends Component(tpl, {
  props: { value: 0, min: 0, max: 10 },
  emits: { "quantity-change": event<{ value: number }>() },
}) {
  dec(): void {
    if (this.props.value > this.props.min) this.emit("quantity-change", { value: this.props.value - 1 });
  }
  inc(): void {
    if (this.props.value < this.props.max) this.emit("quantity-change", { value: this.props.value + 1 });
  }
}
define("quantity-input", QuantityInput);
```

The parent uses the child's tag directly in its own HTML. `ts-dom gen` automatically `import`s the child component and gives `this.refs.qty` the child's full type:

```html
<quantity-input data-ref="qty" min="1" max="5" data-on-quantity-change="onQuantity"></quantity-input>
<p>Total: {{ total }}</p>
```

```ts
import { Component, define } from "@nativele/ts-dom";
import type { EmitEvent } from "@nativele/ts-dom";
import type { QuantityInput } from "./quantity-input.js";
import tpl from "./order-line.html.js";

export class OrderLine extends Component(tpl, {
  state: { quantity: 1, price: 20 },
  derive: { total: (s) => s.quantity * s.price },
}) {
  // Event up: the child asked for a new quantity; the parent decides.
  onQuantity(e: Event): void {
    this.set({ quantity: (e as EmitEvent<QuantityInput, "quantity-change">).detail.value });
  }

  // Data down: the child's props are typed (a wrong name or type is a tsc error).
  override render(view: { quantity: number }): void {
    this.refs.qty.value = view.quantity;
  }
}
define("order-line", OrderLine);
```

The data flow goes in only one direction: the parent's state → the child's props (`this.refs.qty.value = ...`); the child's request → event → the parent's handler method.

## Components

```ts
class MyEl extends Component(tpl) {}                    // default: Light DOM
class Iso extends Component(tpl, { shadow: true }) {}   // optional: Shadow DOM
```

Provided members:

| Member | Description |
|---|---|
| `refs` | The elements corresponding to `data-ref` |
| `text` | Holes; assigning a value updates every place where the hole appears |
| `lists` | List objects |
| `show(name, on)` | Toggle a `data-if` (hidden by default) |
| `props` / `emit(name, detail)` | When using the `props` and `emits` options: data given by the parent (read-only) and events emitted upward, see [Data Flow](#data-flow-props-down-events-up) |
| `slotchange(name)` | Override to react to later changes of slot content in Light mode |
| `assignedNodes(name)` | The nodes currently assigned to that slot (excluding fallback content); behaves the same in Light and Shadow |
| `bind(store, fn)` | Subscribe to a store, call once immediately, and unsubscribe automatically when the element is removed |
| `on(target, type, fn)` | Attach a native event listener, removed automatically when the element is removed; returns a function for manual removal. Event types and parameters are inferred from `HTMLElementEventMap` |
| `onCleanup(fn)` | Register a cleanup function to run when the element is removed |
| `root` | The element itself (default), or the `ShadowRoot` (`shadow: true`) |
| `connected()` / `disconnected()` | Override to attach your own behavior |

The lifecycle is the Custom Elements `connectedCallback` / `disconnectedCallback`; you can also override them directly (remember to call `super`). Children a framework or your code adds after the element is connected are placed in their slot in a microtask (a `MutationObserver` in Light mode, native `slotchange` in Shadow mode), so read `assignedNodes` after `await Promise.resolve()`.

`define(name, Class)` registers the element once: calling it again with a name that is already defined does nothing and keeps the first class (`customElements.define` itself would throw). A test that re-imports a component module therefore keeps the first class.

### Light (default) and Shadow

ts-dom does no style management, so by default it renders into the element itself (Light DOM): what you see in the DOM is the structure you wrote, CSS is global, and id references for forms and ARIA work as usual. `shadow: true` uses Shadow DOM instead.

| | Light (default) | `shadow: true` |
|---|---|---|
| Render location | The element itself | The element's open shadow root |
| Styles | Global; `<style scoped>` can scope locally | Native isolation: document styles do not get in, and the component's `<style>` does not leak out; `:host` works |
| `<style>` | Extracted and injected into `document.head` only once | Stays inside the shadow root, not injected into `<head>`; the `scoped` attribute has no effect |
| `<slot>` | Moved once at creation, then maintained by a `MutationObserver` | Native to the browser |
| Slot change notification | Override `slotchange(name)` | **Native `slotchange` event** (`slot.addEventListener("slotchange", …)`); the `slotchange(name)` method is only called in Light mode |
| `assignedNodes(name)` | Yes | Yes (equivalent to native `slot.assignedNodes()`) |
| `state`, `props`, `derive`, `emit`, `data-on-*`, lists, `data-if`, attributes | All supported | All supported, with the same behavior |
| Forms | Naturally compatible with outer forms | You must handle `ElementInternals` yourself |

Shadow DOM is verified in real Chrome ([browser/shadow.test.ts](../browser/shadow.test.ts), 18 tests), covering: rendering and style isolation, `:host`, native slots and `slotchange`, attributes and props (including assignment before upgrade), `state` / `derive` / `data-if`, event delegation (including non-bubbling `focus`), `emit` not bubbling to `window`, child components inside list items (`hit.key`), **a Shadow parent containing a Light child and a Light parent containing a Shadow child**, and the fact that content a user puts into a slot is not treated as the component's own `data-on-*`.

Light-mode slot rules:

- Matching is by `slot="name"`. Nodes without a slot attribute go into the default slot, and when there is no content, the fallback content inside `<slot>` is used.
- `{{ }}`, `data-ref`, and `data-if` in user content are not parsed; they belong to the user's own DOM.
- As with native Shadow DOM, only the **direct child nodes of the host element** are assigned (nodes nested deeper are not). Child nodes added to the element after creation are assigned to the matching slot; when the `slot` attribute of an assigned node is changed, it is reassigned immediately; when an assigned node is removed, the fallback content is restored if that slot becomes empty; nodes with no matching slot are not rendered, consistent with native behavior. These changes call `slotchange(name)` (the initial assignment at creation does not).
- The rendered Light DOM has no `<slot>` elements: each slot position is the range between the comments `<!--slot:name-->` and `<!--/slot:name-->` (`<!--slot:-->` for the default slot). Read what a slot holds with `assignedNodes(name)` (`assignedNodes("")` for the default slot) rather than querying for `slot`.
- Dynamic changes rely on a `MutationObserver`, which observes only while the element is connected and is disconnected on removal.

```ts
class Card extends Component(tpl) {
  override slotchange(name: "head" | "") { console.log("slot changed", name); }
}
```

### Styles

A top-level `<style>` in a template can be written in two ways in Light mode:

```html
<style>
  user-card .tag { color: gray }   /* global: shared by the whole document */
</style>
<style scoped>
  :scope { display: block }        /* scoped: only applies inside <user-card> */
  .tag { color: gray }
</style>
```

- `<style>` **must be at the first level of the HTML** and must not be wrapped by other elements (including `<template data-each>` and `data-if` elements); otherwise codegen reports an error.
- Both are injected into `document.head` only once and are not duplicated per instance.
- In supporting browsers, `scoped` uses native CSS `@scope (<tag name>)`; where it is unsupported it falls back to CSS nesting automatically (`<tag name> { ... }`, with `:scope` converted to `&`). Neither needs a CSS parser. The precedence of `@scope` is decided by "proximity to the root", not by specificity alone.
- In Light mode `:host` has no effect, and a warning is logged to the console at runtime; use a tag selector or `:scope` instead.
- With `shadow: true`, `<style>` stays inside the shadow root and the `scoped` attribute has no effect.
- The injected `<style>` is not in a cascade layer, so it wins over styles in a layer (a CSS framework's utilities, for example) whatever their specificity. To let layered styles override a template's defaults, put the template's rules in a layer: `<style scoped> @layer components { .tag { color: gray } } </style>`.
- Document styles do not reach a `shadow: true` component. To use a stylesheet there, adopt it in the constructor after `super()`: `this.shadowRoot!.adoptedStyleSheets = [sheet]`, with one `CSSStyleSheet` shared by every instance.

## Data and View: state (optional)

The simplest usage: give `Component` a `state`, and change data only with `this.set()`.

```ts
class Counter extends Component(tpl, {
  state: { title: "Todo", items: [] as Item[], filter: "all" },
  derive: { remaining: (s) => s.items.filter((i) => !i.done).length }, // derived value
}) {
  add(e: Event) {
    this.set((s) => ({ items: [...s.items, { id: nextId++, title: "x", done: false }] }));
  }
  override render(view, changed) {
    // whatever automatic binding cannot handle (lists, attributes, focus…) goes here
    if (changed.has("items")) this.lists.items.replace(view.items, (i) => i.id, (i, { text }) => (text.title = i.title));
  }
}
```

| Member | Description |
|---|---|
| `state` | The current data, read-only. Use `set` to change data |
| `set(patch)` / `set(s => patch)` | **The only entry point for changing data**: shallow-merges the patch; **if no field actually changes (`Object.is`), it does nothing** and `render` is not called. When something changes, it updates the automatic bindings synchronously and then calls `render` |
| `render(view, changed)` | Override it to handle updates other than automatic binding. `view` is `state`, props and the derived values, and `changed` holds the names of the state fields, props and derived values that changed this time (all of them on the first render). Use `changed.has("x")` to skip the parts that did not change, and annotate it with the names you check, for example `changed: ReadonlySet<"items" | "visible">`, so tsc reports a misspelled name or one that is not state, a prop or a derived value |
| `batch(fn)` | Combine multiple `set` calls: after `fn` finishes, the update runs once and `render` is called once |
| `derive` option | Derived values, usable directly by `{{ }}`, `data-if`, and `render`. They are recomputed after every state change, with **no dependency tracking** |

**Automatic binding**: `{{ name }}` and `data-if="admin"` map to the same-named state field (or derived value) and are written automatically when the field's value changes; `data-if` shows the block based on truthiness. **Names are checked by tsc**: when the HTML uses a name that neither `state` nor `derive` has, `class X extends Component(...)` reports an error that lists the missing names (the error message is `missingStateKeys: "name"`). Lists (`data-each`) are not bound automatically, because the key and how each item is filled are for you to decide; use `replace` in `render`.

Design trade-offs:

- **Synchronous**: when `set` returns, the view has already been updated. There is no implicit asynchronous batching, so reading the DOM right after `set` always gives the new state. To combine updates, use `batch` explicitly.
- **No fine-grained updates**: on every change, `render` re-runs as a whole, and its cost depends on what you write in it. For large lists, use `changed` to skip unnecessary redraws and enable `skipUnchanged` on `replace` (see [Lists](lists.md#lists)).
- `set` may be called inside `render`; it is processed in another round after the current one ends. If it has not stabilized after 50 consecutive rounds, a "suspected infinite loop" error is thrown.
- When `state` is not used, the original `refs`, `text`, `show`, `bind`, and `createStore` work as before, fully backward compatible.
- Once a component has any of `state`, `props` or `derive`, every `{{ hole }}` and `data-if` in its template, outside a `<template data-each>`, must name one of them; tsc reports any other name. Holes inside a list item belong to the item and are filled by `replace` (see [Lists](lists.md)). To show data from a store in such a component, copy it into state in the `bind` callback (see [Recipes](recipes.md#showing-data-from-a-store)).

**Read-only all the way down**: `state`, `props`, the `view` passed to `render` and the argument of each `derive` function are typed `DeepReadonly`: arrays and objects inside them cannot be changed in place. `this.state.items[0].done = true` or `this.state.items.push(x)` is a `tsc` error, because an object changed in place keeps its identity and the list and child props, which compare by reference, would not update. Pass new objects instead: `this.set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, done: true } : i)) }))`. When you annotate `render`'s `view` or a helper that takes the state, use read-only types (`readonly Item[]`, or `DeepReadonly<State>` from `@nativele/ts-dom`).

### Common DOM operations in render

`render` uses the DOM directly; the library adds no wrapper for attributes or classes, because the native APIs are already typed through `refs`:

| To change | Write |
|---|---|
| Text | a `{{ hole }}` bound to state, or `this.text.name = value` |
| Whether an element is in the document | `data-if` bound to state, or `this.show("name", on)` (the element is removed, so its inner state is lost) |
| Whether an element shows, keeping its state (typed input, scroll position, playing media) | `this.refs.panel.hidden = !open` |
| An attribute | `this.refs.link.setAttribute("aria-current", "page")` or a typed property such as `this.refs.submit.disabled = view.loading` |
| A class | `this.refs.panel.classList.toggle("loading", view.loading)` |
| A form control's value | `if (this.refs.name.value !== view.name) this.refs.name.value = view.name` (see below) |
| A list | `this.lists.x.items = view.x` for components, `this.lists.x.replace(...)` for plain elements (see [Lists](lists.md)) |

Guard each block with `changed.has(...)` so a change elsewhere does not redo it.

## Events: data-on-*

HTML writes only the event name and the method name; the logic is in TS:

```html
<form data-on-submit="add">…</form>
<template data-each="items"><li><button data-on-click="removeItem">✕</button></li></template>
```

```ts
add(e: Event) { e.preventDefault(); … }
removeItem(e: Event, hit: EventHit) { this.set((s) => ({ items: s.items.filter((i) => i.id !== hit.key) })); }
```

- The method receives `(event, hit)`. `hit.el` is the element carrying the `data-on-*`; when the event happens inside a list item, `hit.key` is that item's key and `hit.item` is the data most recently passed to `update`; this also holds for events emitted by a child component placed inside the item. `hit.key` and `hit.item` are untyped and optional unless the handler names the item type and its key field, e.g. `hit: EventHit<Todo, "id">`, which makes `hit.item` a `Todo` and `hit.key` a `Todo["id"]` (use that form only for handlers inside list items). If you need extra parameters, put them in `data-*` attributes and read `hit.el.dataset` in the method.
- **Event delegation**: only one listener per event type is attached at the component root, so a longer list does not add listeners, and adding or removing items needs no rebinding. Non-bubbling events (`focus`, `blur`, `mouseenter`, etc.) use the capture phase and handle only the target itself; for bubbling events, the handler methods are called in order from the inside out, and `stopPropagation()` stops the chain.
- **Only elements in the component's own template count**: content a user puts into a slot does not trigger anything even if it has `data-on-click`.
- Only a method name may be written; `add(1)` and `a.b` cause an error at codegen time. A method name must not collide with DOM built-in methods or ts-dom members (for example `remove`, `click`, `focus`, `set`, `render`); otherwise they would be overridden, and codegen reports an error and suggests renaming.
- **tsc checks that the method exists**: `define(name, Class)` checks that every method referenced by the HTML is a public member of the class, and reports an error listing the names when one is missing (`missingHandlers: "name"`). The check runs again when the element is connected to the page and throws a clear runtime error.
- Event names must be lowercase (HTML attributes are case-insensitive); for mixed-case events such as `DOMContentLoaded`, use `this.on()` instead.

## Composition: Using Multiple Components Together

Each `.html` plus its TS is one component (a custom element), and writing its tag in another template is composition:

```html
<!-- signup-form.html -->
<form-field data-ref="name" label="Name" data-on-field-input="onName"></form-field>
<template data-each="entries">
  <li><entry-row data-ref="row" data-on-remove-entry="removeEntry"></entry-row></li>
</template>
```

```ts
render(v) {
  this.refs.name.value = v.name;          // data down: the child's props, fully typed
  this.lists.entries.replace(v.entries, (x) => x.id, (x, { refs }) => { refs.row.name = x.name; });
}
onName(e: Event) {                         // event up: sent only to the direct parent of this tag
  this.set({ name: (e as EmitEvent<FormField, "field-input">).detail.value });
}
```

Composition needs three things, and ts-dom handles all of them:

- **Child components are loaded automatically**: for a tag used in a template (its name contains a hyphen), if there is a `define("tag", Class)` in the scanned directories, `ts-dom gen` automatically adds `import "./child.js"` to the generated `x.html.ts`. HTML is the single source of dependencies, and you do not need to `import` child components yourself (referencing a type with only `import type` does not register the element, which is an easy trap to fall into). Components outside the directories, or third-party ones, still need to be imported by you.
- **Child component types**: `ts-dom gen` scans `define("tag", Class)` (the class must be `export`ed) and generates `ts-dom-tags.ts`, which registers the components in `HTMLElementTagNameMap`. As a result, for `<form-field data-ref="name">` in a template, `refs.name` is `FormField`: prop names and types, and methods, are all checked by tsc. This file is already in `.gitignore` and, like `.html.ts`, is generated by `gen`.
- **Slots can cross layers**: for content the parent puts into a child component's slot, its `{{ }}` belongs to the parent and is updated by the parent; `data-on-*` is also handled by the parent, and the child does not catch it by mistake.

"Template fragment include" is not provided: it would become a template-language feature. To share a piece of structure, make it a component.

## Data Flow: props Down, Events Up

`props` and `emits` are two options besides `state` that give the data flow between parent and child components clear rules:

```ts
class FormField extends Component(tpl, {
  props: { label: "", value: "", error: "" },      // given by the parent (read-only)
  state: { touched: false },                       // owned by itself
  derive: { showError: (s) => s.touched && s.error !== "" },
  emits: { "field-input": event<{ value: string }>() },   // events emitted upward
}) {
  onInput() {
    this.set({ touched: true });
    this.emit("field-input", { value: this.refs.input.value });
  }
}
```

| | Owner | Who can change it | How |
|---|---|---|---|
| `state` | The component itself | The component itself | `this.set()` |
| `props` | The parent | The parent | HTML attribute (`user-name="Ada"`) or JS property (`el.userName = "Ada"`) |
| Events | Emitted by the component itself | Anyone can subscribe | `this.emit(name, detail)` |

- The default value of a prop determines its type and how the attribute is converted: `string`, `number` (an invalid number warns and uses the default), `boolean` (the attribute being present means `true`; `"false"` and removal mean `false`). Arrays and objects can only be passed through JS properties. camelCase names map to kebab-case attributes: `maxLength` ↔ `max-length`.
- Like `state` and `derive`, `props` can be bound automatically by `{{ }}` and `data-if`, and also appear in the `view` and `changed` of `render`; a prop assigned before the element is upgraded is not lost either.
- Events in `emits` **do not bubble** by default, and only the child's own tag can receive them: the handler is always written on `<child data-on-xxx="method">` in the parent's HTML, so you can see from the HTML where data goes. Declare `event({ bubbles: true })` explicitly only when you need bubbling.
- The event's data type is obtained from `EmitEvent<FormField, "field-input">` (`CustomEvent<{ value: string }>`).

### Safeguards in Types and at Runtime

| Problem | Safeguard |
|---|---|
| Modifying a prop with `set()` inside the component | The type of `set` does not include props; a clear error is thrown at runtime |
| `emit` of an undeclared event, wrong data type, or missing data that should be provided | tsc reports an error; an undeclared event throws an error at runtime |
| `state` / `props` / `derive` with the same name | tsc reports an error (`conflictingKeys`); an error is thrown when `Component()` is called |
| A prop name that is the same as a member of `HTMLElement` or ts-dom (`title`, `hidden`, `render`…) | tsc reports an error (`reservedPropNames`); an error is thrown at runtime |
| `emits` with the same name as a native event (`click`, `input`…) | tsc reports an error (`nativeEventNames`); an error is thrown at runtime |
| The parent gives the child a prop with a wrong name or type | tsc reports an error (types come from `HTMLElementTagNameMap`) |

### Avoiding Layer-by-Layer Passing (lint: `ts-dom/data-flow`)

A common problem in Vue is re-emitting layer by layer and passing props down layer by layer (prop drilling and emit chains), which is held back only by habit. Besides "events do not bubble by default", there are lint hints here (suggestions only, not errors):

| Id | Detection |
|---|---|
| `prop-forwarding` | Assigning your own prop as-is to a child component (`this.refs.kid.name = v.name`, where `name` is your own prop) |
| `emit-forwarding` | A method that handles a child event merely `emit`s the event again (with the same name, or the whole method is just one `this.emit(...)`) |
| `props-mutation` | Assigning to props inside the component (`this.count = …`) |
| `custom-event-on-native` | Writing a custom event on the `data-on-*` of a native element (a child component's events do not bubble, so it would never be received) |
| `unknown-prop` | An attribute written on a child component's tag is not a prop it declares (hints "Did you mean …") |
| `invalid-prop-value` | The attribute cannot set that prop: the prop is not string / number / boolean (it can only be passed through JS properties) |
| `unknown-event` | `data-on-xxx` is written on a child component's tag, but the child does not declare (`emits`) this event and it is not a native event either |

The last three are **HTML-level props / emit checks**: `tsc` checks `refs.child.prop` and `emit()` in TypeScript, while these three rules check the child component attributes and events written in the **parent's HTML**. They read the child components from `define("tag", Class)` in the directories and extract the declarations from `Component(tpl, { props, emits })`; when no child component definition is found (for example a third-party component), nothing is checked.


Recommended practices:

- **Data and events cross only one layer**: the parent owns the data and passes props down, and the child notifies with events.
- **Data shared across many layers uses a shared store**: put `createStore` in a separate module, and have the components that need it import it directly and subscribe with `this.bind(store, fn)`, so the intermediate layers do not need to know about it or forward it.
- When an event has to cross two layers, handle it explicitly in the middle layer (it has its own logic) instead of forwarding it as-is.

```ts
// session.ts — components at any depth can use it directly, no layer-by-layer passing
export const session = createStore({ user: "Ada" });
// deep component
connected() { this.bind(session, (s) => (this.text.user = s.user)); }
```

Enable it the same way as other lint rules: `"ts-dom/data-flow": ["warn", { ignore: [] }]`, or the CLI `npx ts-dom lint` (which also shows data flow warnings; adding `--strict` makes the exit code 1).

### A Small Reminder About Form Inputs

When writing data back to an `<input>` in `render`, first compare whether the value is the same: when data returns to the child component through "input → emit → parent → props", writing the same value again makes the cursor jump to the end.

```ts
if (changed.has("value") && this.refs.input.value !== v.value) this.refs.input.value = v.value;
```

The lint rule `unguarded-input-value` (in the `data-flow` group, also `ts-dom/unguarded-input-value` on its own) reports a `render()` that writes an `<input>`, `<textarea>` or `<select>` value without this comparison. Writing a value in an event handler, such as clearing a field after submit, is fine and not reported.

The example [examples/signup](../examples/signup/signup-form.ts) does exactly this, and a real Chrome test verifies that the cursor position does not jump.

## State: store (when not using state)

```ts
const store = createStore({ count: 0 });
store.get();
store.set({ count: 1 });
store.set((s) => ({ count: s.count + 1 }));
const off = store.subscribe((s) => console.log(s)); // returns an unsubscribe function
```

`store.set` replaces the whole value; it does not merge like a component's `this.set`, because a store can hold any value (a number, an array). For an object with several fields, spread the rest yourself: `store.set((s) => ({ ...s, status: "loading" }))`.

`this.bind` also accepts a read-only source that has only `get` and `subscribe`. There is no dependency tracking: after `set`, all subscribers are called; if the value is the same under `Object.is`, no notification is sent. `bind(source, callback)` calls the callback at once with `source.get()`, then with every value `subscribe` delivers, and unsubscribes when the element is removed. A `bind` made in `connected()` is made again on re-insertion, and then delivers the current value at once; a `bind` made elsewhere (for example in the constructor) ends on removal and does not come back. The source's `subscribe` must return the function that unsubscribes, and must not call the listener when it subscribes: a store whose `subscribe` does (nanostores' atoms, for example) calls the callback twice at connect; pass `{ get: atom.get, subscribe: atom.listen }` instead. It is a small utility for when the `state` option is not used, and you may also skip it entirely, manage state yourself, and write directly to `refs` / `text`. When you need automatic binding and `render`, use `state` above instead.
