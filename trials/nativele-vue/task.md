Build a small inventory screen in this Vue app, using Nativele components for the inventory widgets and Vue for the page around them. The project is the `create-vite` `vue-ts` starter with `@nativele/ts-dom` already installed; replace the starter's content of `src/App.vue` with the inventory screen and keep the app mounted from `src/main.ts`.

What to build:

- Three Nativele components in `src/nv/`, each as an `x.html` template plus an `x.ts` module: `nv-inventory-item`, `nv-qty-input` and `nv-inventory-summary`.
- `nv-inventory-item` shows one item: its name, the text `low stock` while its quantity is below the `lowThreshold` prop, and a button that selects the item. It has a named slot `badge`, where the Vue page puts a `<span slot="badge">out of stock</span>` only while the item's quantity is 0 (rendered with `v-if`, so Vue adds and removes it).
- The page keeps the items in Vue state and renders them with a keyed `v-for`, with a button that reverses their order.
- Selecting an item shows its name on the page and counts the selections. The selected item's quantity is edited with `nv-qty-input`, which takes the place of `v-model`: a value down, an event up, and the Vue state is the source of truth.
- `nv-inventory-summary` shows the total quantity of all items. It reads the total from a Nativele store (`createStore`) that the page updates whenever a quantity changes. The page shows it inside `<KeepAlive>` with a button that hides and shows it; while it is hidden, quantities can still change, and it shows the current total when it comes back.
- The page also renders a small Vue single-file component of your own, written in kebab-case in the template, so that Vue components and Nativele tags work side by side.
- Template types: the `.vue` templates must type-check the Nativele props and events, so that a wrong prop type or a wrong use of an event's `detail` is a `vue-tsc` error.
- `npm run build` must work on a clean checkout, where the generated files do not exist yet.

When you are done, every Verify command of the Skill must give its expected output.

## Contract

The checks rely on these names and behaviors only; everything else is up to you.

- The app is served by `npx vite` and mounted from `src/main.ts` with `src/App.vue` as the root component.
- The Nativele components are in `src/nv/`, and every `ts-dom` command is run on that folder (`npx ts-dom check src/nv`).
- Initial items, in this order: `{ id: 1, name: "apple", qty: 3 }`, `{ id: 2, name: "pear", qty: 0 }`, `{ id: 3, name: "plum", qty: 7 }`.
- `nv-inventory-item`, one element per item, in the order of the Vue state:
  - prop `item`, an object `{ id: number; name: string; qty: number }`, set as a property (the element has no `item` attribute);
  - prop `lowThreshold`, a number, set to `2` on every item from the template as a property (the element has no attribute for it);
  - shows the item's name, and `low stock` exactly while `item.qty < lowThreshold`;
  - a slot named `badge`; the page puts `<span slot="badge">out of stock</span>` in it exactly while `item.qty === 0`;
  - contains a button whose accessible name is `Select`; clicking it emits the event `item-select` from the `nv-inventory-item` element, once, with `detail` `{ id: number }`, the item's id.
- A button with the accessible name `Reverse order` reverses the order of the items; Vue moves the same elements (keyed `v-for`).
- The page shows `Selected: none` before any selection, then `Selected: <name>` of the selected item, and `Selections: <n>`, the number of `item-select` events handled so far.
- `nv-qty-input` is rendered only while an item is selected, one element:
  - prop `value`, a number, the selected item's `qty`, set as a property;
  - contains one `<input type="number">`; typing a number into it emits `value-change` from the `nv-qty-input` element with `detail` `{ value: number }`, and the page sets the selected item's `qty` to it.
- `nv-inventory-summary`, one element, shows `Total: <n>`, the sum of every item's `qty`. A button with the accessible name `Toggle summary` hides it and shows it again inside `<KeepAlive>`: while hidden the element is not in the document, and when shown again it is the same element and shows the current total.
- A Vue SFC used in kebab-case in `App.vue` renders the text `Inventory footer`.
- The browser console shows no errors and no `[Vue warn]` lines while the page is used.
