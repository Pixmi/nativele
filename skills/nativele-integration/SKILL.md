---
name: nativele-integration
description: "Use Nativele web components inside an app built with a UI framework that has no Nativele Skill of its own (Preact, Solid, Lit, ...; React, Vue, Svelte and Angular have their own): defining before render, props as properties, listening to events, children and slots, lifecycle, and template types. Use when a project depends on @nativele/ts-dom and on such a framework."
metadata:
  tier: experimental
  nativele: ">=0.5.1 <0.6.0"
  verified: "2026-11-05"
  tools: "vue@3.5.44 vite@8.3.6 @vitejs/plugin-vue@6.0.10 vue-tsc@3.3.14 typescript@6.0.3"
  author: "Nativele maintainers"
  detects: "preact solid-js"
---

# Nativele in a framework app

## When to use

- The app is built with a UI framework and wants to use components written with Nativele (`@nativele/ts-dom`), and no Skill exists for that framework yet. React, Vue, Svelte and Angular have their own (`nativele-react`, `nativele-vue`, `nativele-svelte`, `nativele-angular`); `npx ts-dom skills` lists every Skill.
- It is a procedure for finding out how the framework treats custom elements and connecting it correctly. It does not cover setting the framework itself up: start from the app as it is, with its own type checker and build.
- A framework with its own file format type-checks it with its own tool (Vue: `vue-tsc`). `ts-dom check` runs `vue-tsc` instead of `tsc` when the project's `package.json` lists it; for other formats see Troubleshooting.
- Not for writing the Nativele components themselves: use `nativele-core` (`npx ts-dom skills add nativele-core`).

Nativele components are native custom elements. The framework renders their tags like any other tag; nothing wraps them. Every rule below follows from that.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.5.1 |
| vue | 3.5.44 |
| vite | 8.3.6 |
| @vitejs/plugin-vue | 6.0.10 |
| vue-tsc | 3.3.14 |
| typescript | 6.0.3 |

Verified on 2026-11-05 by an agent that followed this Skill in a fresh Vue app made with `create-vite` (`vue-ts`), and checked in Google Chrome. The rules come from the custom element standard and hold for any framework, but each framework's own behavior (step 3) is verified only for the frameworks named here and in `nativele-react`.

## Set-up

1. Keep the Nativele components in their own folder, for example `src/nv/`, each as `x.html` plus `x.ts`, written with the core Skill.
2. Connect the build: with Vite, add `tsDom({ dirs: ["src/nv"] })` from `@nativele/ts-dom/vite` to `plugins`, and pass the same folder to every `ts-dom` command (`npx ts-dom check src/nv`). In the tsconfig whose `include` covers that folder, set `"strict": true`. If the project lints with oxlint, add `{ "name": "ts-dom", "specifier": "@nativele/ts-dom/oxlint" }` to `jsPlugins` and `"ts-dom/unused-markup": "error"` to `rules`. Add `*.html.ts` and `ts-dom-tags.ts` to `.gitignore`. Run `npx ts-dom doctor src/nv` and fix what it reports.
3. Find out, from the framework's documentation on custom elements (often called "web components"), these four things before writing any template:

   | Question | Why it matters |
   |---|---|
   | Does the compiler need to be told that hyphenated tags are custom elements? | Otherwise it may try to resolve them as framework components and warn or fail. |
   | Does a binding set a JS property or an HTML attribute on a custom element, and how do you force a property? | Objects and arrays reach a Nativele component only as properties. |
   | How do you listen to a DOM event with an exact, hyphenated name? | Nativele events use names like `item-select`, and some syntaxes change the case. |
   | Does the framework add, move and remove the children it renders inside the tag? | Light DOM slots move those children (limitation 3). |

4. Import every Nativele component module in the app's entry file, before the framework mounts anything:

   ```ts
   // src/main.ts
   import "./nv/info-card.js";
   // then create and mount the app
   ```

   Many frameworks decide between property and attribute by checking whether the element already has the property, which is only true after `define()` has run.

5. Give the framework's template type checker the Nativele tags. `ts-dom gen` writes `ts-dom-tags.ts`, which adds every exported component to `HTMLElementTagNameMap`; a component's props are the keys of its `props` member, and its events are in the optional `"~emits"` member (event name to `detail` type). Build the framework's tag declaration from these, so new components need no edit; `nativele-react` has the TSX one and `nativele-vue` the Vue one. Check how the framework names an event listener in its types: Vue types `@user-select` as the prop `onUserSelect`. If the framework has no typed templates, skip this step.

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

In a framework, the same calls come from its template syntax. `nativele-vue` (`npx ts-dom skills nativele-vue`) is a complete worked example: its compiler option, property binding, event listener and template type declaration answer the four questions of step 3 for Vue.

## Known limitations

1. **Define before render.** Import the component modules before the framework mounts (step 4). A framework that sees an undefined element may write an attribute instead of a property, and an object then arrives as the text `"[object Object]"`. A property set before `define()` is kept: Nativele takes it over when the element is upgraded.
2. **Props.** A prop whose default is a string, number or boolean can also come from an attribute, with camelCase names in kebab-case (`maxLength` from `max-length`, a boolean `true` when the attribute is present). Arrays and objects can only be set as properties. Pass a new object when data changes: props are compared by reference.
3. **Light DOM slots and framework-managed children do not mix.** In the default Light DOM mode (`Component(tpl)` without `shadow`), Nativele moves the tag's children into its slot positions; a framework that later inserts, removes or reorders those children can fail or leave nodes outside the slot. Use one of:
   - `shadow: true` on the component, so the browser assigns slots natively and the children can change freely;
   - one stable element per slot that the framework never removes, with the changing content inside it (`<div slot="title">...</div>`, `<div>...</div>` for the default slot). A stable but empty wrapper still fills its slot, so the slot's fallback content does not show; when the fallback matters, use `shadow: true`.
4. **Events do not bubble.** `emit` dispatches a `CustomEvent` on the component that does not bubble, so the listener must be on that element, not on an ancestor. The event data is `event.detail`.
5. **Lifecycle.** `connected()` runs each time the element is inserted and `disconnected()` each time it is removed; a framework that moves an element (reordering a keyed list) runs both. `bind` subscriptions end on removal and start again on insertion, and the children already in a Light DOM component's slots move with it.
6. **The framework's templates are checked by the framework's type checker**, with the declaration from step 5, not by the Nativele rules. How much it checks depends on the framework: `vue-tsc` reports a wrong prop type or event detail, but not an unknown prop name.

## Verify

```sh
npx ts-dom check src/nv      # expect: ts-dom check: no issues
npx ts-dom doctor src/nv     # expect: ts-dom doctor: the set-up looks right (info lines are suggestions)
```

Then run the app's own type check and build (for example `npm run build` when it runs the framework's type checker). Keep one wrong prop per component kind that has props in a file the app never imports, under the framework's expect-error comment (a template comment such as `<!-- @ts-expect-error -->` is often not honored; check that a wrong prop fails without it), so the declaration is proved to type props.

In the browser, render a component with an object prop and an event listener, and check:

- the element has no attribute for the object prop (`el.getAttributeNames()`) and `el.<prop>` is the object;
- the listener runs once per event;
- children that the framework toggles, reorders, adds and removes stay in the right slot, with no errors or framework warnings in the console (run this check once against the dev server too: production builds drop framework warnings). Read a slot with `el.assignedNodes(name)` (`""` is the default slot), which works in both modes; a Light DOM component has no `<slot>` elements once rendered. Frameworks leave comment and empty text nodes as anchors among the children, so compare elements, not all nodes.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| An object prop shows `[object Object]`, or the element has an attribute holding it | the framework set an attribute: the element was not defined yet, or the binding syntax sets attributes | import the module before mounting; use the framework's property binding |
| The framework warns that it cannot resolve the component `info-card` | its compiler treats the tag as a framework component | mark hyphenated tags as custom elements in the framework's compiler options |
| The event listener never runs | the name was changed (camelCase), or the listener is on an ancestor | listen with the exact name, on the element that emits |
| Children vanish, appear outside the slot, or the framework throws during an update | framework-managed children inside a Light DOM component with slots | `shadow: true`, or a stable element per slot |
| `ts-dom check` reports `TS2307: Cannot find module` for a framework file (`./App.vue`, ...) | plain `tsc` cannot read the framework's files | Vue: keep `vue-tsc` in `package.json` (Vue's own type checker; `ts-dom check` uses it when listed). Other formats: pass `--project=` a tsconfig whose `include` covers only the Nativele folder, and type-check the rest with the framework's tool |
| The framework's type checker does not know the tag | no declaration built from `ts-dom-tags.ts`, or the component class is not exported | add the declaration (step 5), export the class, run `ts-dom gen` |

## See also

- Props, events and data flow: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-flow-props-down-events-up
- Slots, Light DOM and Shadow DOM: https://github.com/Pixmi/nativele/blob/main/docs/components.md#light-default-and-shadow
- Lifecycle: https://github.com/Pixmi/nativele/blob/main/docs/components.md#components
- Setup and checks: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md
- A complete framework integration: `npx ts-dom skills nativele-react`
