---
name: nativele-react
description: "Use Nativele web components inside a React 19 app: passing props, receiving events, children and slots, lifecycle, and TSX types. Use when a project depends on react and @nativele/ts-dom."
metadata:
  tier: official
  nativele: ">=0.5.0 <0.6.0"
  verified: "2026-11-05"
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
| @nativele/ts-dom | 0.5.0 |
| react, react-dom | 19.3.1 |
| @types/react, @types/react-dom | 19.3.0 |
| vite | 8.3.5 |
| @vitejs/plugin-react | 6.2.1 |
| typescript | 7.0.2 |

Verified on 2026-11-05 in Google Chrome 148 with the example project in the Nativele repository (`skills/nativele-react/example`), which CI runs again when the example or the library changes and once a month. With a different major version of React, treat every step as unverified.

## Set-up

1. Keep the Nativele components in their own folder, for example `src/nv/`, each as `x.html` plus `x.ts`. Write them with the core Skill: `npx ts-dom skills add nativele-core`.
2. Install: `npm i @nativele/ts-dom`.
3. Set `"strict": true` in the tsconfig whose `include` covers that folder (`tsconfig.app.json` in Vite's React template, which leaves it off); Nativele's type checks depend on it. Other configs, such as the one for `vite.config.ts`, stay as they are.
4. Add the Nativele Vite plugin next to the React plugin, pointing at that folder:

   ```ts
   // vite.config.ts
   import { defineConfig } from "vite";
   import react from "@vitejs/plugin-react";
   import { tsDom } from "@nativele/ts-dom/vite";

   export default defineConfig({ plugins: [tsDom({ dirs: ["src/nv"] }), react()] });
   ```

   Pass the same folder to every `ts-dom` command (`npx ts-dom check src/nv`), so there is one `ts-dom-tags.ts`, in `src/nv`.

5. If the project lints with oxlint (`.oxlintrc.json`, as in Vite's React template), load the ts-dom rules there: add `{ "name": "ts-dom", "specifier": "@nativele/ts-dom/oxlint" }` to `jsPlugins` and `"ts-dom/unused-markup": "error"` to `rules`.

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

The generated files are not committed, so on a clean checkout the type check in `npm run build` runs before anything has written them and fails with `TS2307: Cannot find module './x.html.js'`. Generate them first: `"build": "ts-dom gen src/nv && tsc -b && vite build"` (the template's script with `ts-dom gen src/nv &&` in front).

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
3. **Light DOM slots and React children do not mix.** In the default Light DOM mode (`Component(tpl)` with no `shadow`), Nativele moves the host's children into its slot positions. When React later inserts, removes or reorders those children it fails (`insertBefore`/`removeChild` errors that unmount the root) or leaves nodes outside the slot. Changing text in place and appending at the end happen to work, but do not rely on that. Use one of:
   - `shadow: true` on the component (children can then change freely), or
   - one stable React element per slot, and let React change only what is inside it:

     ```tsx
     <light-card>
       <div slot="title">{showTitle && <span>{title}</span>}</div>
       <div>{rows.map((r) => <p key={r.id}>{r.text}</p>)}</div>
     </light-card>
     ```

     A stable but empty wrapper still fills its slot, so the slot's fallback content does not show; when the fallback matters, use `shadow: true`.
4. **New objects for changed props.** A Nativele component compares props by reference; pass a new object when the data changes (React state updates usually do).
5. **TSX types need the declaration** in step 7; without it, every Nativele tag is `TS2339: Property 'info-card' does not exist on type 'JSX.IntrinsicElements'`. Check it with a `.tsx` that has a wrong prop under `// @ts-expect-error`, because `skipLibCheck` can hide mistakes inside the declaration itself. Keep these cases in a `.tsx` file of their own that the app never imports (the example uses `src/types-check.tsx`).
6. Not verified: server-side rendering, form controls inside Nativele components submitting with a React form, and React versions other than 19.3.

React StrictMode is fine: it runs effects twice but does not insert the custom element twice, so `connected()` runs once, and `bind` subscriptions are released when React unmounts the element.

## Verify

Run in the project:

```sh
npx ts-dom check src/nv      # expect: ts-dom check: no issues
npx ts-dom doctor src/nv     # expect: ts-dom doctor: the set-up looks right
npx tsc --noEmit -p tsconfig.app.json   # expect: no errors (keep one @ts-expect-error case per component kind)
npx vite build               # expect: built
```

Pass `tsc` the tsconfig from step 3. A root `tsconfig.json` that only lists `references` (as in Vite's template) checks nothing itself, so `tsc --noEmit` without `-p` passes even with type errors.

In the browser, render a component with an object prop and an event handler, and check that the element has no `item` attribute (`el.getAttributeNames()`), that `el.item` is the object, and that the handler fires once per click. The example project's [`verify.mjs`](https://github.com/Pixmi/nativele/blob/main/skills/nativele-react/example/verify.mjs) does these checks with Playwright, plus children that React reorders, adds and removes inside a `shadow: true` component and inside stable wrappers in a Light DOM component. A Light DOM component has no `<slot>` elements once rendered; check where the children ended up with `el.assignedNodes(name)`, where `""` is the default slot.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TS2307: Cannot find module './x.html.js'` from `npm run build` on a clean checkout | `tsc -b` runs before the generated files exist | start the script with `ts-dom gen src/nv &&` |
| An object prop shows `[object Object]` or is missing | the component was rendered before `define()` ran | import the component module in the entry file before rendering |
| The event handler never runs | the prop name is camelCased (`onItemSelect`) | use `on` plus the exact event name (`onitem-select`) |
| `insertBefore`/`removeChild` errors, the React root disappears | React children changed inside a Light DOM component with slots | use `shadow: true`, or stable wrapper elements per slot |
| `TS2339: Property 'x-y' does not exist on type 'JSX.IntrinsicElements'` | the declaration file is missing, or the component class is not exported | add `src/nativele-react.d.ts`, export the class, run `ts-dom gen` |
| `ts-dom check` reports `unused-ref` | a `data-ref` the class never reads | use it in the class or remove the attribute |

## See also

- Components, props and events: https://github.com/Pixmi/nativele/blob/main/docs/components.md
- Slots, Light DOM and Shadow DOM: https://github.com/Pixmi/nativele/blob/main/docs/components.md#light-default-and-shadow
- Setup and checks: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md
