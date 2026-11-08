---
name: nativele-react
description: "Use Nativele web components inside a React 19 app: passing props, receiving events, children and slots, lifecycle, and TSX types. Use when a project depends on react and @nativele/ts-dom."
metadata:
  tier: official
  nativele: ">=0.7.0 <0.8.0"
  verified: "2026-11-08"
  tools: "react@19.3.1 react-dom@19.3.1 @types/react@19.3.0 @types/react-dom@19.3.0 vite@8.3.5 @vitejs/plugin-react@6.2.1 typescript@7.0.2"
  author: "Nativele maintainers"
  detects: "react"
---

# Nativele + React

## When to use

- The project renders with React 19 and wants to use components written with Nativele (`@nativele/ts-dom`), for example a design-system layer or widgets shared with non-React pages.
- Signals: `react` and `@nativele/ts-dom` in `package.json`, `.tsx` files that render tags with a hyphen (`<info-card>`).
- Not for React 18 or earlier: React 18 sets every prop on a custom element as an attribute and does not attach `on...` handlers to custom events. The steps below are verified only with React 19.

Nativele components are native custom elements. React renders them like any other tag; nothing wraps them.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.7.4 (the last agent trial) |
| react, react-dom | 19.3.1 |
| @types/react, @types/react-dom | 19.3.0 |
| vite | 8.3.5 |
| @vitejs/plugin-react | 6.2.1 |
| typescript | 7.0.2 |

Verified on 2026-11-07 in Google Chrome 157, and by an agent trial: a fresh agent did real work with only the Skill, and the result was checked independently. With a different major version of React, treat every step as unverified.

## Set-up

1. Keep the Nativele components in their own folder, for example `src/nv/`, each as `x.html` plus `x.ts`. Write them with the core Skill: `npx ts-dom skills add nativele-core`.
2. Install: `npm i @nativele/ts-dom`.
3. The tsconfig whose `include` covers that folder (`tsconfig.app.json` in Vite's React template, which does not set `strict`) must meet Nativele's requirements: check and adjust it with the TypeScript Skill (`npx ts-dom skills nativele-typescript`).
4. Add the Nativele Vite plugin next to the React plugin, pointing at that folder:

   ```ts
   // vite.config.ts
   import { defineConfig } from "vite";
   import react from "@vitejs/plugin-react";
   import { tsDom } from "@nativele/ts-dom/vite";

   export default defineConfig({ plugins: [tsDom({ dirs: ["src/nv"] }), react()] });
   ```

   Pass the same folder to every `ts-dom` command (`npx ts-dom check src/nv`), so there is one `ts-dom-tags.ts`, in `src/nv`.

5. If the project lints (Vite's React template has oxlint), the ts-dom rules go into its linter: follow the linting Skill (`npx ts-dom skills nativele-linting`).

6. Import every Nativele component module in the entry file, before React renders anything:

   ```tsx
   // src/main.tsx
   import "./nv/info-card.js";
   import "./nv/shadow-card.js";
   // then createRoot(...).render(...)
   ```

   React 19 sets a value as a property only when the element is already defined; before that it writes an attribute, and an object prop becomes the text `"[object Object]"`.

7. Add the TSX declaration below as `src/nativele-react.d.ts`. It reads the tag map that `ts-dom gen` writes (`ts-dom-tags.ts`), so every exported component gets typed props and events, and new components need no edit:

   ```ts
   // src/nativele-react.d.ts
   import type { DetailedHTMLProps, HTMLAttributes } from "react";

   type NativeleTag = Extract<keyof HTMLElementTagNameMap, `${string}-${string}`>;
   type NativeleProps<E> = E extends { readonly props: infer P } ? { [K in keyof P & keyof E]?: E[K] } : unknown;
   type NativeleEvents<E> = E extends { readonly "~emits"?: infer M }
     ? { [K in keyof NonNullable<M> & string as `on${K}`]?: (event: CustomEvent<NonNullable<M>[K]>) => void }
     : unknown;
   type NativeleElementProps<E extends HTMLElement> = Omit<DetailedHTMLProps<HTMLAttributes<E>, E>, keyof NativeleProps<E>> &
     NativeleProps<E> &
     NativeleEvents<E>;
   type NativeleIntrinsics = { [K in NativeleTag]: NativeleElementProps<HTMLElementTagNameMap[K]> };

   declare module "react" {
     namespace JSX {
       interface IntrinsicElements extends NativeleIntrinsics {}
     }
   }
   ```

   The component class must be exported and passed to `define()` in a folder that `ts-dom gen` scans, so it appears in `ts-dom-tags.ts`.

8. Put `ts-dom gen src/nv &&` in front of the build script: `"build": "ts-dom gen src/nv && tsc -b && vite build"`.

   On a clean checkout the generated files do not exist yet, so `tsc -b` alone fails with `TS2307: Cannot find module './x.html.js'` (why the order matters: https://github.com/Pixmi/nativele/blob/main/skills/nativele-vite/SKILL.md#set-up).

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
define("info-card", InfoCard);
```

Used from React:

```tsx
<info-card label={label} count={count} item={item} onitem-select={(e) => select(e.detail.id)} />
```

- `label`, `count` and `item` arrive as properties; the object is the same object React passed. Changing them from React state re-renders the Nativele component.
- The event handler prop is `on` followed by the exact event name: `onitem-select`. `e.detail` is typed from the component's `emits`.

A component with slots that receives React children: give it `shadow: true`, then pass children directly.

```html
<!-- src/nv/shadow-card.html -->
<h2><slot name="title">Untitled</slot></h2>
<div><slot></slot></div>
```

```ts
// src/nv/shadow-card.ts
export class ShadowCard extends Component(tpl, { shadow: true }) {}
define("shadow-card", ShadowCard);
```

```tsx
<shadow-card>
  {showTitle && <span slot="title">{title}</span>}
  {rows.map((r) => <p key={r.id}>{r.text}</p>)}
</shadow-card>
```

## Known limitations

1. **Define before render.** Import every Nativele module before React first renders its tag (step 6). Otherwise props become attributes and object props are lost.
2. **Event prop names.** Only `on` plus the exact event name works (`onitem-select`); `onItemSelect` and `onItem-select` never fire. Nativele events do not bubble by default, so put the handler on the element that emits. A ref with `addEventListener` in `useEffect` also works (remove it in the cleanup).
3. **Children React renders need `shadow: true`.** Give a component with slots that receives React children `shadow: true`, so the browser assigns its slots natively (https://github.com/Pixmi/nativele/blob/main/docs/components.md#slots-and-children-managed-by-a-framework).
   - In a Light DOM component, children React adds after the element is built stay outside the slots, and the console warns `unplaced-child`.
4. **New objects for changed props.** A Nativele component compares props by reference; pass a new object when the data changes (React state updates usually do).
5. **TSX types need the declaration** in step 7. Without it, every Nativele tag is `TS2339: Property 'info-card' does not exist on type 'JSX.IntrinsicElements'`.
   - Check the declaration with a `.tsx` that has a wrong prop under `// @ts-expect-error`, because `skipLibCheck` can hide mistakes inside the declaration itself.
   - Keep these cases in a `.tsx` file of their own that the app never imports.
6. Not verified: server-side rendering, form controls inside Nativele components submitting with a React form, and React versions other than 19.3.

React StrictMode is fine: it runs effects twice but does not insert the custom element twice, so `connected()` runs once, and `bind` subscriptions are released when React unmounts the element.

## Verify

Run in the project:

```sh
npx ts-dom check src/nv      # expect: ts-dom check: no issues
npx ts-dom doctor src/nv     # expect: ts-dom doctor: the set-up looks right
npx tsc --noEmit -p tsconfig.app.json   # expect: no errors (keep one @ts-expect-error case per component kind)
npm run build                # expect: ✓ built (it runs ts-dom gen, tsc -b and vite build)
```

Pass `tsc` the tsconfig from step 3: the template's root `tsconfig.json` only lists `references`, so `tsc --noEmit` without `-p` checks nothing (`nativele-typescript`).

In the browser, render a component with an object prop and an event handler, and check that the element has no `item` attribute (`el.getAttributeNames()`), that `el.item` is the object, and that the handler fires once per click. On the `shadow: true` component, check where the children ended up with `el.assignedNodes(name)`, where `""` is the default slot.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TS2307: Cannot find module './x.html.js'` from `npm run build` on a clean checkout | `tsc -b` runs before the generated files exist | start the script with `ts-dom gen src/nv &&`; for CI, `nativele-ci` |
| An object prop shows `[object Object]` or is missing | the component was rendered before `define()` ran | import the component module in the entry file before rendering |
| The event handler never runs | the prop name is camelCased (`onItemSelect`) | use `on` plus the exact event name (`onitem-select`) |
| React children appear outside the slots, the console warns `unplaced-child` | the component with slots uses Light DOM | give it `shadow: true` |
| `TS2339: Property 'x-y' does not exist on type 'JSX.IntrinsicElements'` | the declaration file is missing, or the component class is not exported | add `src/nativele-react.d.ts`, export the class, run `ts-dom gen` |

## See also

- Components, props and events: https://github.com/Pixmi/nativele/blob/main/docs/components.md
- Slots, Light DOM and Shadow DOM: https://github.com/Pixmi/nativele/blob/main/docs/components.md#light-default-and-shadow
- Setup and checks: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md
- The tsconfig: https://github.com/Pixmi/nativele/blob/main/skills/nativele-typescript/SKILL.md
- The ts-dom rules in the project's linter: https://github.com/Pixmi/nativele/blob/main/skills/nativele-linting/SKILL.md
- CI: https://github.com/Pixmi/nativele/blob/main/skills/nativele-ci/SKILL.md
