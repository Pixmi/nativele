---
name: nativele-integration
description: "Use Nativele web components inside an app built with a UI framework that has no Nativele Skill of its own (Preact, Solid, Lit, ...; React, Vue, Svelte and Angular have their own): defining before render, props as properties, listening to events, children and slots, lifecycle, and template types. Use when a project depends on @nativele/ts-dom and on such a framework."
metadata:
  tier: official
  nativele: ">=0.7.0 <0.8.0"
  verified: "2026-11-08"
  tools: "preact@11.1.1 vite@8.3.6 @preact/preset-vite@2.10.6 typescript@7.0.2"
  author: "Nativele maintainers"
  detects: "preact solid-js"
---

# Nativele in a framework app

## When to use

- The app is built with a UI framework and wants to use components written with Nativele (`@nativele/ts-dom`), and no Skill exists for that framework yet. React, Vue, Svelte and Angular have their own (`nativele-react`, `nativele-vue`, `nativele-svelte`, `nativele-angular`); `npx ts-dom skills` lists every Skill.
- It is a procedure for finding out how the framework treats custom elements and connecting it correctly. It does not cover setting the framework itself up: start from the app as it is, with its own type checker and build.
- A framework with its own file format type-checks it with its own tool (Vue: `vue-tsc`).
  - `ts-dom check` runs `vue-tsc` instead of `tsc` when the project's `package.json` lists it and it resolves from the project folder; for other formats see Troubleshooting.
  - A framework that uses TSX (Preact, Solid) is checked by plain `tsc`, and `ts-dom check` reports its errors too.
- Not for writing the Nativele components themselves: use `nativele-core` (`npx ts-dom skills add nativele-core`).

Nativele components are native custom elements. The framework renders their tags like any other tag; nothing wraps them. Every rule below follows from that.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.7.4 (the last agent trial) |
| preact | 11.1.1 |
| vite | 8.3.6 |
| @preact/preset-vite | 2.10.6 |
| typescript | 7.0.2 |

Verified on 2026-11-07 in Google Chrome 157, starting from `create-vite` 9.3.4 with the `preact-ts` template. The procedure was also followed in a Vue app made with the `vue-ts` template.

The rules come from the custom element standard and hold for any framework. Each framework's own behavior, the answers to step 3, is verified only for Preact 11 here and for the frameworks that have their own Skill. With Preact 10, treat the Preact answers below as unverified.

## Set-up

1. Keep the Nativele components in their own folder, for example `src/nv/`, each as `x.html` plus `x.ts`, written with the core Skill.
2. Connect the Nativele tools to the project, then run `npx ts-dom doctor src/nv` and fix what it reports:
   - With Vite, add `tsDom({ dirs: ["src/nv"] })` from `@nativele/ts-dom/vite` to `plugins`, and pass the same folder to every `ts-dom` command (`npx ts-dom check src/nv`).
   - The tsconfig whose `include` covers that folder must meet Nativele's requirements: check and adjust it with `npx ts-dom skills nativele-typescript`. In Vite's templates it is `tsconfig.app.json`, and some starters, such as `preact-ts`, do not set `strict`.
   - If the project lints, the ts-dom rules go into its linter: `npx ts-dom skills nativele-linting`.
   - Add `*.html.ts` and `ts-dom-tags.ts` to `.gitignore`.
3. Find out, from the framework's documentation on custom elements (often called "web components"), these four things before writing any template:

   | Question | Why it matters |
   |---|---|
   | Does the compiler need to be told that hyphenated tags are custom elements? | Otherwise it may try to resolve them as framework components and warn or fail. |
   | Does a binding set a JS property or an HTML attribute on a custom element, and how do you force a property? | Objects and arrays reach a Nativele component only as properties. |
   | How do you listen to a DOM event with an exact, hyphenated name? | Nativele events use names like `item-select`, and some syntaxes change the case. |
   | Does the framework add, move and remove the children it renders inside the tag? | Light DOM slots move those children (limitation 3). |

4. Import every Nativele component module in the app's entry file, before the framework mounts anything:

   ```ts
   // src/main.tsx
   import "./nv/info-card.js";
   // then create and mount the app
   ```

   Many frameworks decide between property and attribute by checking whether the element already has the property, which is only true after `define()` has run.

5. Build the framework's tag declaration from `ts-dom-tags.ts`, so its template type checker knows the Nativele tags and new components need no edit. If the framework has no typed templates, skip this step.
   - `ts-dom gen` writes `ts-dom-tags.ts`, which adds every exported component to `HTMLElementTagNameMap`.
   - The element type members a declaration reads (`props` and `"~emits"`) are in https://github.com/Pixmi/nativele/blob/main/docs/components.md#element-types-for-framework-declarations.
   - Existing declarations to adapt: "In Preact (verified)" below for Preact's JSX, `nativele-react` for React, `nativele-vue` for Vue.
   - Check how the framework names an event listener in its types: Preact and React type `item-select` as the prop `onitem-select`, Vue types `@item-select` as `onItemSelect`.
6. Put `ts-dom gen src/nv &&` in front of the type check in the build script, for example `"build": "ts-dom gen src/nv && tsc -b && vite build"` in the `preact-ts` template.

   On a clean checkout the generated files do not exist yet, so the type check alone fails with `TS2307: Cannot find module './x.html.js'` (why the order matters: https://github.com/Pixmi/nativele/blob/main/skills/nativele-vite/SKILL.md#set-up). The dev server needs no change, because the Vite plugin generates the files when it starts.

## Example

What every framework does underneath, in plain DOM calls. Check the framework's output against it:

```ts
import "./nv/info-card.js";                       // define() runs first

const card = document.createElement("info-card");
card.label = "Ada";                               // a string prop: property or attribute label="Ada"
card.item = { id: 1, name: "Ada" };               // an object prop: property only
card.addEventListener("item-select", (e) => {     // the exact event name, on the element itself
  console.log(e.detail.id);
});
host.append(card);                                // connected() runs here
card.item = { id: 2, name: "Grace" };             // a new object re-renders; changing item.name in place does not
card.remove();                                    // disconnected() runs, bind() subscriptions end
```

In a framework, the same calls come from its template syntax. Preact below is the worked example for a TSX framework; `nativele-vue` (`npx ts-dom skills nativele-vue`) is a complete one for a framework with its own template compiler. Both answer the four questions of step 3.

### In Preact (verified)

| Question | Preact 11 |
|---|---|
| Compiler option for custom elements | none: a lowercase JSX tag is always a DOM element |
| Property or attribute | a property when the element already has one of that name (`name in el`), otherwise an attribute; no syntax forces a property (limitation 1) |
| Event listener | `on` plus the exact event name: `onitem-select={(e) => ...}`; `onItemSelect` listens to `itemselect` and never runs |
| Framework-managed children | yes: Preact inserts, removes and reorders them (limitation 3), and moves keyed list items with `moveBefore` where the browser has it (limitation 5) |

The JSX declaration, as `src/nativele-preact.d.ts` (the template's `tsconfig.app.json` includes `src`):

```ts
// src/nativele-preact.d.ts
import type { HTMLAttributes } from "preact";

type NativeleTag = Extract<keyof HTMLElementTagNameMap, `${string}-${string}`>;
type NativeleProps<E> = E extends { readonly props: infer P } ? { [K in keyof P & keyof E]?: E[K] } : unknown;
type NativeleEvents<E> = E extends { readonly "~emits"?: infer M }
  ? { [K in keyof NonNullable<M> & string as `on${K}`]?: (event: CustomEvent<NonNullable<M>[K]>) => void }
  : unknown;
type NativeleElementProps<E extends HTMLElement> = Omit<HTMLAttributes<E>, keyof NativeleProps<E>> & NativeleProps<E> & NativeleEvents<E>;
type NativeleIntrinsics = { [K in NativeleTag]: NativeleElementProps<HTMLElementTagNameMap[K]> };

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements extends NativeleIntrinsics {}
  }
}
```

Used from a Preact component, with two Nativele components, `nv-info-card` and `nv-text-field` (props `label`, `count`, `item`, event `item-select` with the detail `{ id: number }`; prop `value`, event `value-change` with the detail `{ value: string }`):

```tsx
import { useState } from "preact/hooks";
import type { Item } from "./nv/info-card.js";

export function App() {
  const [item] = useState<Item>({ id: 1, name: "apple" });
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState("");
  return (
    <>
      <nv-info-card label="Fruit" count={picked.length} item={item} onitem-select={(e) => setPicked((p) => [...p, e.detail.id])} />
      <nv-text-field value={text} onvalue-change={(e) => setText(e.detail.value)} />
      <nv-light-card>
        <div slot="title">{item && <span>{item.name}</span>}</div>
        <div>{picked.map((id, i) => <p key={i}>{id}</p>)}</div>
      </nv-light-card>
    </>
  );
}
```

A template ref is typed from the same map: `useRef<HTMLElementTagNameMap["nv-info-card"]>(null)`.

## Known limitations

1. **Define before render.** Import the component modules before the framework mounts (step 4).
   - A framework that sees an undefined element may write an attribute instead of a property. In Preact, `item={item}` becomes the attribute `item="[object Object]"`, the component gets `null` after `define()`, and the attribute stays even after a later new object is set as a property.
   - A property set before `define()` is kept: Nativele takes it over when the element is upgraded.
   - So when a module really is loaded later, set object props through the framework's property syntax. Where it has none (Preact), set them from a ref, `ref={(el) => { if (el) el.item = item; }}`, and leave `item={item}` out of that tag, or Preact also writes the attribute.
2. **Props.** Set arrays and objects as properties; only string, number and boolean props can come from an attribute: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-flow-props-down-events-up
3. **Light DOM slots and framework-managed children do not mix.** Use `shadow: true`, or one stable element per slot that the framework never removes, with the changing content inside it (https://github.com/Pixmi/nativele/blob/main/docs/components.md#slots-and-children-managed-by-a-framework).
   - A framework that inserts, removes or reorders the children of a Light DOM host with slots can fail or leave nodes in the wrong slot.
   - In Preact, toggling or reordering such children throws `NotFoundError: Failed to execute 'moveBefore' on 'Element'` or `'insertBefore' on 'Node'`, and the slot loses its children.
4. **Events do not bubble.** Put the listener on the component's element, not on an ancestor, and read `event.detail`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-flow-props-down-events-up
5. **Lifecycle.** Subscribe in `connected()`, and do not rely on a move running it.
   - `connected()` runs each time the element is inserted and `disconnected()` each time it is removed; `bind` subscriptions end on removal and start again on insertion.
   - A framework that moves an element (reordering a keyed list) with `insertBefore` runs both. One that moves it with `moveBefore` keeps it connected, so neither runs and its subscriptions continue.
   - Preact 11 uses `moveBefore` where the browser has it (Chrome does) and `insertBefore` elsewhere.
   - Either way the moved element keeps its props and the children in its Light DOM slots.
6. **Object props change by a new object.** Give the element a new object when a field changes (`{ ...item, qty }`). A Nativele prop renders again only when it receives a new value (`Object.is`), so an object changed in place shows the old data.
7. **The framework's templates are checked by the framework's type checker**, with the declaration from step 5, not by the Nativele rules. How much it checks depends on the framework:
   - With the Preact declaration, `tsc` reports a wrong prop type, a wrong object shape, a wrong use of `e.detail`, an unknown prop name, an event prop in the wrong case (`onItemSelect`) and an unknown tag.
   - It does not report a hyphenated attribute name (`selected-item`), which TypeScript never checks in JSX.
   - `vue-tsc` reports a wrong prop type or event detail, but not an unknown prop name.
8. Not verified with Preact: server-side rendering and hydration, `preact/compat`, signals passed as props, and Preact 10.

## Verify

```sh
npx ts-dom check src/nv      # expect: ts-dom check: no issues
npx ts-dom doctor src/nv     # expect: ts-dom doctor: the set-up looks right
```

Then run the app's own type check and build, for example `npm run build` when it runs the framework's type checker.

Prove that the declaration types props: keep one wrong prop per component kind that has props, in a file the app never imports, under the framework's expect-error comment. In TSX, `{/* @ts-expect-error */}` on the line before the tag works:

```tsx
{/* @ts-expect-error count is a number */}
<nv-info-card count="1" />
{/* @ts-expect-error detail is { id: number } */}
<nv-info-card onitem-select={(e) => e.detail.name} />
```

The type check passes only while each of these is an error; if the declaration stops working, it reports `TS2578: Unused '@ts-expect-error' directive`. A template comment such as `<!-- @ts-expect-error -->` is often not honored; check that a wrong prop fails without it.

In the browser, render a component with an object prop and an event listener, and check:

- the element has no attribute for the object prop (`el.getAttributeNames()`) and `el.<prop>` is the object;
- the listener runs once per event;
- children that the framework toggles, reorders, adds and removes stay in the right slot;
- the console has no errors or framework warnings. Run this check once against the dev server too, because production builds drop framework warnings.

Read a slot with `el.assignedNodes(name)`, where `""` is the default slot; it works in both modes, and a Light DOM component has no `<slot>` elements once rendered. Frameworks leave comment and empty text nodes as anchors among the children, so compare elements, not all nodes.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TS2307: Cannot find module './x.html.js'` from the build on a clean checkout | the type check runs before the generated files exist | start the build script with `ts-dom gen src/nv &&` (step 6); for CI, `nativele-ci` |
| An object prop shows `[object Object]`, or the element has an attribute holding it | the framework set an attribute: the element was not defined yet, or the binding syntax sets attributes | import the module before mounting; use the framework's property binding, or a ref (limitation 1) |
| The framework warns that it cannot resolve the component `info-card` | its compiler treats the tag as a framework component | mark hyphenated tags as custom elements in the framework's compiler options |
| The event listener never runs | the name was changed (camelCase; Preact's `onItemSelect` listens to `itemselect`), or the listener is on an ancestor | listen with the exact name (`onitem-select`), on the element that emits |
| Children vanish, appear outside the slot, or the framework throws during an update (Preact: `NotFoundError: Failed to execute 'moveBefore'`) | framework-managed children inside a Light DOM component with slots | `shadow: true`, or a stable element per slot |
| `connected()` does not run when a keyed list reorders | the framework moved the element with `moveBefore`, so it stayed connected | nothing to fix: its subscriptions continue (limitation 5) |
| `ts-dom check` reports `TS2307: Cannot find module` for a framework file (`./App.vue`, ...) | plain `tsc` cannot read the framework's files | see the list below |
| `Property 'nv-info-card' does not exist on type 'JSX.IntrinsicElements'`, or the framework's type checker does not know the tag | no declaration built from `ts-dom-tags.ts`, or the component class is not exported | add the declaration (step 5), export the class, run `ts-dom gen` |

When `ts-dom check` cannot read a framework file:

- Vue: keep `vue-tsc` in `package.json`. `ts-dom check` uses it when it is listed.
- Other formats: pass `--project=` a tsconfig whose `include` covers only the Nativele folder (`nativele-typescript`), and type-check the rest with the framework's tool.

## See also

- Props, events and data flow: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-flow-props-down-events-up
- Slots, Light DOM and Shadow DOM: https://github.com/Pixmi/nativele/blob/main/docs/components.md#light-default-and-shadow
- Lifecycle: https://github.com/Pixmi/nativele/blob/main/docs/components.md#components
- Moved elements, connecting and subscriptions: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#moving-items-connecting-and-subscriptions
- Setup and checks: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md
- The tsconfig and the framework's type checker: https://github.com/Pixmi/nativele/blob/main/skills/nativele-typescript/SKILL.md
- The ts-dom rules in the project's linter: https://github.com/Pixmi/nativele/blob/main/skills/nativele-linting/SKILL.md
- CI: https://github.com/Pixmi/nativele/blob/main/skills/nativele-ci/SKILL.md
- Complete framework integrations: `npx ts-dom skills nativele-react`, `npx ts-dom skills nativele-vue`
