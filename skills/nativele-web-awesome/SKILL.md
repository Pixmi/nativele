---
name: nativele-web-awesome
description: "Use Web Awesome (@awesome.me/webawesome, the successor of Shoelace) components such as wa-button, wa-input, wa-select and wa-dialog inside Nativele templates: importing only the components used and the theme, attributes and properties, data-on-* with typed Web Awesome events, forms and FormData, Light DOM and shadow: true, slots, and what ts-dom check and lint can and cannot see. Use when a project depends on @awesome.me/webawesome and @nativele/ts-dom."
metadata:
  tier: official
  nativele: ">=0.6.0 <0.7.0"
  verified: "2026-11-06"
  tools: "@awesome.me/webawesome@3.14.0 vite@8.3.6 typescript@7.0.2"
  author: "Nativele maintainers"
  detects: "@awesome.me/webawesome"
---

# Nativele + Web Awesome

## When to use

- A project that uses Nativele (`@nativele/ts-dom`) wants Web Awesome's components inside its templates: `<wa-button>`, `<wa-input>`, `<wa-select>`, `<wa-dialog>` and the rest.
- Signals: `@awesome.me/webawesome` and `@nativele/ts-dom` in `package.json`, `wa-` tags in `.html` templates.
- The starting point is a working app with Nativele set up (with Vite: `npx ts-dom skills nativele-vite`). This Skill does not set up Vite, TypeScript or the components themselves (`npx ts-dom skills add nativele-core`).
- Not for Shoelace (`@shoelace-style/shoelace`, `sl-` tags), Web Awesome Pro components, the hosted project loader (a `<script>` from a kit) or the autoloader: none of them was verified. Not for using Nativele components inside a Web Awesome page layout either; that needs nothing beyond writing the tags.

Web Awesome components are custom elements built with Lit, each with its own shadow root. In a template they are tags from another library: the general rules for those are in https://github.com/Pixmi/nativele/blob/main/docs/components.md#custom-elements-from-other-libraries. This Skill adds what Web Awesome's package declares and how its components behave there.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.6.0 (the last agent trial) |
| @awesome.me/webawesome | 3.14.0 |
| vite | 8.3.6 |
| typescript | 7.0.2 |
| create-vite (`vanilla-ts` template, the starting point) | 9.3.4 |

Verified on 2026-11-06 in Google Chrome 148, in the dev server and the production build, with the example project in the Nativele repository (`skills/nativele-web-awesome/example`). The example is a reference; it is not run in CI. With another major version of Web Awesome (Shoelace 2 is the previous one, under another package and prefix), treat every step as unverified.

## Set-up

1. Install it in the project: `npm i @awesome.me/webawesome`.
2. Load a theme once, in the app's entry module (in the `vanilla-ts` template, `src/main.ts`):

   ```ts
   import "@awesome.me/webawesome/dist/styles/webawesome.css";
   ```

   `webawesome.css` is the theme (`dist/styles/themes/default.css`) plus Web Awesome's styles for native elements (`native.css`) and its utility classes (`utilities.css`, such as `wa-stack` and `wa-cluster`). The theme alone is enough for the components to be styled: import `dist/styles/themes/default.css` instead when the app has its own styles for native elements and does not use the utility classes. Either way the styles are in cascade layers (`wa-theme`, `wa-native`, `wa-utilities`, ...), so a template's own `<style>` wins over them.
3. Import each component the templates use, in the module of the Nativele component that uses it, before `define()`:

   ```ts
   import "@awesome.me/webawesome/dist/components/button/button.js";
   import "@awesome.me/webawesome/dist/components/select/select.js";
   import "@awesome.me/webawesome/dist/components/option/option.js";
   ```

   `ts-dom gen` imports only the Nativele components of the scanned folders, never a `wa-` tag. Each import defines the tag and the components it depends on (`select.js` also defines `wa-option`, `wa-icon`, `wa-popup` and `wa-tag`; `dialog.js` defines `wa-button`), and adds the tag to `HTMLElementTagNameMap`, so `refs` get the component's class. Import every tag the template writes anyway, as the example does, so a template does not rely on what another component happens to load. Nothing else is bundled: a tag that no module imports stays undefined.
4. For typed handlers of Web Awesome's own events (`wa-hide`, `wa-clear`, ...), import their types from the package root in the same module:

   ```ts
   import type { WaClearEvent, WaHideEvent } from "@awesome.me/webawesome";
   ```

   The event types are declared in `GlobalEventHandlersEventMap` only by the files under `dist/events/`, and no component file includes them; importing any type from the root (or `import type {} from "@awesome.me/webawesome"`) brings in all of them. It is a type-only import, so it adds nothing to the bundle. Without it, a `data-on-wa-hide` handler receives `Event`.
5. The tsconfig covering the components needs nothing for Web Awesome beyond Nativele's own requirements (`strict` among them; `npx ts-dom skills nativele-typescript`): its types also pass with `"skipLibCheck": false`. The example adopts a utilities sheet with `?inline`, which is typed by `vite/client` (already in the template's `types`).

## Example

A Light DOM form with a dialog, and a `shadow: true` child component that fills a `<wa-select>` from a list and forwards a slot into it.

```html
<!-- src/nv/signup-form.html -->
<form data-ref="form" data-on-submit="save">
  <wa-input name="email" type="email" label="Email" required with-clear data-ref="email" data-on-input="onEmail" data-on-wa-clear="onClear"></wa-input>
  <wa-select name="plan" label="Plan" value="basic" data-ref="plan" data-on-change="onPlan">
    <wa-option value="basic">Basic</wa-option>
    <wa-option value="pro">Pro</wa-option>
  </wa-select>
  <wa-checkbox name="news">Send me news</wa-checkbox>
  <wa-button type="submit" variant="brand">Sign up</wa-button>
</form>
<p>{{ status }}</p>
<small>{{ note }}</small>
<wa-dialog label="Welcome" data-ref="dialog" data-on-wa-hide="onDialogHide">
  <p>{{ summary }}</p>
  <theme-picker data-ref="themes" data-on-theme-change="onTheme">
    <span slot="hint">Applies at once</span>
  </theme-picker>
  <wa-button slot="footer" variant="brand" data-on-click="closeDialog">Done</wa-button>
</wa-dialog>
```

```ts
// src/nv/signup-form.ts
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/option/option.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import type { WaClearEvent, WaHideEvent } from "@awesome.me/webawesome";
import { Component, define, type EmitEvent, type EventHit } from "@nativele/ts-dom";
import tpl from "./signup-form.html.js";
import { THEMES, type ThemePicker } from "./theme-picker.js";

export class SignupForm extends Component(tpl, { state: { status: "", note: "", summary: "" } }) {
  override connected(): void {
    this.refs.themes.themes = THEMES;
  }
  onEmail(_e: InputEvent): void {
    this.set({ status: `Email: ${this.refs.email.value ?? ""}` });
  }
  onClear(e: WaClearEvent): void {
    this.set({ note: `Cleared by ${e.type}` });
  }
  onPlan(): void {
    this.set({ status: `Plan: ${String(this.refs.plan.value)}` });
  }
  save(e: SubmitEvent): void {
    e.preventDefault();
    const data = new FormData(this.refs.form);
    this.set({ summary: `${String(data.get("email"))} on ${String(data.get("plan"))}, news: ${data.has("news") ? "yes" : "no"}` });
    this.refs.dialog.open = true;
  }
  onTheme(e: EmitEvent<ThemePicker, "theme-change">): void {
    this.set({ status: `Theme: ${e.detail.theme.label}` });
  }
  closeDialog(): void {
    this.refs.dialog.open = false;
  }
  onDialogHide(e: WaHideEvent, hit: EventHit): void {
    if (e.target !== hit.el) return;
    this.set({ status: "Dialog closed" });
  }
}
define("signup-form", SignupForm);
```

```html
<!-- src/nv/theme-picker.html -->
<div class="wa-stack">
  <wa-select label="Theme" placeholder="Choose a theme" data-ref="select" data-on-change="onChange">
    <template data-each="themes">
      <wa-option>{{ label }}</wa-option>
    </template>
    <slot name="hint" slot="hint"></slot>
  </wa-select>
</div>
```

```ts
// src/nv/theme-picker.ts
import "@awesome.me/webawesome/dist/components/option/option.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./theme-picker.html.js";
import { waUtilities } from "./wa-utilities.js";

export interface Theme {
  id: string;
  label: string;
}

export const THEMES: readonly Theme[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export class ThemePicker extends Component(tpl, {
  shadow: true,
  props: { themes: [] as readonly Theme[] },
  emits: { "theme-change": event<{ theme: Theme }>() },
}) {
  constructor() {
    super();
    this.shadowRoot!.adoptedStyleSheets = [waUtilities];
  }
  onChange(): void {
    const theme = this.props.themes.find((t) => t.id === this.refs.select.value);
    if (theme) this.emit("theme-change", { theme });
  }
  override render(view: { themes: readonly Theme[] }): void {
    this.lists.themes.replace(view.themes, (t) => t.id, (t, { el, text }) => {
      el.value = t.id;
      text.label = t.label;
    });
  }
}
define("theme-picker", ThemePicker);
```

```ts
// src/nv/wa-utilities.ts
import css from "@awesome.me/webawesome/dist/styles/utilities.css?inline";

export const waUtilities = new CSSStyleSheet();
waUtilities.replaceSync(css);
```

`src/main.ts` imports `webawesome.css` (step 2) and `./nv/signup-form.ts`, and the page has `<signup-form></signup-form>`.

- Static values are attributes in the template: strings (`label`, `value="basic"`), booleans by presence (`required`, `with-clear`), kebab-case names as Web Awesome lists them (`with-clear` for the property `withClear`). A `{{ }}` hole cannot be in an attribute, so a value that changes is set as a property through `refs` (`this.refs.dialog.open = true`, `select.disabled = true`, which also reflects the attribute). Array values are properties only: a `multiple` `<wa-select>` takes `select.value = ["a", "c"]`, writes no attribute, and puts one `FormData` entry per value.
- `this.refs.email` is `WaInput`, `this.refs.plan` `WaSelect`, `el` in the list `WaOption`, from the imports in step 3. `WaInput.value` is `string | null`; `WaSelect.value` is `string | string[] | null`.
- `data-on-input` receives an `InputEvent` and `data-on-change` an `Event`, the types `HTMLElementEventMap` gives those names; Web Awesome dispatches them with those classes. Writing a property (`select.value = "pro"`) dispatches no event.

## Known limitations

1. **Event names and types.** Form controls dispatch the native names `input`, `change`, `focus` and `blur` (no `wa-` prefix: `data-on-wa-change` never runs, and nothing reports it); `data-on-blur` on `<wa-input>` receives a `FocusEvent`. Web Awesome's own events carry the prefix (`wa-show`, `wa-hide`, `wa-after-hide`, `wa-clear`, `wa-invalid`) and are classes that extend `Event` with an optional `detail`, not `CustomEvent`. They are typed only after step 4. A handler typed `WaHideEvent` on a misspelled name (`data-on-wa-hidee`) is reported as `handler-event-type` (it receives `Event`); a handler typed `Event` compiles with any name. Clearing a `with-clear` input dispatches `wa-clear`, then `input` and `change` with the empty value.
2. **Web Awesome events bubble out of nested components.** `wa-show`, `wa-hide`, `wa-after-show` and `wa-after-hide` are `bubbles: true, composed: true`, and a `<wa-select>` dispatches them when its menu opens and closes (Web Awesome's documentation lists the same events on other popup components). Inside a `<wa-dialog>`, the dialog's `data-on-wa-hide` handler runs for the select too, also when the select is in a child component's shadow root (`e.target` is then that child's host). Compare the target with the element that carries the binding, as `onDialogHide` does: `if (e.target !== hit.el) return;`.
3. **Forms.** Web Awesome's form controls are form-associated: in the same tree as the `<form>`, they are in `form.elements`, in `new FormData(form)`, take part in `required` validation (an empty required `<wa-input>` blocks the submit and dispatches `wa-invalid`), and `form.reset()` restores their `value` attributes. A `<wa-button type="submit">` submits the form; `e.submitter` is a native `<button>` that it adds for the submission and removes afterwards, not the `<wa-button>`. Three things differ from native controls:
   - `this.refs.form.elements` types only the native controls of the template, so `elements.email` for a `<wa-input name="email">` is `TS2339`. Read the values with `new FormData(this.refs.form)`, or give the control a `data-ref`.
   - A control inside a child component with `shadow: true` does not join the parent's form (its `FormData` lacks it); one inside a Light DOM child component does.
   - `unguarded-input-value` and the a11y `form-label` check do not look at `wa-` controls. Writing the same value to `<wa-input>` keeps the caret (measured); a different value moves it to the end, as with a native input.
4. **Light DOM and `shadow: true`.** The components are styled in both, because the theme is CSS custom properties and they inherit into shadow roots. `native.css` and the utility classes are document styles: they do not reach a `shadow: true` component's own elements, so `class="wa-stack"` there does nothing until the sheet is adopted as in `wa-utilities.ts` (Vite's `?inline` resolves the file's `@import`s; verified in dev and build). The rest of Shadow DOM's style rules are in https://github.com/Pixmi/nativele/blob/main/docs/components.md#light-default-and-shadow. Prefer Light DOM unless the component needs the isolation.
5. **Slots into Web Awesome components.** Content written in a template goes into a Web Awesome slot with its `slot` attribute (`<wa-button slot="footer">`). To pass a Nativele component's own slot on, put the `<slot>` inside the Web Awesome element with both attributes: `<slot name="hint" slot="hint"></slot>`. This works in both modes: with `shadow: true` it is a native slot assigned to Web Awesome's slot; in Light DOM the children land as direct children of the Web Awesome element, keeping their own `slot` attribute (a default `<slot></slot>` inside `<wa-dialog>` puts them in the dialog's body).
6. **Lists of `<wa-option>`.** A `data-each` whose item is one `<wa-option>` is a plain-element list (`replace()`; no `data-key`/`data-prop`, which are for Nativele components); set `el.value` and the label hole in `update`. Set the select's `value` after the options exist; replacing the options keeps a value that is still among them.
7. **What the tools see.** `ts-dom check` checks the TypeScript against Web Awesome's declarations (a property the class lacks is `TS2339`, a wrong type a `tsc` error) but not the markup: a misspelled tag (`<wa-buton>`), a forgotten import (the ref is `HTMLElement`, so only a property access fails), an unknown attribute or a wrong attribute value (`variant="brandd"`) pass `ts-dom check`, `ts-dom lint` and `tsc` without a word; a misspelled or unimported tag stays an undefined element that shows only its children as plain content. Lint treats `wa-` tags as generic elements and as child components:
   - `ts-dom check` and `ts-dom lint` print one `unchecked-custom-elements` warning per run that lists the `wa-` tags used, because lint has no definition of them: their attributes and events are not checked, and neither is `data-on-click` on them (`click-semantics` leaves `<wa-button>` alone; it is keyboard operable). Nothing needs to change; with `--strict`, pass `--ignore=unchecked-custom-elements`.
   - `ts-dom check` and the `ts-dom/data-flow` group report `prop-forwarding` when `render` writes one of the component's own props unchanged to a Web Awesome element (`this.refs.select.value = view.selected`), and `emit-forwarding` when a handler only re-emits a Web Awesome event. Both are warnings and do not change the exit code. A wrapper whose job is to adapt a Web Awesome control can turn its value into its own data before emitting, as `ThemePicker` emits the `Theme` object; otherwise ignore the ids in the project's linter (`npx ts-dom skills nativele-linting`), knowing `ts-dom check` and `ts-dom lint` still print them.
8. **Define before use.** Step 3 puts the imports in the component's module, so the tags are defined before Nativele creates its elements. A component used in a page without its module imported, or a Web Awesome module loaded later with `import()`, was not verified.
9. Not verified: Shoelace, Web Awesome Pro, the CDN and autoloader, `<wa-icon>` with Font Awesome names, translations, server-side rendering, styling parts with `::part()` from a template `<style>`, dark mode classes (`wa-dark`), and use inside a UI framework (for that, follow the framework's Skill for the Nativele side and Web Awesome's documentation for its side).

## Verify

```sh
npx ts-dom check src/nv      # expect: ts-dom check: no issues (or only the warnings of limitation 7)
npx ts-dom doctor src/nv     # expect: ts-dom doctor: the set-up looks right (info lines are suggestions)
npm run build                # expect: built
```

Prove that the event types are loaded: keep one handler typed with a Web Awesome event class (`onDialogHide(e: WaHideEvent)` above). If step 4's import is missing, `ts-dom check` reports `handler-event-type ... which delivers Event`.

In the browser, against the dev server and the build (`vite preview`):

- every `wa-` tag used is defined (`customElements.get("wa-select")`) and an unused one is not;
- typing in a `<wa-input>` runs its `data-on-input` handler, picking an option runs `data-on-change`;
- submitting with a required field empty does not run the submit handler; filled, `FormData` holds every Web Awesome control's value;
- opening and closing a `<wa-select>` inside a `<wa-dialog>` does not run the dialog's close logic;
- a forwarded slot reaches the Web Awesome slot: `select.shadowRoot.querySelector("slot[name=hint]").assignedElements({ flatten: true })`;
- no console errors, and in the build no warnings.

A reference implementation of these checks is the [`verify.mjs`](https://github.com/Pixmi/nativele/blob/main/skills/nativele-web-awesome/example/verify.mjs) of the example project, which does them with Playwright in the dev server and the build.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A `wa-` tag renders as plain text or an empty box, with no error | its module is not imported (or the tag is misspelled) | import `@awesome.me/webawesome/dist/components/<name>/<name>.js` in the component's module (step 3) |
| `TS2339: Property 'open' does not exist on type 'HTMLElement'` on a ref | no module in the program imports that component, so its tag is not in `HTMLElementTagNameMap` | the same import (step 3) |
| `handler-event-type ... data-on-wa-hide on <wa-dialog>, which delivers Event` for a handler typed `WaHideEvent` | the event map types are not loaded, or the event name is misspelled | import the type from `@awesome.me/webawesome` (step 4); check the name in Web Awesome's documentation |
| A `data-on-wa-change` or `data-on-wa-input` handler never runs | form controls dispatch `change` and `input` | `data-on-change`, `data-on-input` (limitation 1) |
| A dialog's `wa-hide` or `wa-after-hide` handler runs when a select or dropdown inside it closes | those events bubble and are composed | `if (e.target !== hit.el) return;` (limitation 2) |
| `TS2339: Property 'email' does not exist on type 'HTMLFormControlsCollection'` | `elements` types only native controls | `new FormData(this.refs.form)`, or a `data-ref` on the control |
| A field is missing from `FormData` | it is in a child component with `shadow: true` | Light DOM for that child, or let the child emit its value |
| `class="wa-stack"` (or another utility) has no effect | the element is in a `shadow: true` component, or only the theme CSS is loaded | adopt `utilities.css?inline` (limitation 4); load `webawesome.css` for Light DOM |
| `Lit is in dev mode. Not recommended for production!` in the console | the dev server resolves Lit's development build | nothing to fix: the production build has no such warning |
| `unchecked-custom-elements` listing the `wa-` tags, or `ts-dom check --strict` failing on it | lint has no definition of Web Awesome's elements, so it does not check their attributes, events or `data-on-click` | nothing to fix; `--ignore=unchecked-custom-elements` with `--strict` (limitation 7) |
| `prop-forwarding` or `emit-forwarding` naming a `wa-` element | data-flow rules treat it as a child component | limitation 7 |

## See also

- Custom elements from other libraries in templates: https://github.com/Pixmi/nativele/blob/main/docs/components.md#custom-elements-from-other-libraries
- Event handlers and their parameter types: https://github.com/Pixmi/nativele/blob/main/docs/components.md#events-data-on-
- Reading a form: https://github.com/Pixmi/nativele/blob/main/docs/components.md#reading-a-form
- Light DOM, Shadow DOM and styles: https://github.com/Pixmi/nativele/blob/main/docs/components.md#light-default-and-shadow
- Plain-element lists and `replace()`: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#items-as-plain-elements-replace
- The Vite set-up and the build script: https://github.com/Pixmi/nativele/blob/main/skills/nativele-vite/SKILL.md
- The tsconfig: https://github.com/Pixmi/nativele/blob/main/skills/nativele-typescript/SKILL.md
- Lint severities and ignore lists: https://github.com/Pixmi/nativele/blob/main/skills/nativele-linting/SKILL.md
- Web Awesome's component reference ships in the package: `node_modules/@awesome.me/webawesome/dist/llms.txt`, and https://webawesome.com/docs/
