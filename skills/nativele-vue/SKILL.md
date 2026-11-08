---
name: nativele-vue
description: "Use Nativele web components inside a Vue 3 app: telling the template compiler which tags are custom elements, passing props, listening to events, replacing v-model, children and slots, lifecycle with v-for, v-if and KeepAlive, and SFC template types. Use when a project depends on vue and @nativele/ts-dom."
metadata:
  tier: official
  nativele: ">=0.7.0 <0.8.0"
  verified: "2026-11-08"
  tools: "vue@3.5.44 vite@8.3.6 @vitejs/plugin-vue@6.0.10 vue-tsc@3.3.14 typescript@6.0.3 @vue/tsconfig@0.9.1"
  author: "Nativele maintainers"
  detects: "vue"
---

# Nativele + Vue

## When to use

- The project renders with Vue 3 single-file components and wants to use components written with Nativele (`@nativele/ts-dom`), for example a design-system layer or widgets shared with non-Vue pages.
- Signals: `vue` and `@nativele/ts-dom` in `package.json`, `.vue` templates that render Nativele tags (`<nv-info-card>`).
- The starting point is a working Vue app, such as the one `npm create vite@latest -- --template vue-ts` makes. This Skill does not set Vue or Vite up.
- Not for Vue 2, and not for Vue's own `defineCustomElement` (that turns Vue components into custom elements; this Skill goes the other way). Not for writing the Nativele components themselves: use `nativele-core` (`npx ts-dom skills add nativele-core`).

Nativele components are native custom elements. Vue renders them like any other element; nothing wraps them.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.7.4 (the last agent trial) |
| vue | 3.5.44 |
| vite | 8.3.6 |
| @vitejs/plugin-vue | 6.0.10 |
| vue-tsc | 3.3.14 |
| typescript | 6.0.3 |
| @vue/tsconfig | 0.9.1 |

Verified on 2026-11-08 in Google Chrome 157, starting from `create-vite` 9.3.4 with the `vue-ts` template, and by an agent trial: a fresh agent did real work with only the Skill, and the result was checked independently. With a different major version of Vue, treat every step as unverified.

## Set-up

1. Keep the Nativele components in their own folder, for example `src/nv/`, each as `x.html` plus `x.ts`, written with the core Skill (`npx ts-dom skills add nativele-core`). Give every Nativele tag one prefix that no Vue component uses, for example `nv-` (`define("nv-info-card", InfoCard)`); step 4 depends on it.
2. Install: `npm i @nativele/ts-dom`.
3. The tsconfig that covers that folder must meet Nativele's requirements, `strict` among them (in the `vue-ts` template, `tsconfig.app.json` extends `@vue/tsconfig/tsconfig.dom.json`, which sets it). Check and adjust it with the TypeScript Skill (`npx ts-dom skills nativele-typescript`), which also says which TypeScript version `vue-tsc` needs.
4. Add the Nativele Vite plugin, and tell Vue's template compiler that the tags with the prefix are custom elements:

   ```ts
   // vite.config.ts
   import vue from "@vitejs/plugin-vue";
   import { defineConfig } from "vite";
   import { tsDom } from "@nativele/ts-dom/vite";

   export default defineConfig({
     plugins: [tsDom({ dirs: ["src/nv"] }), vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith("nv-") } } })],
   });
   ```

   Match the prefix only, never every hyphenated tag (limitation 1). Pass the same folder to every `ts-dom` command (`npx ts-dom check src/nv`), so there is one `ts-dom-tags.ts`, in `src/nv`.

5. Add `*.html.ts` and `ts-dom-tags.ts` to `.gitignore`: `ts-dom` writes them, and they are not committed.
6. Import every Nativele component module in `src/main.ts`, before `createApp(...).mount(...)`:

   ```ts
   // src/main.ts
   import "./nv/info-card.js";
   import "./nv/text-field.js";
   import { createApp } from "vue";
   import App from "./App.vue";

   createApp(App).mount("#app");
   ```

   Vue sets a binding as a property only when the element already has that property, which is true only after `define()` has run (limitation 2).

7. Add the template type declaration below as `src/nativele-vue.d.ts` (the template's `tsconfig.app.json` already includes `src/**/*.ts`). It reads the tag map that `ts-dom gen` writes (`ts-dom-tags.ts`), so every exported component gets typed props and events in SFC templates, and new components need no edit:

   ```ts
   // src/nativele-vue.d.ts
   import type { HTMLAttributes } from "vue";

   type NativeleTag = Extract<keyof HTMLElementTagNameMap, `${string}-${string}`>;
   type Camelize<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camelize<B>>}` : S;
   type NativeleProps<E> = E extends { readonly props: infer P } ? { [K in keyof P & keyof E]?: E[K] } : unknown;
   type NativeleEvents<E> = E extends { readonly "~emits"?: infer M }
     ? { [K in keyof NonNullable<M> & string as `on${Capitalize<Camelize<K>>}`]?: (event: CustomEvent<NonNullable<M>[K]>) => void }
     : unknown;
   type NativeleComponents = {
     [K in NativeleTag]: new () => {
       $props: HTMLAttributes & NativeleProps<HTMLElementTagNameMap[K]> & NativeleEvents<HTMLElementTagNameMap[K]>;
     };
   };

   declare module "vue" {
     interface GlobalComponents extends NativeleComponents {}
   }
   ```

   The component class must be exported and passed to `define()` in a folder that `ts-dom gen` scans, so it appears in `ts-dom-tags.ts`. A template ref is typed from the same map: `useTemplateRef<HTMLElementTagNameMap["nv-info-card"]>("card")`.

8. Put `ts-dom gen src/nv &&` in front of the build script: `"build": "ts-dom gen src/nv && vue-tsc -b && vite build"`.

   On a clean checkout the generated files do not exist yet, so `vue-tsc -b` alone fails with `TS2307: Cannot find module './x.html.js'` (why the order matters: https://github.com/Pixmi/nativele/blob/main/skills/nativele-vite/SKILL.md#set-up).

## Example

A Nativele component with props and an event:

```html
<!-- src/nv/info-card.html -->
<span>{{ label }}</span>
<b>{{ count }}</b>
<i data-ref="itemName"></i>
<button type="button" data-on-click="pick">pick</button>
```

```ts
// src/nv/info-card.ts
import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./info-card.html.js";

export interface Item {
  id: number;
  name: string;
}

export class InfoCard extends Component(tpl, {
  props: { label: "", count: 0, item: null as Item | null },
  emits: { "item-select": event<{ id: number }>() },
}) {
  pick(): void {
    const item = this.props.item;
    if (item) this.emit("item-select", { id: item.id });
  }
  override render(view: { item: Item | null }): void {
    this.refs.itemName.textContent = view.item ? view.item.name : "-";
  }
}
define("nv-info-card", InfoCard);
```

A field that takes the place of `v-model`: a `value` prop down, a `value-change` event up.

```html
<!-- src/nv/text-field.html -->
<input data-ref="input" data-on-input="onInput" />
```

```ts
// src/nv/text-field.ts
import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./text-field.html.js";

export class TextField extends Component(tpl, {
  props: { value: "" },
  emits: { "value-change": event<{ value: string }>() },
}) {
  onInput(): void {
    this.emit("value-change", { value: this.refs.input.value });
  }
  override render(view: { value: string }): void {
    if (this.refs.input.value !== view.value) this.refs.input.value = view.value;
  }
}
define("nv-text-field", TextField);
```

Used from a Vue component:

```vue
<script setup lang="ts">
import { ref } from "vue";
import type { Item } from "./nv/info-card.js";

const count = ref(0);
const item = ref<Item>({ id: 1, name: "apple" });
const picked = ref<number[]>([]);
const text = ref("");
</script>

<template>
  <nv-info-card label="Fruit" :count="count" :item="item" @item-select="(e) => picked.push(e.detail.id)" />
  <nv-text-field :value="text" @value-change="(e) => (text = e.detail.value)" />
</template>
```

- `label`, `count` and `item` arrive as properties; the object is the same object Vue passed, and the element has no `item` attribute. Changing them from Vue state re-renders the Nativele component.
- `@item-select` uses the exact event name; `e.detail` is typed from the component's `emits`.

Children and slots: a `shadow: true` component takes Vue children directly; a Light DOM component (the default) takes one stable element per slot, with Vue changing only what is inside it.

```html
<!-- src/nv/shadow-card.html (and the same in src/nv/light-card.html) -->
<h2><slot name="title">Untitled</slot></h2>
<div><slot></slot></div>
```

```ts
// src/nv/shadow-card.ts
export class ShadowCard extends Component(tpl, { shadow: true }) {}
define("nv-shadow-card", ShadowCard);

// src/nv/light-card.ts
export class LightCard extends Component(tpl) {}
define("nv-light-card", LightCard);
```

```vue
<nv-shadow-card>
  <span v-if="showTitle" slot="title">{{ title }}</span>
  <p v-for="r in rows" :key="r.id">{{ r.text }}</p>
</nv-shadow-card>

<nv-light-card>
  <div slot="title"><span v-if="showTitle">{{ title }}</span></div>
  <div><p v-for="r in rows" :key="r.id">{{ r.text }}</p></div>
</nv-light-card>
```

## Known limitations

1. **`isCustomElement` must match only the Nativele tags.** Use the prefix from step 1.
   - With `(tag) => tag.includes("-")`, every kebab-case Vue component (`<hello-box>`, `<router-view>`) stops resolving: it renders as an empty unknown element, with no warning.
   - Without `isCustomElement` at all, Nativele tags still work, but Vue logs `[Vue warn]: Failed to resolve component: nv-info-card` for each tag in development.
2. **Define before mount.** Import every Nativele module before `mount()` (step 6).
   - A `:item` binding on an element that is not defined yet becomes the attribute `item="[object Object]"`, and the component gets `null` after `define()` runs.
   - When a module really is loaded later (a dynamic `import()`), bind object props with the property modifier, `.item="item"` or `:item.prop="item"`. The property is kept, and the component takes it over when it is defined.
3. **camelCase prop names in templates.** Write Nativele props as they are declared: `:selectedItem="item"`, `:maxCount="3"`. `vue-tsc` does not report a kebab-case name (limitation 10).
   - Vue sets a kebab-case binding (`:selected-item`) as an attribute, because the element has no property of that name.
   - A number or string still converts from the attribute; an object or array arrives as `"[object Object]"` and the prop stays `null`.
4. **Exact event names.** Name events in kebab-case and write that exact name after `@`.
   - On a custom element, Vue listens to the name exactly as written: `@item-select` hears `item-select`, and `@itemSelect` never hears it.
   - Nativele events do not bubble by default, so the listener goes on the element that emits.
5. **`v-model` does not work on a Nativele component.** Use a prop and an event, as `nv-text-field` above: `:value="text" @value-change="(e) => (text = e.detail.value)"`.
   - `v-model` compiles, `vue-tsc` accepts it and Vue logs no warning. It writes the first value into the element, but typing never updates the Vue state.
   - In the component, compare before writing the input's value, so the cursor does not jump ("A Small Reminder About Form Inputs" in the components guide).
6. **Light DOM slots and Vue children do not mix.** Use `shadow: true`, or one stable element per slot as in the example (https://github.com/Pixmi/nativele/blob/main/docs/components.md#slots-and-children-managed-by-a-framework).
   - When `v-if` or `v-for` changes the children of a Light DOM host with slots, the update throws and the slots show the wrong children.
   - The errors are `Cannot read properties of null (reading 'insertBefore')` and `Cannot set properties of null (setting '__vnode')`.
7. **Lifecycle follows the DOM.** Subscribe in `connected()`, as the lists guide says for moved items.

   | Vue action | What the element sees |
   |---|---|
   | keyed `v-for` reorders | the same element moves: `disconnected()` then `connected()`, props and Light DOM slot children kept, `bind` subscriptions restart |
   | `<KeepAlive>` deactivates | `disconnected()`; no store updates while inactive |
   | `<KeepAlive>` activates | the same element returns: `connected()`, and `bind` calls back at once with the current value |
   | `v-if` removes | `disconnected()`; subscriptions end |
8. **Object props change by a new object.** Replace the object in the state: `items.value[i] = { ...items.value[i], qty: value }`.
   - A Nativele prop renders again only when it receives a new value (`Object.is`).
   - Changing a field in place (`item.qty = 5`) updates Vue's state but not the element bound with `:item`. Measured: the element kept showing the old quantity.
9. **`<KeepAlive>` caches components, not elements.** To keep the same element and its state while it is hidden, put it in a small Vue component and keep that component alive: `<KeepAlive><summary-panel v-if="shown" /></KeepAlive>`, with the Nativele tag inside `SummaryPanel.vue`. A Nativele tag with `v-if` placed directly inside `<KeepAlive>` is created again each time it is shown.
10. **What `vue-tsc` checks.** In a template, mark an expected error with `<!-- @vue-expect-error -->`; `// @ts-expect-error` is rendered as text and suppresses nothing.
    - With the declaration from step 7, it reports a wrong prop type (`count="1"` on a number prop), a wrong object shape and a wrong use of `e.detail`.
    - It does not report an unknown prop name, an unknown tag with the prefix, a kebab-case prop name, `v-model`, or an event name whose case differs from the declared one.
11. Not verified: server-side rendering and hydration, Nuxt, `<Transition>` around Nativele elements, and Vue versions other than 3.5.

## Verify

Run in the project:

```sh
npx ts-dom check src/nv      # expect: ts-dom check: no issues
npx ts-dom doctor src/nv     # expect: ts-dom doctor: the set-up looks right
npx vue-tsc -b               # expect: no output
npx vite build               # expect: built
```

`ts-dom check` runs `vue-tsc` instead of `tsc` when the project's `package.json` lists `vue-tsc` (in `dependencies` or `devDependencies`) and it resolves from the project folder, so it also reports type errors in `.vue` files.

Prove that the declaration types props: keep a `.vue` file that the app never imports (such as `src/TypesCheck.vue`) with one wrong case per kind under `<!-- @vue-expect-error -->`:

```vue
<template>
  <!-- @vue-expect-error count is a number -->
  <nv-info-card count="1" />
  <!-- @vue-expect-error item has the wrong shape -->
  <nv-info-card :item="{ id: '1' }" />
  <!-- @vue-expect-error detail is { id: number } -->
  <nv-info-card @item-select="(e) => e.detail.name" />
</template>
```

`vue-tsc -b` passes only while each of these is an error; if the declaration stops working, it reports `TS2578: Unused '@ts-expect-error' directive`.

In the browser, against the dev server (production builds drop Vue warnings), check that:

- an element with an object prop has no attribute for it (`el.getAttributeNames()`), and `el.item` is the object;
- the listener runs once per event;
- a kebab-case Vue component still renders;
- the console has no errors or `[Vue warn]` lines.

A Light DOM component has no `<slot>` elements once rendered. Read a slot with `el.assignedNodes(name)`, where `""` is the default slot, and compare elements only, because Vue leaves comment and empty text nodes among the children.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TS2307: Cannot find module './x.html.js'` from `npm run build` on a clean checkout | `vue-tsc -b` runs before the generated files exist | start the script with `ts-dom gen src/nv &&`; for CI, `nativele-ci` |
| `[Vue warn]: Failed to resolve component: nv-info-card` | `isCustomElement` is missing, or does not match the tag | set it as in step 4, with the prefix your tags use |
| A kebab-case Vue component (`<hello-box>`, `<router-view>`) renders as an empty element, with no warning | `isCustomElement` matches every hyphenated tag | match only the Nativele prefix (`tag.startsWith("nv-")`) |
| An object prop shows `[object Object]`, or the element has an attribute holding it | the element was not defined when Vue rendered it, or the prop is written in kebab-case | import the module before `mount()`; write `:selectedItem`, not `:selected-item`; for a module loaded later, use `.item` |
| The event listener never runs | the name after `@` differs from the emitted name (`@itemSelect` for `item-select`) | write the exact event name |
| The Vue value bound with `v-model` never changes | `v-model` does not work on custom elements like this | a prop plus an event (limitation 5) |
| `Cannot read properties of null (reading 'insertBefore')` or `(setting '__vnode')`, children in the wrong slot | Vue changed children of a Light DOM component with slots | `shadow: true`, or a stable element per slot |
| `TS7006: Parameter 'e' implicitly has an 'any' type` in an `@item-select` handler, wrong props not reported | the declaration is missing, or the component class is not exported | add `src/nativele-vue.d.ts`, export the class, run `ts-dom gen` |
| `TS1117: An object literal cannot have multiple properties with the same name` | two spellings of one event on the same element (`@picked-one` and `@pickedOne` are both `onPickedOne` in the types) | keep one, with the exact event name |
| `ts-dom check` reports `TS2307: Cannot find module './App.vue'` | `vue-tsc` is not installed, so `ts-dom check` runs plain `tsc` | keep `vue-tsc` in `devDependencies` |

## See also

- Components, props and events: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-flow-props-down-events-up
- Form inputs written from `render`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#a-small-reminder-about-form-inputs
- Slots, Light DOM and Shadow DOM: https://github.com/Pixmi/nativele/blob/main/docs/components.md#light-default-and-shadow
- Moved elements, connecting and subscriptions: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#moving-items-connecting-and-subscriptions
- Setup, the Vite plugin and checks: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md
- The tsconfig and `vue-tsc`'s TypeScript version: https://github.com/Pixmi/nativele/blob/main/skills/nativele-typescript/SKILL.md
- CI: https://github.com/Pixmi/nativele/blob/main/skills/nativele-ci/SKILL.md
