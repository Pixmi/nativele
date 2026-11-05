---
name: nativele-state-management
description: "Decide where state lives in an app built with Nativele (component state, a shared createStore, or an existing Zustand, Redux Toolkit or nanostores store) and connect external stores to this.bind with a small adapter: selectors that limit re-rendering, actions and dispatch from event handlers, unsubscribing when a component is removed. Use when a project depends on @nativele/ts-dom and on zustand, @reduxjs/toolkit, redux or nanostores, or when components need to share data."
metadata:
  tier: official
  nativele: ">=0.5.2 <0.6.0"
  verified: "2026-11-05"
  tools: "zustand@5.0.16 @reduxjs/toolkit@2.14.0 redux@5.0.1 nanostores@1.5.5 vite@8.3.6 typescript@7.0.2 create-vite@9.3.4"
  author: "Nativele maintainers"
  detects: "zustand @reduxjs/toolkit redux nanostores"
---

# Nativele state management

## When to use

- An app that already uses Nativele (`@nativele/ts-dom`) has to decide where a piece of data lives: in one component, in a store shared by several components, or in a state library.
- The app already keeps state in Zustand, Redux Toolkit, Redux or nanostores, and Nativele components have to show it and change it.
- Signals: `zustand`, `@reduxjs/toolkit`, `redux` or `nanostores` next to `@nativele/ts-dom` in `package.json`; a value passed down through several layers of components only so a deep one can show it.
- The starting point is a Vite app set up with Nativele by `nativele-vite` (`npx ts-dom skills add nativele-vite`), for example one started with `npm create vite@latest -- --template vanilla-ts`. This Skill does not teach the state libraries themselves, and it does not write the components (`nativele-core`).
- Not for React, Vue or another framework's own bindings to these libraries (`react-redux`, Zustand's hooks): here the Nativele components subscribe themselves.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.5.2 |
| zustand (`zustand/vanilla`) | 5.0.16 |
| @reduxjs/toolkit | 2.14.0 |
| redux | 5.0.1 (installed by `@reduxjs/toolkit`; a `legacy_createStore` store with the adapter was checked by hand with `tsc` and Node, the example project does not run it) |
| nanostores | 1.5.5 (`atom` only) |
| vite | 8.3.6 |
| typescript | 7.0.2 |
| create-vite (`vanilla-ts` template, the starting point) | 9.3.4 |

Verified on 2026-11-05 in Google Chrome 148 with the example project in the Nativele repository (`skills/nativele-state-management/example`), which CI runs again when the example or the library changes and once a month. With a different major version of a state library, treat the adapter and every limitation about that library as unverified.

## Set-up

1. Decide where each piece of data lives:

   | The data is | Put it in | Why |
   |---|---|---|
   | used by one component, or by it and the children it passes props to (a field's text, open or closed, the selected row) | the component's `state` | it is changed with `this.set` and rendered by the component that owns it |
   | read or changed by components that are not parent and child, or would be passed through layers that do not use it (the signed-in user, a theme) | a `createStore` from `@nativele/ts-dom` in its own module | every component that needs it imports it and binds it; the layers between them do not know about it |
   | already kept in Zustand, Redux or nanostores, or shared with code that is not Nativele, or in need of what the library offers (its middleware, devtools, persistence) | that library's store, connected with the adapter below | the store stays the one source; Nativele components only read it and send it actions |

   Do not move an existing Zustand or Redux store into `createStore` to use Nativele, and do not add a state library for data that `state` or `createStore` already holds.

2. Keep each store in its own module outside the components folder, for example `src/stores/`, and import it from the components that use it. `ts-dom check src/nv` runs `tsc` over the whole project, so it type-checks these modules too.
3. For Zustand and Redux, add the adapter below as `src/stores/from-store.ts`. `this.bind` takes an object with `get()` and `subscribe(fn)`, calls `fn` at once with `get()`, calls it again on every change, and ends the subscription when the element is removed (see the components guide). A Zustand or Redux store has `getState()` instead of `get()`, and a Redux listener gets no value, so neither can be passed as it is (limitations 1 and 2). The adapter reads the state itself, applies a selector, and calls back only when the selected value changes under `Object.is`:

   ```ts
   // src/stores/from-store.ts
   import type { ReadableStore } from "@nativele/ts-dom";

   export interface ExternalStore<S> {
     getState(): S;
     subscribe(listener: () => void): () => void;
   }

   export function fromStore<S, T>(store: ExternalStore<S>, select: (state: S) => T): ReadableStore<T> {
     return {
       get: () => select(store.getState()),
       subscribe(fn) {
         let last = select(store.getState());
         return store.subscribe(() => {
           const next = select(store.getState());
           if (Object.is(next, last)) return;
           last = next;
           fn(next);
         });
       },
     };
   }
   ```

4. In each component, make one source per value it shows (`fromStore(store, (s) => s.items.length)`, at module level), bind it in `connected()`, and copy the value into `state` with `this.set`. Bind in `connected()`, never in the constructor (limitation 6).
5. Change the store from the component's `data-on-*` handlers: call a Zustand action (`cart.getState().add("apple")`), dispatch a Redux action (`store.dispatch(increment())`), or set a nanostores atom (`$theme.set("dark")`). The store notifies synchronously, so the view has changed when the handler returns.
6. For a nanostores atom, bind `{ get: $theme.get, subscribe: $theme.listen }`, not the atom itself (limitation 3).

## Example

The stores:

```ts
// src/stores/cart.ts (Zustand)
import { createStore } from "zustand/vanilla";

export interface CartState {
  items: string[];
  note: string;
  add(item: string): void;
  setNote(note: string): void;
}

export const cart = createStore<CartState>()((set) => ({
  items: [],
  note: "",
  add: (item) => set((s) => ({ items: [...s.items, item] })),
  setNote: (note) => set({ note }),
}));
```

```ts
// src/stores/counter.ts (Redux Toolkit)
import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";

const counter = createSlice({
  name: "counter",
  initialState: { value: 0 },
  reducers: {
    increment: (state) => {
      state.value += 1;
    },
  },
});

const filter = createSlice({
  name: "filter",
  initialState: "all" as "all" | "done",
  reducers: { setFilter: (_state, action: PayloadAction<"all" | "done">) => action.payload },
});

export const store = configureStore({ reducer: { counter: counter.reducer, filter: filter.reducer } });
export const { increment } = counter.actions;
export const { setFilter } = filter.actions;
```

```ts
// src/stores/theme.ts (nanostores)
import { atom } from "nanostores";

export const $theme = atom<"light" | "dark">("light");
```

```ts
// src/stores/session.ts (Nativele)
import { createStore } from "@nativele/ts-dom";

export const session = createStore({ user: "guest" });
```

A component that shows one slice of the Zustand store, and one that changes it:

```html
<!-- src/nv/cart-badge.html -->
<span>{{ count }} in cart</span>
```

```ts
// src/nv/cart-badge.ts
import { Component, define } from "@nativele/ts-dom";
import { cart } from "../stores/cart.ts";
import { fromStore } from "../stores/from-store.ts";
import tpl from "./cart-badge.html.js";

const itemCount = fromStore(cart, (s) => s.items.length);

export class CartBadge extends Component(tpl, { state: { count: 0 } }) {
  override connected(): void {
    this.bind(itemCount, (count) => this.set({ count }));
  }
}
define("cart-badge", CartBadge);
```

```html
<!-- src/nv/cart-form.html -->
<button type="button" data-on-click="addApple">add apple</button>
<input data-ref="note" data-on-input="onNote" />
```

```ts
// src/nv/cart-form.ts
import { Component, define } from "@nativele/ts-dom";
import { cart } from "../stores/cart.ts";
import tpl from "./cart-form.html.js";

export class CartForm extends Component(tpl) {
  addApple(): void {
    cart.getState().add("apple");
  }
  onNote(): void {
    cart.getState().setNote(this.refs.note.value);
  }
}
define("cart-form", CartForm);
```

Typing a note changes `note` only, so `cart-badge` gets no callback and does not render.

A component that shows a Redux value and dispatches from a click:

```html
<!-- src/nv/counter-view.html -->
<b>{{ value }}</b>
<button type="button" data-on-click="increment">+1</button>
```

```ts
// src/nv/counter-view.ts
import { Component, define } from "@nativele/ts-dom";
import { fromStore } from "../stores/from-store.ts";
import { increment, store } from "../stores/counter.ts";
import tpl from "./counter-view.html.js";

const counterValue = fromStore(store, (s) => s.counter.value);

export class CounterView extends Component(tpl, { state: { value: 0 } }) {
  override connected(): void {
    this.bind(counterValue, (value) => this.set({ value }));
  }
  increment(): void {
    store.dispatch(increment());
  }
}
define("counter-view", CounterView);
```

A nanostores atom and a Nativele store, each bound directly:

```ts
// src/nv/theme-switch.ts (template: <button type="button" data-on-click="toggle">theme: {{ theme }}</button>)
export class ThemeSwitch extends Component(tpl, { state: { theme: "light" as "light" | "dark" } }) {
  override connected(): void {
    this.bind({ get: $theme.get, subscribe: $theme.listen }, (theme) => this.set({ theme }));
  }
  toggle(): void {
    $theme.set($theme.get() === "light" ? "dark" : "light");
  }
}
define("theme-switch", ThemeSwitch);

// src/nv/user-badge.ts (template: <span>{{ user }}</span>); another component calls session.set((s) => ({ ...s, user: "Ada" }))
export class UserBadge extends Component(tpl, { state: { user: "" } }) {
  override connected(): void {
    this.bind(session, (s) => this.set({ user: s.user }));
  }
}
define("user-badge", UserBadge);
```

`src/main.ts` imports every component module; `index.html` places the tags anywhere on the page (`<cart-badge></cart-badge>` in a section, `<user-badge></user-badge>` in the header), with nothing passed between them.

## Known limitations

1. **A Zustand or Redux store cannot be passed to `bind`.** `this.bind(cart, ...)` fails with `TS2741: Property 'get' is missing in type 'StoreApi<CartState>'`, and `this.bind(store, ...)` with a Redux store with `TS2345: ... Property 'get' is missing`. Use `fromStore`. A Zustand store could be bound whole as `{ get: cart.getState, subscribe: cart.subscribe }` (Zustand 5 passes the state to its listeners), but then see limitation 4.
2. **A Redux listener gets no value.** `{ get: store.getState, subscribe: store.subscribe }` fails with `TS2322: Type '(listener: ListenerCallback) => Unsubscribe' is not assignable ... Target signature provides too few arguments`: Redux 5 calls its listeners with no arguments. Use `fromStore`, which calls `getState()` itself.
3. **A nanostores atom passes the type check but calls back twice.** `this.bind($theme, fn)` compiles, and `fn` runs twice when the component connects, because nanostores' `subscribe` also calls the listener at once. Bind `{ get: $theme.get, subscribe: $theme.listen }`: `listen` does not call at once, so `fn` runs once on connect and once per change. Not verified: `computed`, `map` and other nanostores stores.
4. **Bind a selected value, not the whole store.** A whole store calls back on every change of any field. When the callback copies into `state`, `this.set` skips the render if nothing it copied changed (it compares each field with `Object.is`), but the callback still runs; a callback that writes `this.text`, `refs` or a list itself does that work every time. With `fromStore` and a selector, a change elsewhere in the store runs no callback and no render.
5. **A selector must return one value that stays the same when unchanged.** A selector that builds a new object or array (`(s) => ({ count: s.items.length })`) differs under `Object.is` every time, so it calls back on every change of the store. Select each value with its own `fromStore`, or select an object or array the store itself keeps (Zustand and Redux keep an unchanged slice as the same object).
6. **Bind in `connected()`.** When the element is removed, `bind` ends every subscription, and no store sends it updates. When the same element is inserted again, `connected()` runs, binds again, and the callback runs at once with the current value, so changes made while it was out show; it then gets each change once, not twice. A `bind` made anywhere else (the constructor, a field, code outside the component) ends on the first removal and is not made again.
7. **`createStore` is exported by both `zustand/vanilla` and `@nativele/ts-dom`.** Importing both into one module fails with `TS2300: Duplicate identifier 'createStore'`. Keep each store in its own module (step 2), or rename one import (`import { createStore as createZustandStore } from "zustand/vanilla"`).
8. **Store updates are synchronous.** A Zustand action, a Redux `dispatch` of a plain action and a nanostores `set` call `bind` callbacks before they return, so the view has changed when the handler ends.
9. Not verified: Zustand middleware (`subscribeWithSelector`, `persist`, `devtools`), RTK Query and auto-batched actions, Redux thunks, an equality function other than `Object.is`, and the state libraries' framework bindings.

## Verify

Run in the project:

```sh
npm run build                 # expect: ts-dom check: no issues, then ✓ built
npx ts-dom doctor src/nv      # expect: ts-dom doctor: the set-up looks right (info lines are suggestions)
```

`ts-dom check` type-checks the store modules and the adapter as well. To keep the checks of limitations 1 and 2 in the project, add a file the app never imports, with one wrong use per store under `// @ts-expect-error`:

```ts
// src/types-check.ts
import type { CartBadge } from "./nv/cart-badge.ts";
import { cart } from "./stores/cart.ts";
import { store } from "./stores/counter.ts";

export function typesCheck(el: CartBadge): void {
  // @ts-expect-error a Zustand store has getState, not get
  el.bind(cart, () => {});
  // @ts-expect-error a Redux store has getState, not get
  el.bind(store, () => {});
  // @ts-expect-error a Redux listener gets no value
  el.bind({ get: store.getState, subscribe: store.subscribe }, () => {});
}
```

If one of them stops being an error, `ts-dom check` reports `TS2578: Unused '@ts-expect-error' directive`.

In the browser, against `npm run dev`: click and type in each component and check that the bound components show the new value; remove a bound element (`el.remove()`), change its store, insert it again, and check that it shows the current value. To prove that a selector limits re-rendering, count calls by wrapping the component's prototype methods before acting, without changing the component:

```js
const proto = customElements.get("cart-badge").prototype;
for (const name of ["set", "render"]) {
  const original = proto[name];
  proto[name] = function (...args) { console.log(name); return original.apply(this, args); };
}
```

Then typing a note must log nothing for `cart-badge`, and adding an item must log `set` and `render` once each. The example project's [`verify.mjs`](https://github.com/Pixmi/nativele/blob/main/skills/nativele-state-management/example/verify.mjs) does these checks with Playwright for Zustand, Redux, nanostores and `createStore`, plus the `bind` contract itself (an immediate call, no call for an `Object.is`-equal set, nothing after removal), the nanostores double call, selectors that return a new object or a kept slice, and no console errors.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TS2741: Property 'get' is missing in type 'StoreApi<...>'` | a Zustand store passed to `bind` | `this.bind(fromStore(cart, (s) => s.x), ...)` |
| `TS2345: ... Property 'get' is missing in type '... Store<...>'` | a Redux store passed to `bind` | `fromStore(store, (s) => s.x)` |
| `TS2322: ... '(listener: ListenerCallback) => Unsubscribe' ... Target signature provides too few arguments` | Redux's `subscribe` passed to `bind` as it is | `fromStore`, which calls `getState()` |
| The callback runs twice when the component connects | a nanostores atom bound directly | bind `{ get: $a.get, subscribe: $a.listen }` |
| A component renders, or its callback runs, when an unrelated field changes | the whole store is bound, or the selector returns a new object | one `fromStore` per value, each returning a value the store keeps |
| A component stops updating after it was moved or removed and inserted again | `bind` was called outside `connected()` | call `this.bind` in `connected()` |
| `TS2300: Duplicate identifier 'createStore'` | `zustand/vanilla` and `@nativele/ts-dom` imported into one module | separate modules, or rename one import |
| `[missing-binding] "x" is used by {{ x }} ... but the component declares no state, prop or derived value of that name` | a template shows a store field the component has no `state` for | add the field to `state` and copy it in the `bind` callback |

## See also

- `bind`, `createStore` and the store contract: https://github.com/Pixmi/nativele/blob/main/docs/components.md#state-store-when-not-using-state
- Component `state`, `set` and `batch`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-and-view-state-optional
- Shared stores instead of passing through layers: https://github.com/Pixmi/nativele/blob/main/docs/components.md#avoiding-layer-by-layer-passing-lint-ts-domdata-flow
- Copying a store value into state: https://github.com/Pixmi/nativele/blob/main/docs/recipes.md#showing-data-from-a-store
- Moved elements, connecting and subscriptions: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#moving-items-connecting-and-subscriptions
- Setting Nativele up in Vite: `npx ts-dom skills nativele-vite`
