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
  onQuantity(e: EmitEvent<QuantityInput, "quantity-change">): void {
    this.set({ quantity: e.detail.value });
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
| `on(target, type, fn)` | Attach an event listener, removed automatically when the element is removed; returns a function for manual removal |
| `onCleanup(fn)` | Register a cleanup function to run when the element is removed; it runs once and is dropped, so register it in `connected()` to have it for every connection (see [Recipes](recipes.md#cancelling-a-request-when-the-component-is-removed)) |
| `root` | The element itself (default), or the `ShadowRoot` (`shadow: true`) |
| `connected()` / `disconnected()` | Override to attach your own behavior |

`this.on()` types the listener's parameter like a `data-on-*` handler's. On an element, an unannotated parameter gets the type `HTMLElementEventMap` lists for the name. A parameter typed narrower than `Event` must accept the event the target declares: its `emits`, its `on<name>` property, then `HTMLElementEventMap`. A name the target does not declare is not checked: type the parameter as the event it is, such as `(e: CustomEvent<{ id: number }>)` or `EmitEvent<Child, "x">`.

The lifecycle is the Custom Elements `connectedCallback` / `disconnectedCallback`, which the component type declares. Override `connected()` and `disconnected()`; an override of the callbacks themselves must call `super`.

Children a framework or your code adds after the element is connected are placed in their slot in a microtask (a `MutationObserver` in Light mode, native `slotchange` in Shadow mode). Read `assignedNodes`, or assert in a test, after `await Promise.resolve()`.

`set()` and props work before the element is connected: it renders with the last values when it connects.

Set the element's own class, role and other attributes in `connected()`. A template describes the element's content, not the element itself, so it has no place for them.

- Add to what the tag already has rather than replacing it, so that what the parent writes on the tag stays: `this.classList.add("card")`, and `if (!this.hasAttribute("role")) this.setAttribute("role", "listitem")`.
- Do not set them in the constructor. When `document.createElement` or the HTML parser creates an element whose constructor added attributes or children, a browser reports `NotSupportedError` and creates an `HTMLUnknownElement` instead, so the component never renders. happy-dom and jsdom accept it, so only a browser shows it; lint reports it as `constructor-host-change`.
- Listeners on the element itself also go in `connected()`, with `this.on(this, type, fn)`: the component attaches its `data-on-*` listeners when it builds its content, and a listener added earlier, in the constructor, runs before them.
- Style the element itself with `:host` in the `<style>` of a `shadow: true` component, and with the tag as the selector in Light mode ([Styles](#styles)).

A Light DOM component builds its content when it is connected. While the document is still being parsed, it waits for `DOMContentLoaded`, so that its children have arrived. A `shadow: true` component builds its content into its shadow root in the constructor.

In both modes the child components of the template start after the parent's first render, so each child first renders with the props that render gives it. A child builds its own content when it starts, so in the parent's first render it has no `refs` of its own yet: set its props there, and call its methods from a later render or an event handler. In Light mode the children have started by the time the parent's `connected()` runs; in Shadow mode they start after it.

So an element made with `document.createElement` in Light mode has no children, and empty `refs` and `text`, until it is appended to the document. Set props before that, and read the DOM after it.

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
| Forms | Controls in the template are part of an outer form | Controls in the shadow root are not part of an outer form; the component can be a [form control of its own](recipes.md#a-form-control-of-your-own) |

Shadow DOM is verified in real Chrome ([browser/shadow.test.ts](../browser/shadow.test.ts)), including a Shadow parent containing a Light child and a Light parent containing a Shadow child.

#### Slots in Light mode

- Matching is by `slot="name"`. Nodes without a slot attribute go into the default slot, and when there is no content, the fallback content inside `<slot>` is used.
- `{{ }}`, `data-ref`, and `data-if` in user content are not parsed; they belong to the user's own DOM.
- Only the **direct child nodes of the host element** are assigned, as with native Shadow DOM; nodes nested deeper are not.
- The slots take content written in HTML: the children the element has when it is built, and the nodes a list (`data-each`) or `data-if` of the parent's template puts in later. Changing the `slot` attribute of such a node reassigns it immediately.
- A node that other code adds after the element is built (a framework rendering children, `appendChild`) is not placed: it stays where it was put, outside every slot, and the console warns once per tag (`unplaced-child`). Use `shadow: true` for children a framework or code adds, or put the content into an element of the template that the component exposes through a ref ([Design decisions](design.md#design-decisions)).
- When a removed node leaves its slot empty, the fallback content comes back.
- A child written in HTML with no matching slot is removed from the element, unlike a shadow host, which keeps such a child without rendering it. The console warns once per tag and slot name (`unslotted-node`).
- A comment among the children stays where it is and goes into no slot, as natively, so a framework's anchor comment is kept.
- Placement follows where the nodes are after each change, not the order of the changes. A child removed and appended back in the same task goes into its slot again, and an assigned node moved to another parent is no longer assigned.
- `slotchange(name)` is called when a slot's assigned nodes or their order change. The initial assignment at creation does not call it.
- The component's own nodes are never assigned, even at the top level of the template: list items, `data-if` blocks, `{{ }}` text and a slot's fallback content stay where the template puts them.
- While a slot has assigned nodes, its fallback is kept aside. The `data-if` blocks and lists inside the fallback keep following `show` and the list's items, so the fallback comes back as they last left it.
- The rendered Light DOM has no `<slot>` elements: each slot position is the range between the comments `<!--slot:name-->` and `<!--/slot:name-->` (`<!--slot:-->` for the default slot). Read what a slot holds with `assignedNodes(name)` (`assignedNodes("")` for the default slot) rather than querying for `slot`.
- Dynamic changes rely on a `MutationObserver`, which observes only while the element is connected and is disconnected on removal; content written in HTML that is added, removed or moved while the element is disconnected is placed when it is connected again.

```ts
class Card extends Component(tpl) {
  override slotchange(name: "head" | "") { console.log("slot changed", name); }
}
```

### Slots and children managed by a framework

Give a component whose children a framework (React, Vue, Svelte, Angular, Preact, ...) renders `shadow: true`: the browser assigns its slots natively, and the framework can insert, remove and reorder the children freely.

A Light DOM component projects only the children it has when it is built and takes nothing the framework adds later, so a framework that changes the children after that works against nodes that have moved, and new ones stay outside the slots (`unplaced-child`).

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
| `set(patch)` / `set(s => patch)` | **The only entry point for changing data**: shallow-merges the patch, updates the automatic bindings synchronously, then calls `render` |
| `render(view, changed)` | Override it to handle updates other than automatic binding |
| `batch(fn)` | Combine multiple `set` calls: after `fn` finishes, the update runs once and `render` is called once |
| `derive` option | Derived values, usable directly by `{{ }}`, `data-if`, and `render`, recomputed after every state change with **no dependency tracking** |

- `set` does nothing when no field changes under `Object.is`, and `render` is not called.
- A prop setter works the same way. So code outside the component that changes a field of an object prop in place (`el.item.qty = 5`) renders nothing; assign a new object (`el.item = { ...el.item, qty: 5 }`).
- `render`'s `view` is `state`, props and the derived values. `changed` holds the names of those that changed this time, all of them on the first render.
- Use `changed.has("x")` to skip the parts that did not change. Annotate it with the names you check, such as `changed: ReadonlySet<"items" | "visible">`, so tsc reports a misspelled name.
- Each `derive` function takes one argument, the state and props merged (read-only). It cannot read another derived value, so share a calculation as a plain function.

**Automatic binding**: `{{ name }}` and `data-if="admin"` map to the same-named state field or derived value, and are written when its value changes. `data-if` shows the block based on truthiness.

**Names are checked by tsc**: when the HTML uses a name that neither `state` nor `derive` has, `class X extends Component(...)` reports an error that lists the missing names (`missingStateKeys: "name"`).

Lists (`data-each`) are not bound automatically, because the key and how each item is filled are yours to decide; use `replace` in `render`.

How updates run (the reasons are in [Design](design.md#design-decisions)):

- When `set` returns, the view is already updated. To combine updates, use `batch`.
- `render` re-runs as a whole on every change. For large lists, skip redraws with `changed` and enable `skipUnchanged` on `replace` ([Lists](lists.md#lists)).
- `set` may be called inside `render`; it is processed in another round after the current one ends. After 50 rounds that do not settle, a `render-loop` error is thrown.
- `state` is optional: without it, use `refs`, `text`, `show`, `bind` and `createStore` directly.
- Once a component has any of `state`, `props` or `derive`, every `{{ hole }}` and `data-if` outside a `<template data-each>` must name one of them; tsc reports any other name.
- Holes inside a list item belong to the item and are filled by `replace` ([Lists](lists.md)). To show store data in a component with `state`, copy it into state in the `bind` callback ([Recipes](recipes.md#showing-data-from-a-store)).

**Read-only all the way down**: `state`, `props`, the `view` passed to `render` and the argument of each `derive` function are typed `DeepReadonly`, so arrays and objects inside them cannot be changed in place.

`this.state.items[0].done = true` or `this.state.items.push(x)` is a tsc error. An object changed in place keeps its identity, and lists and child props compare by reference, so they would not update. Pass new objects instead: `this.set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, done: true } : i)) }))`.

Elements and other DOM objects, events, `Storage`, `History`, functions, dates, regular expressions and promises inside them keep their own type. When you annotate `render`'s `view` or a helper that takes the state, use read-only types: `readonly Item[]`, or `DeepReadonly<State>` from `@nativele/ts-dom`.

A prop with no sensible default, such as an object the parent always gives, is declared with `null`: `props: { message: null as Message | null }`. Its type then says it can be absent, so `tsc` makes every use handle `null`. An interface the element implements types it the way the element gives it, `message: DeepReadonly<Message> | null`; assigning a plain `Message` to it still compiles.

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

Write a value only when it differs. A hole skips a text that is the same, and `skipUnchanged` skips a list row whose item is the same object, but a direct write does not:

- writing an `<img>` or `<iframe>` `src` again reloads it;
- writing a `contenteditable` element's content, or a form control's value, while the user types moves the caret.

So show changing text through a hole or `derive`, and compare before a direct write: `if (this.refs.frame.src !== view.url) this.refs.frame.src = view.url`.

## Events: data-on-*

HTML writes only the event name and the method name; the logic is in TS:

```html
<form data-on-submit="add">…</form>
<template data-each="items"><li><button data-on-click="removeItem">✕</button></li></template>
```

```ts
add(e: SubmitEvent) { e.preventDefault(); … }
removeItem(e: MouseEvent, hit: EventHit) { this.set((s) => ({ items: s.items.filter((i) => i.id !== hit.key) })); }
```

- The method receives `(event, hit)`. `hit.el` is the element carrying the `data-on-*`.
- Inside a list item, `hit.key` is that item's key and `hit.item` the data last passed to `update`. This also holds for events a child component inside the item emits.
- `hit.key` and `hit.item` are untyped and optional. In a handler for list items, name the item type and key field, `hit: EventHit<Todo, "id">`, to type `hit.item` as `Todo` and `hit.key` as `Todo["id"]`.
- For extra parameters, put them in `data-*` attributes and read `hit.el.dataset` in the method.
- **Event delegation**: the listeners for an event type are attached once at the component root, so a longer list adds no listeners and adding or removing items needs no rebinding.
- Only events that reach the root are handled. An element of the template that is moved out of the component, such as a `<dialog>` appended to `document.body`, no longer triggers its `data-on-*`, with no error. Keep it inside, use the native behavior (`<button formmethod="dialog">`), share the state through a store, or listen on that element with `this.on(el, ...)`.
- Each dispatch is handled by whether it bubbles, not by its name. A non-bubbling one (`focus`, `blur`, `mouseenter`, an event emitted without `bubbles: true`) is caught in the capture phase and handled only on its target.
- A bubbling one calls the handler methods from the inside out in the bubble phase, so a `stopPropagation()` below a handler, or in an inner handler, stops the chain.
- **Only elements in the component's own template count**: content a user puts into a slot does not trigger anything even if it has `data-on-click`.
- Only a method name may be written; `add(1)` and `a.b` cause an error at codegen time.
- A method name must not collide with DOM built-in methods or ts-dom members (for example `remove`, `click`, `focus`, `set`, `render`), which it would override. Codegen reports the collision and suggests renaming.
- **tsc checks that the method exists**: `define(name, Class)` reports an error listing each method the HTML references that is not a public member of the class (`missingHandlers: "name"`). The check runs again when the element is connected and throws a clear runtime error.
- Event names must be lowercase (HTML attributes are case-insensitive); for mixed-case events such as `DOMContentLoaded`, use `this.on()` instead.

### Typing the event parameter

Codegen records the tag and event each handler is bound to, and `define()` checks that the handler's first parameter accepts the event it receives there:

| Bound to | The handler receives |
|---|---|
| `data-on-<event>` on a child component tag whose class declares `<event>` in `emits` | `EmitEvent<Child, "<event>">` (`CustomEvent<Detail>`) |
| Any other `data-on-<event>` whose element has an `on<event>` property | That property's event: `onenterpictureinpicture` on a `<video>` is `PictureInPictureEvent` |
| Any other `data-on-<event>`, on a native element or as a native event on a component tag | The type `HTMLElementEventMap` lists: `click` is `MouseEvent`, `keydown` `KeyboardEvent`, `submit` `SubmitEvent` |
| A name none of them declares | Not checked: type the parameter as the event the handler expects, `CustomEvent<Detail>` or `EmitEvent<Child, "<event>">` |

- `click` is `PointerEvent` in recent DOM types, which a `MouseEvent` parameter accepts.
- A name none of them declares is, for example, a bubbling event of a child caught on a wrapper, or a third-party element's event no map declares. A third-party element's events are typed as in [Custom elements from other libraries](#custom-elements-from-other-libraries).

A parameter that does not accept the event is a tsc error at `define()` that names the method and the event type it receives (`wrongHandlerParameters: { onSaved: CustomEvent<{ id: number }> }`). `ts-dom check` reports it as `handler-event-type` at the `data-on-*` attribute.

- A handler bound to several events or tags must accept all of them, leaving out the bindings no source declares.
- `Event`, or no parameter, always compiles. A known event typed `Event`, such as `change`, still rejects a narrower parameter such as `InputEvent`.
- The second parameter, `hit`, is not checked.

The check compares the parameter itself, because TypeScript compares method types bivariantly and would let a parameter narrower than the event pass.

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
onName(e: EmitEvent<FormField, "field-input">) {   // event up: sent only to the direct parent of this tag
  this.set({ name: e.detail.value });
}
```

Composition needs three things, and ts-dom handles all of them:

- **Child components are loaded automatically**: for a tag used in a template, if a `define("tag", Class)` is in the scanned directories, `ts-dom gen` adds `import "./child.js"` to the generated `x.html.ts`. HTML is the single source of dependencies.
  - An `import type` of the child alone does not register the element.
  - Components outside the directories, or [from other libraries](#custom-elements-from-other-libraries), still need your own import.
- **Child component types**: `ts-dom gen` generates `ts-dom-tags.ts`, which registers the components in `HTMLElementTagNameMap`. For `<form-field data-ref="name">`, `refs.name` is `FormField`, so tsc checks its prop names and types, and its methods.
  - `gen` follows `Class` from `define()` through the imports to the file that declares it. The class must be exported there; the `define()` call may be in another file.
  - Like `.html.ts`, it is generated: do not edit it, and most projects do not commit it ([Setup](tooling.md#installation-and-setup)).
- **Slots can cross layers**: for content the parent puts into a child component's slot, its `{{ }}` belongs to the parent and is updated by the parent; `data-on-*` is also handled by the parent, and the child does not catch it by mistake.

"Template fragment include" is not provided: it would become a template-language feature. To share a piece of structure, make it a component.

### Custom elements from other libraries

A template can use a custom element from another library (a date picker, a chart) like any other tag. The tools know only what its package declares.

In the table, a Nativele component is one in the scanned folders. Lint also reads those of the [Nativele component packages](tooling.md#lint-optional) the package depends on.

| | A Nativele component | A custom element from another library |
|---|---|---|
| Registering | `ts-dom gen` imports its module from the generated `x.html.ts` | Not imported: import the library once, before the element is used (in the app's entry, or in the module of the component that uses it). With a manifest (below), a tag one or two edits from one of its tags is reported as `unknown-custom-element` (`<wa-buton>`) |
| `refs` | Typed as its class, through `ts-dom-tags.ts` | Typed by its entry in `HTMLElementTagNameMap`; a tag the map does not list is `HTMLElement` |
| `data-on-<event>` | Its `emits` type the handler: `EmitEvent<Child, "event">` | Write the event name the element dispatches (lowercase; a mixed-case name goes through `this.on()`, see [Events](#events-data-on-)). The handler receives the type `HTMLElementEventMap` lists for that name; a name it does not list is not checked |
| Attributes, events and slots in lint, package with a custom elements manifest (the `customElements` field of its `package.json`) | `unknown-prop`, `invalid-prop-value`, `unknown-event` and `unknown-slot` check them against its `props`, `emits` and template | The same rules check them against the manifest of the template's package or one of its dependencies: attribute names, string-literal values (`variant="brandd"`), `="false"` on a boolean attribute, numbers, event names and slot names ([Custom elements manifests](tooling.md#lint-optional)) |
| Attributes, events and slots in lint, package without a manifest | As above | Not checked: `unchecked-custom-elements` lists the tag |
| `data-on-click` in the accessibility check | `click-semantics` reports it when the component's template has no operable element | Not checked on its own tag; content around it gets `unchecked-content` ([ARIA checks](tooling.md#aria--accessibility-checks)) |

When the package does not declare its tag and events, declare them in any module of your program:

```ts
interface VendorPicker extends HTMLElement {
  value: string;
  open(): void;
}

declare global {
  interface HTMLElementTagNameMap {
    "vendor-picker": VendorPicker;
  }
  interface GlobalEventHandlersEventMap {
    "vendor-change": CustomEvent<{ value: string }>;
  }
}

export {};
```

Then `<vendor-picker data-ref="picker" data-on-vendor-change="onPick">` gives `this.refs.picker` the type `VendorPicker`, and `define()` checks that `onPick` accepts `CustomEvent<{ value: string }>`.

A declaration typed `any` counts as no declaration, so it neither passes nor switches off a check by accident:

- A tag map entry typed `any` gives `HTMLElement`.
- An event map entry, an `on<event>` property or its listener parameter typed `any` leaves the event to the next source, or unchecked.
- A `data-prop` property typed `any` takes items as an element from elsewhere does: any object with the `data-key` field.
- A `CustomEvent` or `MessageEvent` whose `detail` or `data` is `any`, as in a bare `CustomEvent`, is checked to be that event with its payload unchecked. The handler may name any `CustomEvent<Detail>`, and an error names it `CustomEvent<unknown>`.

Like a Nativele component tag, the element is not one of the typed controls of a form's `elements` ([Reading a form](#reading-a-form)).

The declaration gives lint none of the element's attributes, events or slots, so `unchecked-custom-elements` lists the tag as declared only in TypeScript. Its causes and fixes are in [Lint](tooling.md#lint-optional).

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
- The parent's handler types its parameter as `EmitEvent<FormField, "field-input">` (`CustomEvent<{ value: string }>`). `define()` checks it against the tag and event the HTML binds the handler to ([Typing the event parameter](#typing-the-event-parameter)).
- In `EmitEvent`, a name the component does not declare resolves to `never`, so reading `.detail` fails with `Property 'detail' does not exist on type 'never'`.

### Element types for framework declarations

A framework's template type checker (TSX, `vue-tsc`, `svelte-check`) learns the Nativele tags from a declaration built on the element types that `ts-dom-tags.ts` registers in `HTMLElementTagNameMap`. Two members of a component that uses `props` or `emits` carry what such a declaration needs:

| Member | Type |
|---|---|
| `props` | The props, read-only: `FormField["props"]` is `{ readonly label: string; readonly value: string; readonly error: string }`, and its keys are the prop names |
| `"~emits"` | Optional and type-only (it does not exist at runtime): maps each event name declared in `emits` to its `detail` type, `NonNullable<FormField["~emits"]>` is `{ "field-input": { value: string } }` |

### Safeguards in Types and at Runtime

| Problem | Safeguard |
|---|---|
| Modifying a prop with `set()` inside the component | The type of `set` does not include props; a clear error is thrown at runtime |
| `emit` of an undeclared event, wrong data type, or missing data that should be provided | tsc reports an error; an undeclared event throws an error at runtime |
| `state` / `props` / `derive` with the same name | tsc reports an error (`conflictingKeys`); an error is thrown when `Component()` is called |
| A prop name that is the same as a member of `HTMLElement` or ts-dom (`title`, `hidden`, `render`…) | tsc reports an error (`reservedPropNames`); an error is thrown at runtime |
| `emits` with the same name as a native event (`click`, `input`…) | tsc reports an error (`nativeEventNames`); an error is thrown at runtime |
| The parent gives the child a prop with a wrong name or type | tsc reports an error (types come from `HTMLElementTagNameMap`) |
| A handler's parameter does not accept the event the HTML binds it to | tsc reports an error at `define()` (`wrongHandlerParameters`) |
| `any` in the contract (details below) | tsc reports an error at `Component()` or `define()` (`anyInContract`); `ts-dom check` reports it as `any-in-contract` |

`any` in the contract is reported in these places; `unknown` is accepted:

- A field of `state` or `props`, a derived value or an emitted detail typed `any`, including an inferred `any`, as from `JSON.parse`.
- `any` inside the arrays, tuples, plain objects, index signatures, Maps and Sets the component declares. Elements, events, `Window`, `Storage`, functions, dates, regular expressions and promises it holds are not looked into.
- A handler or its first parameter typed `any`, and a template typed `any`.

The tsc error names the place as the property access that reaches it: `"props.item"`, `"state.rows[]"`, `"state.cache[key]"`, `'state["a.b"]'`, `"this.onPick(event)"` for the parameter, `"this.onPick"` for the handler, `"template"`. `ts-dom check` reports it at the declaration, the `data-on-*` attribute or the `Component(...)` call.

### Avoiding Layer-by-Layer Passing (lint: `ts-dom/data-flow`)

Re-emitting events and passing props down layer by layer (prop drilling and emit chains) is a common problem in Vue, held back only by habit. Here, events do not bubble by default, and lint warns about the patterns that pass data through layers:

| Id | Detection |
|---|---|
| `prop-forwarding` | Assigning your own prop as-is to a child component (`this.refs.kid.name = v.name`) |
| `emit-forwarding` | A method that handles a child event only `emit`s it again |
| `props-mutation` | Assigning to props inside the component (`this.count = …`) |

The same `data-flow` group checks the parent's HTML against each child's `props`, `emits` and template, where `tsc` checks `refs.child.prop` and `emit()` in TypeScript:

- the attributes, events and slots on a child's tag (`unknown-prop`, `invalid-prop-value`, `unknown-event`, `unknown-slot`)
- custom element tags and event names on native elements (`unknown-custom-element`, `custom-event-on-native`, `unknown-native-event`)
- form control writes in `render()` (`unguarded-input-value`)
- a constructor that changes the element itself (`constructor-host-change`), which makes a browser create an unknown element instead
- an element the class builds with `document.createElement` and gives fixed text or a fixed attribute (`static-markup-in-code`), structure the template can hold
- state or a prop that holds DOM nodes (`dom-node-in-state`), a copy of what the DOM holds

`npx ts-dom rules` lists every rule, and `npx ts-dom rules --explain=<id>` explains one with an example. The tables in [Lint](tooling.md#lint-optional) cover what each rule reads.

A tag lint has no single definition of is not checked, and `unchecked-custom-elements` lists it once per run; [Lint](tooling.md#lint-optional) gives each cause with its fix. How an app decides where each piece of state lives is in [Architecture](architecture.md#where-state-lives).

Recommended practices:

- **Data and events cross only one layer**: the parent owns the data and passes props down, and the child notifies with events.
- **Data shared across many layers uses a shared store**: put `createStore` in a separate module, and have the components that need it import it directly and subscribe with `this.bind(store, fn)`, so the intermediate layers do not need to know about it or forward it.
- When an event has to cross two layers, handle it explicitly in the middle layer (it has its own logic) instead of forwarding it as-is. Re-emitting it from a `this.on()` listener is the same chain, which lint cannot see.

```ts
// session.ts — components at any depth can use it directly, no layer-by-layer passing
export const session = createStore({ user: "Ada" });
// deep component
connected() { this.bind(session, (s) => (this.text.user = s.user)); }
```

Enable it the same way as other lint rules: `"ts-dom/data-flow": ["warn", { ignore: [] }]`, or the CLI `npx ts-dom lint` (which also shows data flow warnings; adding `--strict` makes the exit code 1).

### Reading a Form

A `data-ref` on a `<form>` is typed with the controls the template puts inside it, so a form needs one ref, not one per field: `this.refs.form.elements.<name>` is each control by its `name` or `id`, typed by its tag, and a misspelled name is a tsc error.

```html
<form data-ref="form" data-on-submit="save">
  <label>Fee <input name="fee" type="number" /></label>
  <label>Tags <select name="tags" multiple>…</select></label>
  <label><input type="radio" name="plan" value="basic" /> Basic</label>
  <label><input type="radio" name="plan" value="pro" /> Pro</label>
  <label><input type="checkbox" name="gift" /> Gift</label>
</form>
```

```ts
save(e: SubmitEvent) {
  e.preventDefault();
  const { fee, tags, plan, gift } = this.refs.form.elements;
  const amount = fee.valueAsNumber;                              // fee: HTMLInputElement
  const picked = [...tags.selectedOptions].map((o) => o.value); // tags: HTMLSelectElement
  const chosen = plan.value;                                    // plan: RadioNodeList, the checked radio's value
  const wrap = gift.checked;                                    // gift: HTMLInputElement
}
```

| Controls with that name or id in the form | Type |
|---|---|
| One `<input>`, `<select>`, `<textarea>`, `<button>`, `<output>`, `<fieldset>` or `<object>` | Its element type (`HTMLInputElement`, ...) |
| Several (a radio group, repeated checkboxes) | `RadioNodeList` (`.value` is the checked radio's value; iterate it for the checkboxes) |
| Inside a `data-if` element or `<slot>` fallback, so possibly not in the document | The type above, or `undefined` |

The rest of `HTMLFormElement` is unchanged (`elements.length`, `namedItem()`, iteration, `reset()`, `requestSubmit()`). The type only describes what the browser already returns; nothing changes at runtime.

Codegen sees only the form's own template, so these controls are not typed:

- a custom element, a [form control of your own](recipes.md#a-form-control-of-your-own) included
- controls inside a child component's tag or a `data-each` item, which come from another template or exist once per item
- `<input type="image">`, which the browser leaves out of `elements`
- a name the collection hides behind its own members (`length`, `item`, `namedItem`, `toString`, ...)
- a control inside the form whose `form` attribute names another form
- a control outside the form that joins it with `form="id"`

Read those through their own `data-ref`, or with `elements.namedItem("name")`.

### A Small Reminder About Form Inputs

When writing data back to an `<input>` in `render`, first compare whether the value is the same: when data returns to the child component through "input → emit → parent → props", writing the same value again makes the cursor jump to the end.

```ts
if (changed.has("value") && this.refs.input.value !== v.value) this.refs.input.value = v.value;
```

The lint rule `unguarded-input-value` (in the `data-flow` group) reports a `render()` that writes an `<input>`, `<textarea>` or `<select>` value without this comparison. `npx ts-dom rules --explain=unguarded-input-value` shows which comparisons count as a guard.

Writing a value in an event handler, such as clearing a field after submit, is fine and not reported.

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

There is no dependency tracking: after `set`, all subscribers are called. A value that is the same under `Object.is` sends no notification.

`bind(source, callback)` calls the callback at once with `source.get()`, then with every value `subscribe` delivers, and unsubscribes when the element is removed.

- A `bind` made in `connected()` is made again on re-insertion, and then delivers the current value at once.
- A `bind` made elsewhere, such as in the constructor, ends on removal and does not come back.

`this.bind` also accepts a read-only source with only `get` and `subscribe`. Its parameter is the exported type `ReadableStore<T>` (`Pick<Store<T>, "get" | "subscribe">`), which can type a source you pass around.

The source's `subscribe` must return the function that unsubscribes, and must not call the listener when it subscribes. A store whose `subscribe` does, such as a nanostores atom, calls the callback twice at connect: pass `{ get: atom.get, subscribe: atom.listen }` instead.

`createStore` is a small utility for when the `state` option is not used; you may also manage state yourself and write to `refs` / `text` directly. When you need automatic binding and `render`, use `state` instead.
