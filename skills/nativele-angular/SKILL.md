---
name: nativele-angular
description: "Use Nativele web components inside an existing Angular 22 app with standalone components: CUSTOM_ELEMENTS_SCHEMA, property and event bindings, change detection, content projection into slots, lifecycle, and generating the templates for the Angular CLI build. Use when a project depends on @angular/core and @nativele/ts-dom."
metadata:
  tier: official
  nativele: ">=0.7.0 <0.8.0"
  verified: "2026-11-08"
  tools: "@angular/core@22.2.4 @angular/compiler-cli@22.2.4 @angular/build@22.2.6 @angular/cli@22.2.6 typescript@6.0.3 vitest@5.1.0 jsdom@30.1.3"
  author: "Nativele maintainers"
  detects: "@angular/core"
---

# Nativele + Angular

## When to use

- The project is an Angular 22 app with standalone components (as made by `ng new`) and wants to use components written with Nativele (`@nativele/ts-dom`), for example widgets shared with non-Angular pages.
- Signals: `@angular/core` and `@nativele/ts-dom` in `package.json`, `angular.json`, Angular templates that use tags such as `<info-card>`.
- Not for writing the Nativele components themselves: use `nativele-core` (`npx ts-dom skills add nativele-core`).
- Not verified with NgModule-based apps, server-side rendering or hydration, or Angular versions other than 22.

Nativele components are native custom elements. Angular renders their tags like any other DOM element; nothing wraps them.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.7.4 (the last agent trial) |
| @angular/core, @angular/common, @angular/compiler, @angular/compiler-cli, @angular/platform-browser, @angular/router | 22.2.4 |
| @angular/cli, @angular/build | 22.2.6 |
| typescript | 6.0.3 |
| vitest (through `ng test`) | 5.1.0 |
| jsdom | 30.1.3 |

Verified on 2026-11-06 in Google Chrome 148, against `ng serve` (development and production configurations), in an app made with `npx @angular/cli@latest new <name> --defaults --skip-git`. That app is zoneless (no `zone.js`); the same checks also passed with `zone.js` 0.16.3 and `provideZoneChangeDetection()`. With a different major version of Angular, treat every step as unverified.

## Set-up

1. Keep the Nativele components in their own folder, for example `src/nv/`, each as `x.html` plus `x.ts`. Write them with the core Skill: `npx ts-dom skills add nativele-core`.
2. Install: `npm i @nativele/ts-dom`.
3. The tsconfig that covers `src/nv` must meet Nativele's requirements: check and adjust it with the TypeScript Skill (`npx ts-dom skills nativele-typescript`). In the CLI template, `tsconfig.app.json` and `tsconfig.spec.json` extend the root `tsconfig.json`.
4. Generate the template modules from npm's `pre` scripts, so they exist before every Angular command:

   ```sh
   npm pkg set scripts.prestart="ts-dom gen src/nv --whitespace=collapse" \
               scripts.prebuild="ts-dom gen src/nv --whitespace=collapse" \
               scripts.pretest="ts-dom gen src/nv --whitespace=collapse" \
               scripts.prewatch="ts-dom gen src/nv --whitespace=collapse"
   ```

   - The Angular CLI build (`@angular/build:application`) takes no Vite plugins from the project, so `tsDom()` cannot be added.
   - `npm start`, `npm run build`, `npm test` and the template's `npm run watch` then generate first. `npx ng ...` called directly does not, so a CI job runs these scripts or `ts-dom gen` first (`npx ts-dom skills nativele-ci`).
   - Every command that generates passes the whitespace mode the formatting Skill decides (`npx ts-dom skills nativele-formatting`). The CLI template sets up Prettier, for which that mode is `collapse`.

5. While `npm start` runs, keep `npx ts-dom gen src/nv --watch --whitespace=collapse` running in a second terminal. Editing a template or adding a component regenerates its module, and `ng serve` rebuilds and reloads the page.

6. Pass the folder to every `ts-dom` command (`npx ts-dom check src/nv`). Without it the default is `src`, and `ts-dom` reads Angular's own templates (`src/app/*.html`) as Nativele templates and reports errors for them.
7. Add the generated files to `.gitignore`:

   ```gitignore
   *.html.ts
   ts-dom-tags.ts
   ```

8. Import every Nativele component module in `src/main.ts`, before `bootstrapApplication`:

   ```ts
   // src/main.ts
   import "./nv/info-card.js";
   import "./nv/shadow-card.js";
   import "./nv/light-card.js";
   import { bootstrapApplication } from '@angular/platform-browser';
   import { appConfig } from './app/app.config';
   import { App } from './app/app';

   bootstrapApplication(App, appConfig)
     .catch((err) => console.error(err));
   ```

   Importing first makes the first render complete. Angular sets `[prop]` bindings as properties even on an element that is not defined yet, and Nativele takes them over when `define()` runs, but until then the element is empty.

9. Add `schemas: [CUSTOM_ELEMENTS_SCHEMA]` to every standalone component whose template uses a Nativele tag. Without it the build fails with `NG8001: 'info-card' is not a known element` and `NG8002: Can't bind to 'item' since it isn't a known property of 'info-card'`.

## Example

The Nativele components, as in `nativele-core`:

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

```html
<!-- src/nv/shadow-card.html and src/nv/light-card.html -->
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

```ts
// src/nv/light-card.ts
import { Component, define } from "@nativele/ts-dom";
import tpl from "./light-card.html.js";

export class LightCard extends Component(tpl) {}
define("light-card", LightCard);
```

The Angular component that uses them:

```ts
// src/app/app.ts
import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import type { EmitEvent } from '@nativele/ts-dom';
import type { InfoCard, Item } from '../nv/info-card.js';

const fruits: Item[] = [
  { id: 1, name: 'apple' },
  { id: 2, name: 'pear' },
  { id: 3, name: 'plum' },
];

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class App {
  protected readonly count = signal(0);
  protected readonly item = signal<Item>(fruits[0]!);
  protected readonly picked = signal<number[]>([]);
  protected pickedPlain = '';
  protected readonly fruits = signal(fruits);
  protected readonly rows = signal(['a', 'b', 'c']);
  protected readonly showTitle = signal(true);

  select(e: Event): void {
    const id = (e as EmitEvent<InfoCard, 'item-select'>).detail.id;
    this.picked.update((p) => [...p, id]);
    this.pickedPlain += id;
  }
  next(): void {
    this.count.update((c) => c + 1);
    this.item.set(fruits[1]!);
  }
  rotate(): void {
    this.rows.update((r) => [r.at(-1)!, ...r.slice(0, -1)]);
    this.fruits.update((f) => [f.at(-1)!, ...f.slice(0, -1)]);
  }
  toggleB(): void {
    this.rows.update((r) => (r.includes('b') ? r.filter((x) => x !== 'b') : ['b', ...r]));
  }
}
```

```html
<!-- src/app/app.html -->
<info-card id="card" label="Fruit" [count]="count()" [item]="item()" (item-select)="select($event)" />
<p id="picked">{{ picked().join(',') }}</p>
<p id="picked-plain">{{ pickedPlain }}</p>
<button type="button" id="next" (click)="next()">Next</button>

<ul id="cards">
  @for (f of fruits(); track f.id) {
    <li><info-card [label]="f.name" [item]="f" (item-select)="select($event)" /></li>
  }
</ul>

<shadow-card id="shadow">
  @if (showTitle()) {
    <span slot="title">Shadow</span>
  }
  @for (r of rows(); track r) {
    <p>{{ r }}</p>
  }
</shadow-card>

<light-card id="light">
  <div slot="title">
    @if (showTitle()) {
      <span>Light</span>
    }
  </div>
  <div>
    @for (r of rows(); track r) {
      <p>{{ r }}</p>
    }
  </div>
</light-card>

<button type="button" id="rotate" (click)="rotate()">Rotate</button>
<button type="button" id="toggle-b" (click)="toggleB()">Toggle b</button>
<button type="button" id="toggle-title" (click)="showTitle.set(!showTitle())">Toggle title</button>
```

- `[item]`, `[count]` and `[label]` are set as properties; the object is the same object the signal holds. A plain attribute (`label="Fruit"`) also fills a string prop.
- `(item-select)` listens to the exact, hyphenated event name on the element. The handler receives the `CustomEvent`; read its data through `EmitEvent<InfoCard, 'item-select'>`.
- A signal change re-renders the Nativele component in the same change detection pass.
- Changing state inside an `(item-select)` handler needs no extra call, even in a zoneless app and for a plain field such as `pickedPlain`, because Angular runs change detection after every template listener.
- `@for` with `track` moves `<info-card>` hosts when the list is reordered; they keep their props and listeners.

## Known limitations

1. **`CUSTOM_ELEMENTS_SCHEMA` turns off binding checks for unknown elements.** Keep the values typed in the Angular class (`signal<Item>(...)`), and check the Nativele side with `ts-dom check src/nv`.
   - With the schema, Angular's compiler accepts any property on any hyphenated tag: `[item]="42"`, `[count]="'x'"` and `[nope]="1"` on `<info-card>` all build without an error.
   - Angular has no mechanism to type-check bindings on custom elements.
2. **`$event` is typed `Event`.** Take `Event` in the handler and cast it with `EmitEvent<Component, 'event-name'>` from `@nativele/ts-dom`.
   - Angular's template type checker types `$event` of a DOM event it does not know as `Event`.
   - So `select($event.detail)` fails with `TS2339: Property 'detail' does not exist on type 'Event'`, and a handler parameter typed `CustomEvent<...>` fails with `TS2345`.
   - A wrong event name in `EmitEvent` becomes `never` and fails with `Property 'detail' does not exist on type 'never'`. Nothing checks that the cast names the element the listener is on.
3. **Bind properties, not attributes, for objects.** `[attr.item]="item()"` writes the attribute `item="[object Object]"` and the prop stays `null`. `[attr.count]` works for a number prop (the attribute text is converted), but `[count]` is simpler.
4. **Light DOM slots and Angular-managed children do not mix.** Use `shadow: true`, or one stable element per slot that Angular never removes, with `@if`/`@for` inside it, as `light-card` above (https://github.com/Pixmi/nativele/blob/main/docs/components.md#slots-and-children-managed-by-a-framework).
   - When `@if` or `@for` sit directly inside a Light DOM host with slots, a node Angular re-inserts lands in the wrong place, and Angular reports no error.
   - For example, a `<span slot="title">` brought back by `@if` ends up in the default slot while the title shows its fallback, and `assignedNodes()` stops matching the page.
5. **Zoneless rendering is scheduled.** A test that reads the DOM right after dispatching an event must wait: in Playwright, wait for the expected text; in TestBed, `await fixture.whenStable()`.
   - In the CLI's default zoneless app, Angular updates the DOM after a click in a later task, so code that reads the DOM right after `button.click()` sees the old values.
   - With `zone.js`, the DOM is already updated when `click()` returns.
   - The Nativele component itself renders synchronously as soon as Angular sets the property.
6. **State changed outside Angular's listeners.** In a zoneless app, a plain field set from a Nativele store subscription (`store.subscribe(...)` in an Angular class) or a `setTimeout` does not re-render the Angular view; put the value in a signal. Nativele components that `bind` the store update themselves either way.
7. **`ng serve` started before the modules were generated stays broken.** It fails with `Could not resolve "./info-card.html.js"` and does not rebuild when `ts-dom gen` creates the files later. Use `npm start` (step 4 runs `gen` first), or restart `ng serve`, or save one of the component `.ts` files.
8. **Lifecycle.** `@if` removing a host runs `disconnected()` and ends its `bind` subscriptions; inserting it again runs `connected()` and subscribes again. `@for` reordering moves hosts, which runs `disconnected()` and `connected()` on them; `bind` keeps working after the move.
9. **Unit tests.** Nativele components render in `ng test`'s jsdom environment.
   - `ng test` does not load `main.ts`, so import the Nativele modules at the top of each spec that renders their tags.
   - `tsconfig.spec.json` includes only `*.spec.ts` and `*.d.ts`, so `HTMLElementTagNameMap['info-card']` is not known there. Import the class type instead: `import type { InfoCard } from '../nv/info-card.js'`.
10. Not verified: NgModule-based apps, server-side rendering and hydration, Angular forms (`ngModel`, reactive forms) bound to Nativele components, `ng build --watch`, and Angular versions other than 22.

## Verify

Run in the project:

```sh
npx ts-dom gen src/nv --whitespace=collapse          # writes the modules; prints nothing
npx ts-dom check src/nv --whitespace=collapse        # expect: ts-dom check: no issues
npx ts-dom doctor src/nv     # expect: ts-dom doctor: the set-up looks right
npx ngc -p tsconfig.app.json --noEmit                # expect: no output, exit code 0
npm run build                # expect: Application bundle generation complete.
npm test -- --watch=false    # expect: the specs pass; the starter's src/app/app.spec.ts checks the starter page (an h1 with "Hello"), so once app.html is replaced, rewrite that spec for the new page
```

- `ts-dom check` runs `tsc` on the app's TypeScript through the references of the root `tsconfig.json`, so it reports a type error in `src/app/app.ts` too. It does not read Angular templates. `ngc` (or the build) is what type-checks the Angular templates, including the `EmitEvent` casts.
- Run `ts-dom check` with `--whitespace=collapse` or after `gen`. On a clean checkout it would otherwise write the files with the other mode (`nativele-formatting`).

In the browser, against `npm start` (the development server shows Angular's warnings in the console), check:

- the element has no attribute for the object prop (`el.getAttributeNames()`) and `el.item` is the object;
- a click on the component's button runs the `(item-select)` handler once and updates the Angular view;
- after `@for` reorders hosts, each keeps its own `item`, and its events still fire;
- children that `@if`/`@for` toggle, reorder, add and remove stay in the right slot;
- no errors or warnings in the console.

Read a slot with `el.assignedNodes(name)`, where `""` is the default slot; it works in both modes. Compare elements only, because Angular leaves comment anchors among the children.

With Playwright, wait for each expected change instead of reading the DOM right after a click (limitation 5).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `NG8001: 'info-card' is not a known element` | the standalone component has no `CUSTOM_ELEMENTS_SCHEMA` | add `schemas: [CUSTOM_ELEMENTS_SCHEMA]` to that component |
| `NG8002: Can't bind to 'item' since it isn't a known property of 'info-card'` | the same | the same |
| `TS2339: Property 'detail' does not exist on type 'Event'`, or `Argument of type 'Event' is not assignable to parameter of type 'CustomEvent<...>'` | Angular types `$event` of a custom event as `Event` | take `Event` in the handler and cast with `EmitEvent<Component, 'event-name'>` |
| `Property 'detail' does not exist on type 'never'` | `EmitEvent` names an event the component does not emit | use the exact name from the component's `emits` |
| `Could not resolve "./info-card.html.js"` from `ng build` or `ng serve` | the template modules were not generated | use `npm start` or `npm run build` (step 4), and restart a running `ng serve` |
| An object prop is `null`, and the element has `item="[object Object]"` | `[attr.item]` was used | bind the property: `[item]` |
| The element stays empty | its module is not imported | import it in `src/main.ts` (step 8) |
| A slotted child shows in the wrong slot or the slot fallback stays visible | `@if`/`@for` directly inside a Light DOM component with slots | `shadow: true`, or a stable element per slot |
| `ts-dom check` reports `invalid-hole` or `no-importer` in `src/app/app.html` | the command ran without a folder and read Angular templates | pass the Nativele folder: `ts-dom check src/nv` |
| `ts-dom doctor` warns `tsconfig-not-strict` | `strict` is off for the TypeScript version in use | step 3 (`nativele-typescript`) |
| `ts-dom doctor` warns `formatter-whitespace` | Prettier is set up, and no script or generated file uses `collapse` | step 4 (`nativele-formatting`) |
| `Property 'info-card' does not exist on type 'HTMLElementTagNameMap'` in a spec | `tsconfig.spec.json` does not include `ts-dom-tags.ts` | import the component class type instead; whether the spec tsconfig should cover the Nativele folder is for `nativele-typescript` |
| The Angular view does not update after a store change or a timer | zoneless change detection does not run for plain fields changed outside template listeners | keep that value in a signal |

## See also

- Components, props, events and `EmitEvent`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-flow-props-down-events-up
- Slots, Light DOM and Shadow DOM: https://github.com/Pixmi/nativele/blob/main/docs/components.md#light-default-and-shadow
- Lifecycle and `bind`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#components
- Stores: https://github.com/Pixmi/nativele/blob/main/docs/components.md#state-store-when-not-using-state
- Setup, `gen --watch`, whitespace and checks: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md
- The tsconfig and `ngc`'s TypeScript version: https://github.com/Pixmi/nativele/blob/main/skills/nativele-typescript/SKILL.md
- The whitespace mode with Prettier: https://github.com/Pixmi/nativele/blob/main/skills/nativele-formatting/SKILL.md
- CI: https://github.com/Pixmi/nativele/blob/main/skills/nativele-ci/SKILL.md
- A framework integration with typed templates: `npx ts-dom skills nativele-react`
