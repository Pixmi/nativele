---
name: nativele-svelte
description: "Use Nativele web components inside an existing Svelte 5 app: passing props, listening to events, children and slots, lifecycle, template types with svelte-check, and ts-dom check. Use when a project depends on svelte and @nativele/ts-dom."
metadata:
  tier: official
  nativele: ">=0.7.0 <0.8.0"
  verified: "2026-11-08"
  tools: "svelte@5.57.3 vite@8.3.6 @sveltejs/vite-plugin-svelte@7.3.1 svelte-check@4.7.8 @tsconfig/svelte@5.0.8 typescript@6.0.3"
  author: "Nativele maintainers"
  detects: "svelte"
---

# Nativele + Svelte

## When to use

- The project renders with Svelte 5 (with Vite) and wants to use components written with Nativele (`@nativele/ts-dom`), for example a design-system layer or widgets shared with non-Svelte pages.
- Signals: `svelte` and `@nativele/ts-dom` in `package.json`, `.svelte` files that render tags with a hyphen (`<info-card>`).
- Not for Svelte 4 or earlier, and not for SvelteKit (server rendering and hydration were not verified). Not for compiling Svelte components into custom elements (`<svelte:options customElement>`): that is the opposite direction.
- Not for writing the Nativele components themselves: use `nativele-core` (`npx ts-dom skills add nativele-core`).

Nativele components are native custom elements. Svelte renders them like any other tag; nothing wraps them.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.7.4 (the last agent trial) |
| svelte | 5.57.3 |
| @sveltejs/vite-plugin-svelte | 7.3.1 |
| svelte-check | 4.7.8 |
| @tsconfig/svelte | 5.0.8 |
| vite | 8.3.6 |
| typescript | 6.0.3 |

Verified on 2026-11-06 in Google Chrome 148, against the Vite dev server (so Svelte's development warnings would show), in a fresh app made with `npm create vite@latest -- --template svelte-ts`. Runes mode (`$state`) is what was verified; legacy mode was checked only for the `on:` directive (limitation 2). With a different major version of Svelte, treat every step as unverified.

## Set-up

1. Keep the Nativele components in their own folder, for example `src/nv/`, each as `x.html` plus `x.ts`. Write them with the core Skill: `npx ts-dom skills add nativele-core`.
2. Install: `npm i @nativele/ts-dom`.
3. The tsconfig that covers that folder must meet Nativele's requirements: in Vite's Svelte template, `tsconfig.app.json` extends `@tsconfig/svelte`, which sets `"strict": true`, and its `include` already covers `src/nv`, so nothing changes. In any other case, check and adjust it with the TypeScript Skill (`npx ts-dom skills nativele-typescript`).
4. Add the Nativele Vite plugin before the Svelte plugin, pointing at that folder:

   ```ts
   // vite.config.ts
   import { svelte } from "@sveltejs/vite-plugin-svelte";
   import { defineConfig } from "vite";
   import { tsDom } from "@nativele/ts-dom/vite";

   export default defineConfig({ plugins: [tsDom({ dirs: ["src/nv"] }), svelte()] });
   ```

   Pass the same folder to every `ts-dom` command (`npx ts-dom check src/nv`), so there is one `ts-dom-tags.ts`, in `src/nv`. Svelte needs no option to accept hyphenated tags.

5. Add the generated files to `.gitignore`:

   ```
   *.html.ts
   ts-dom-tags.ts
   ```

6. Import every Nativele component module in `src/main.ts`, before `mount`:

   ```ts
   // src/main.ts
   import "./nv/info-card.js";
   import "./nv/shadow-card.js";
   import { mount } from "svelte";
   import App from "./App.svelte";

   mount(App, { target: document.getElementById("app")! });
   ```

   Svelte 5 sets a value as a property when the element is defined and has that property (limitation 1).

7. Add the template declaration below as `src/nativele-svelte.d.ts`. It reads the tag map that `ts-dom gen` writes (`ts-dom-tags.ts`), so every exported component gets typed props and events in `.svelte` files, and new components need no edit:

   ```ts
   // src/nativele-svelte.d.ts
   import type { HTMLAttributes } from "svelte/elements";

   type NativeleTag = Extract<keyof HTMLElementTagNameMap, `${string}-${string}`>;
   type NativeleProps<E> = E extends { readonly props: infer P } ? { [K in keyof P & keyof E]?: E[K] } : unknown;
   type NativeleEvents<E> = E extends { readonly "~emits"?: infer M }
     ? { [K in keyof NonNullable<M> & string as `on${K}`]?: (event: CustomEvent<NonNullable<M>[K]>) => void }
     : unknown;
   type NativeleElementProps<E extends HTMLElement> = Omit<HTMLAttributes<E>, keyof NativeleProps<E>> & NativeleProps<E> & NativeleEvents<E>;
   type NativeleElements = { [K in NativeleTag]: NativeleElementProps<HTMLElementTagNameMap[K]> };

   declare module "svelte/elements" {
     interface SvelteHTMLElements extends NativeleElements {}
   }
   ```

   The component class must be exported and passed to `define()` in a folder that `ts-dom gen` scans, so it appears in `ts-dom-tags.ts`.

8. Prove the declaration types props with a `.ts` file that the app never imports, one wrong case per component kind under `// @ts-expect-error` (an expect-error comment in Svelte markup does not work, limitation 6):

   ```ts
   // src/types-check.ts
   import type { SvelteHTMLElements } from "svelte/elements";

   // @ts-expect-error an object prop given a string
   export const badProp: SvelteHTMLElements["info-card"] = { item: "apple" };
   // @ts-expect-error a prop name the component does not declare
   export const badName: SvelteHTMLElements["info-card"] = { lable: "x" };
   // @ts-expect-error a detail field the event does not have
   export const badEvent: SvelteHTMLElements["info-card"] = { "onitem-select": (e) => e.detail.name };
   ```

9. Put `ts-dom gen src/nv &&` in front of the `check` script: `"check": "ts-dom gen src/nv && svelte-check --tsconfig ./tsconfig.app.json && tsc -p tsconfig.node.json"`.

   On a clean checkout the generated files do not exist yet, so `svelte-check` alone fails with `TS2307: Cannot find module './x.html.js'` (why the order matters: https://github.com/Pixmi/nativele/blob/main/skills/nativele-vite/SKILL.md#set-up). `npm run build` needs no change, because the Vite plugin generates the files.

## Example

A Nativele component with props and an event:

```html
<!-- src/nv/info-card.html -->
<span>{{ label }}</span>
<b>{{ count }}</b>
<i data-ref="itemName"></i>
<button type="button" data-on-click="pick">Pick</button>
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
define("info-card", InfoCard);
```

A component with slots, in Shadow DOM:

```html
<!-- src/nv/shadow-card.html -->
<h2><slot name="title">Untitled</slot></h2>
<div><slot></slot></div>
```

```ts
// src/nv/shadow-card.ts
import { Component, define } from "@nativele/ts-dom";
import tpl from "./shadow-card.html.js";

export class ShadowCard extends Component(tpl, { shadow: true }) {}
define("shadow-card", ShadowCard);
```

Used from Svelte:

```svelte
<!-- src/App.svelte -->
<script lang="ts">
  import type { Item } from "./nv/info-card.js";

  let count = $state(0);
  let item = $state<Item>({ id: 1, name: "apple" });
  let picked = $state<number[]>([]);
  let rows = $state(["a", "b", "c"]);
  let showTitle = $state(true);
</script>

<info-card label="Fruit" {count} {item} onitem-select={(e) => picked.push(e.detail.id)}></info-card>
<button type="button" onclick={() => { count++; item = { ...item, name: "pear" }; }}>Next</button>

<shadow-card>
  {#if showTitle}<span slot="title">Title</span>{/if}
  {#each rows as r (r)}<p>{r}</p>{/each}
</shadow-card>
```

- `label`, `count` and `item` arrive as properties; the element has no attribute for them. Changing them from Svelte state re-renders the Nativele component.
- The event attribute is `on` followed by the exact event name: `onitem-select`. `e.detail` is typed from the component's `emits`.
- In a `shadow: true` component, `{#if}` and keyed `{#each}` children can change freely.

## Known limitations

1. **Define before mount.** Import the component modules before `mount` (step 6). Other cases were not verified, so define first.
   - When the element is defined, Svelte 5 sets a property the element has.
   - When it is not defined yet (a module loaded later with `import()`), Svelte sets objects and arrays as properties and writes every other value as an attribute string.
   - Nativele reads both when the element is upgraded. Verified for string, number and boolean props with one-word names: `count={0}` becomes `count="0"`, `false` becomes `open="false"`, and both arrive with the right type.
2. **Event attribute names.** Only `on` plus the exact event name works (`onitem-select`). Nativele events do not bubble, so put the handler on the element that emits.
   - `onItemSelect` listens to an event named `ItemSelect` and never fires. With the declaration it is also a `svelte-check` error.
   - The legacy directive `on:item-select` fires too, but use only the event attributes. In a runes component `on:` is deprecated (`event_directive_deprecated`), a component cannot mix it with event attributes (`mixed_event_handler_syntaxes`), and the declaration in step 7 does not type it.
3. **Children Svelte renders need `shadow: true`.** Give a component with slots that receives Svelte children `shadow: true`, so the browser assigns its slots natively (https://github.com/Pixmi/nativele/blob/main/docs/components.md#slots-and-children-managed-by-a-framework).
   - In a Light DOM component, children Svelte adds after the element is built stay outside the slots, and the console warns `unplaced-child`.
4. **New objects for changed props.** A Nativele component compares props by reference. Changing a `$state` object in place (`item.name = "kiwi"`) does not re-render it; assign a new object (`item = { ...item, name: "kiwi" }`).
5. **Write closing tags.** `<info-card ... />` works, but the Svelte compiler warns `element_invalid_self_closing_tag` (shown in the dev server's terminal); write `<info-card ...></info-card>`.
6. **Template types need the declaration** in step 7.
   - Without it, Svelte accepts any attribute on a hyphenated tag, and an inline handler's parameter is `any` (`Parameter 'e' implicitly has an 'any' type` under `strict`).
   - With it, `svelte-check` reports a wrong prop type, an unknown prop name, a wrong `e.detail` field and a camelCase handler name.
   - `<!-- @ts-expect-error -->` in markup does not silence an error, so keep the expected-error cases in a `.ts` file (step 8).
   - To type an element reference, use the tag map: `let card: HTMLElementTagNameMap["info-card"] | undefined = $state()` with `bind:this={card}`.
7. **`ts-dom check` does not read `.svelte` files.** Run both it and `svelte-check` (Verify).
   - `ts-dom check` runs the project's `tsc`, which checks the Nativele folder and the `.ts` files, including `types-check.ts`.
   - `.svelte` imports resolve through the `*.svelte` module declaration in Svelte's own types, so they cause no error, but only `svelte-check` checks the markup and scripts inside them.
8. **Lifecycle.**
   - Removing an element with `{#if}` runs `disconnected()` and ends its `bind` subscriptions; adding it back runs `connected()` and subscribes again.
   - Reordering a keyed `{#each}` of Nativele elements moves them: `disconnected()`, then `connected()`. Each element keeps its slotted children, and every `bind` callback still runs once per store change.
9. Not verified: SvelteKit, server rendering and hydration, form controls inside Nativele components submitting with a Svelte form, `$state.raw`, hot updates of `.svelte` files that contain Nativele tags, and Svelte versions other than 5.57.

## Verify

Run in the project:

```sh
npx ts-dom check src/nv      # expect: ts-dom check: no issues
npx ts-dom doctor src/nv     # expect: ts-dom doctor: the set-up looks right
npm run check                # svelte-check plus tsc for vite.config.ts; expect: svelte-check found 0 errors and 0 warnings
npm run build                # expect: built
```

When `npm run check` does not run in a terminal (an agent or CI), `svelte-check` prints `COMPLETED ... 0 ERRORS 0 WARNINGS ...` instead. Delete `src/nativele-svelte.d.ts` once to see the check work: `svelte-check` must then report `Unused '@ts-expect-error' directive` in `src/types-check.ts`.

In the browser, against the dev server (production builds drop Svelte's warnings), render a component with an object prop and an event attribute, and check:

- the element has no attribute for the object prop (`el.getAttributeNames()`) and `el.item` is the object;
- the handler runs once per event;
- children that Svelte toggles with `{#if}` and changes with keyed `{#each}` stay in the right slot of a `shadow: true` component;
- the console has no errors or warnings.

Read a slot of a `shadow: true` component with `el.assignedNodes(name)`, where `""` is the default slot. Svelte leaves comment nodes as anchors among the children, so compare elements, not all nodes.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `svelte-check` reports `Cannot find module './x.html.js'` on a clean checkout | it runs before the generated files exist | start the `check` script with `ts-dom gen src/nv &&`; for CI, `nativele-ci` |
| The event handler never runs | the attribute is camelCased (`onItemSelect`), or it is on an ancestor | use `on` plus the exact event name (`onitem-select`) on the element that emits |
| `svelte-check`: `'"on:item-select"' does not exist in type 'NativeleElementProps<...>'` | the legacy `on:` directive, which the declaration does not type | use the event attribute `onitem-select` |
| `Mixing old (on:item-select) and new syntaxes for event handling is not allowed` | `on:` and event attributes in the same component | use only event attributes |
| `svelte-check`: `Parameter 'e' implicitly has an 'any' type` on a handler of a Nativele tag | the declaration file is missing, or the component class is not exported | add `src/nativele-svelte.d.ts`, export the class, run `npx ts-dom check src/nv` |
| `svelte-check`: `Unused '@ts-expect-error' directive` in `types-check.ts` | the declaration is not applied | same as above |
| Svelte children appear outside the slots, the console warns `unplaced-child` | the component with slots uses Light DOM | give it `shadow: true` |
| The component does not update after `item.name = ...` | the object was changed in place; props compare by reference | assign a new object |
| `Self-closing HTML tags for non-void elements are ambiguous` | `<info-card />` | write `<info-card></info-card>` |

## See also

- Components, props and events: https://github.com/Pixmi/nativele/blob/main/docs/components.md
- How attributes convert to props: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-flow-props-down-events-up
- Slots, Light DOM and Shadow DOM: https://github.com/Pixmi/nativele/blob/main/docs/components.md#light-default-and-shadow
- Stores and `bind`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#state-store-when-not-using-state
- Setup and checks: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md
- The tsconfig and `svelte-check`'s TypeScript version: https://github.com/Pixmi/nativele/blob/main/skills/nativele-typescript/SKILL.md
- CI: https://github.com/Pixmi/nativele/blob/main/skills/nativele-ci/SKILL.md
- The framework-neutral rules: `npx ts-dom skills nativele-integration`
