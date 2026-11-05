---
name: nativele-tailwind
description: "Style Nativele components with Tailwind CSS v4 in a Vite app that already uses Tailwind: classes in .html templates and in render, which files Tailwind scans, dynamic class names, <style scoped> next to utilities, and bringing the Tailwind stylesheet into shadow: true components. Use when a project depends on tailwindcss and @nativele/ts-dom."
metadata:
  tier: experimental
  nativele: ">=0.6.0 <0.7.0"
  verified: "2026-11-06"
  tools: "tailwindcss@4.3.4 @tailwindcss/vite@4.3.4 vite@8.3.6 typescript@7.0.2 create-vite@9.3.4"
  author: "Nativele maintainers"
  detects: "tailwindcss"
---

# Nativele + Tailwind CSS

## When to use

- A Vite app that already uses Tailwind CSS v4 through `@tailwindcss/vite` and adds components written with Nativele (`@nativele/ts-dom`), or a Nativele app that adds Tailwind that way.
- Signals: `tailwindcss`, `@tailwindcss/vite` and `@nativele/ts-dom` in `package.json`, a CSS file with `@import "tailwindcss";`.
- Not for setting Tailwind up: follow Tailwind's own guide for Vite first, and check that a utility class works on a plain page before adding Nativele. Not for Tailwind v3, the PostCSS plugin or the Tailwind CLI (not verified).
- Not for adding Nativele to Vite (`npx ts-dom skills add nativele-vite`) or writing the components (`npx ts-dom skills add nativele-core`).

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.6.0 (the last agent trial) |
| tailwindcss | 4.3.4 |
| @tailwindcss/vite | 4.3.4 |
| vite | 8.3.6 |
| typescript | 7.0.2 |
| create-vite (`vanilla-ts` template, the starting point) | 9.3.4 |

Verified on 2026-11-06 in Google Chrome 148, by reading computed styles with Playwright both against `vite` (dev) and against `vite build` served by `vite preview`, in an app made with `npm create vite@latest -- --template vanilla-ts`, given Tailwind by Tailwind's Vite guide, then Nativele by `nativele-vite`, in a git repository. With a different major version of Tailwind, treat every step as unverified.

## Set-up

The starting point: `src/style.css` is `@import "tailwindcss";`, `src/main.ts` imports `./style.css`, `vite.config.ts` has `tailwindcss()` in `plugins`, and Nativele is set up by `nativele-vite` (components in `src/nv/`, `*.html.ts` and `ts-dom-tags.ts` in `.gitignore`, `"build": "ts-dom check src/nv && vite build"`).

1. Put both plugins in `vite.config.ts`. Their order did not change the result:

   ```ts
   import { defineConfig } from "vite";
   import tailwindcss from "@tailwindcss/vite";
   import { tsDom } from "@nativele/ts-dom/vite";

   export default defineConfig({ plugins: [tsDom({ dirs: ["src/nv"] }), tailwindcss()] });
   ```

2. Keep `import "./style.css"` in the entry module. For Light DOM components (the default) nothing else is needed: Tailwind's automatic source detection reads the `.html` templates and the component `.ts` files, so a class written only in a template, only on a tag in `index.html`, or only as a full string in TypeScript (`classList.toggle("tracking-[0.3em]", on)` in `render`) is generated, in `vite dev` and in `vite build`. No `@source` is needed while the components are inside the project folder.
3. The generated `*.html.ts` files do not need to be scanned. Tailwind skips every file matched by `.gitignore` (also outside a git repository), and with the generated files not ignored the built CSS was byte for byte the same. The Skills that `ts-dom skills add` copies into `.agents/` (or `.claude/`) are scanned, though, and their example classes end up in the build; exclude that folder under the import, relative to the CSS file: `@source not "../.agents";`.
4. Only when templates live outside the project folder (for example a sibling package of a workspace), add a `@source` line, with the path relative to the CSS file:

   ```css
   /* src/style.css */
   @import "tailwindcss";
   @source "../../shared-nv";
   ```

   For Nativele, a package of the workspace generates and checks its own components and the app imports it, as `npx ts-dom skills nativele-monorepo` sets up. A plain folder outside the project that the app scans itself goes into `tsDom({ dirs })`, the arguments of `ts-dom check` and `ts-dom doctor`, and the tsconfig (`nativele-typescript`); keep each component's `.ts` next to its template there (a template whose importer is in another folder is reported as `no-importer`), and the folder must resolve `@nativele/ts-dom` itself, or `tsc` reports `TS2307` for its generated `.html.ts`.

5. Only for `shadow: true` components: add one module that turns the same CSS into a constructable stylesheet, and adopt it in each Shadow component's constructor (limitation 3 explains why and what it costs):

   ```ts
   // src/tailwind-sheet.ts
   import css from "./style.css?inline";

   export const tailwindSheet = new CSSStyleSheet();
   tailwindSheet.replaceSync(css);
   ```

   ```ts
   constructor() {
     super();
     this.shadowRoot!.adoptedStyleSheets = [tailwindSheet];
   }
   ```

   `?inline` is typed by `vite/client`, which the template's `tsconfig.json` already lists in `types`.

## Example

A Light DOM component with Tailwind classes in the template, a class toggled in `render`, a class picked from full strings, and a scoped rule that utilities may override:

```html
<!-- src/nv/status-card.html -->
<style scoped>
  :scope { display: block }
  @layer components {
    .note { color: var(--color-slate-600) }
  }
</style>
<div class="rounded-lg bg-lime-300 p-4">
  <p data-ref="heading" class="font-bold">{{ heading }}</p>
  <p data-ref="level" class="note">{{ level }}</p>
</div>
```

```ts
// src/nv/status-card.ts
import { Component, define } from "@nativele/ts-dom";
import tpl from "./status-card.html.js";

const LEVEL = { ok: "text-emerald-900", warn: "text-rose-900" } as const;

export class StatusCard extends Component(tpl, {
  props: { heading: "", level: "ok" as keyof typeof LEVEL, wide: false },
}) {
  override render(view: { heading: string; level: keyof typeof LEVEL; wide: boolean }): void {
    this.refs.heading.classList.toggle("tracking-[0.3em]", view.wide);
    this.refs.level.className = `note ${LEVEL[view.level]}`;
  }
}
define("status-card", StatusCard);
```

A Shadow DOM component that adopts the Tailwind sheet from step 5:

```html
<!-- src/nv/badge-box.html -->
<div class="rounded-xl bg-violet-300 p-4 shadow-lg"><slot></slot></div>
```

```ts
// src/nv/badge-box.ts
import { Component, define } from "@nativele/ts-dom";
import { tailwindSheet } from "../tailwind-sheet.ts";
import tpl from "./badge-box.html.js";

export class BadgeBox extends Component(tpl, { shadow: true }) {
  constructor() {
    super();
    this.shadowRoot!.adoptedStyleSheets = [tailwindSheet];
  }
}
define("badge-box", BadgeBox);
```

```ts
// src/main.ts
import "./style.css";
import "./nv/status-card.ts";
import "./nv/badge-box.ts";
```

```html
<!-- index.html (body) -->
<status-card class="mt-2" heading="Build" level="warn"></status-card>
<badge-box>inside</badge-box>
<script type="module" src="/src/main.ts"></script>
```

## Known limitations

1. **Class names must be complete strings in a scanned file.** A class built from pieces (`` `text-${tone}-800` ``) is set on the element but has no CSS, in dev and in the build. Pick from full strings instead (the `LEVEL` map in the example), or, when the set really is open, list the classes in the CSS with `@source inline("text-{amber,rose}-800");`.
2. **Template `<style>` is not processed by Tailwind.** Nativele injects it as written, so `@apply` in it does nothing (verified in a Light DOM `<style scoped>`). Use the theme variables instead (`color: var(--color-teal-400)`): Tailwind emits a theme variable only when it finds its name in a scanned file, and it does find it in the `.html` template.
3. **Shadow DOM needs the sheet adopted, and the document still needs the stylesheet.** Document styles do not reach a shadow root (see the Light and Shadow table in the components guide), so a `shadow: true` component without step 5 shows its Tailwind classes unstyled. Ways that were tried:

   | Way | Result |
   |---|---|
   | `adoptedStyleSheets` with `./style.css?inline` (step 5) | styled on the first frame, in dev and build; a class added to a Shadow template during `vite dev` applies after the reload. Costs: the whole Tailwind CSS is in the JavaScript a second time (in the verified app the CSS file was 8.0 kB, and the JavaScript grew by 8.4 kB minified, 2.4 kB gzip), and it is parsed once more; one shared `CSSStyleSheet` serves every instance |
   | A `<link rel="stylesheet">` with `href` from `./style.css?url`, prepended to the shadow root in the constructor | works, and in the build `?url` points at the same CSS file the page already links (no second copy); but the component is unstyled until the stylesheet loads (a flash of unstyled content) |
   | A `<style>` in the template | cannot hold Tailwind output: it is not processed (limitation 2) |

   Use `adoptedStyleSheets`. Keep `import "./style.css"` in the entry anyway: Tailwind declares its internal variables with `@property`, which the browser registers only from the document. With the sheet adopted only in a shadow root and none in the document, plain utilities (`bg-violet-300`) worked but `shadow-lg` and `translate-x-[5px]` computed to `none`. When components do not need Shadow DOM's isolation, prefer Light DOM: it needs none of this.
4. **Template styles beat utilities, whatever the specificity.** Tailwind puts utilities in `@layer utilities`, and the `<style>` Nativele injects is not in a layer, so a rule in `<style scoped>` overrides a utility on the same element (`.scoped-red` beat `text-sky-600`). To let utilities override a template's defaults, wrap those rules in `@layer components { }` inside the `<style scoped>` (as in the example); for a single element, the important modifier (`text-sky-600!`) also wins.
5. **A `dark` class on `<html>` does not reach a shadow root.** With the class-based variant (`@custom-variant dark (&:where(.dark, .dark *));`), `dark:` utilities inside a `shadow: true` component match only an ancestor inside the same shadow root. Copy the class onto the component's inner wrapper (a `data-ref="wrapper"` element around everything that uses `dark:`), once at connect and on every change; the `sync()` at connect also covers a component created after dark mode was turned on:

   ```ts
   override connected(): void {
     const root = document.documentElement;
     const sync = (): void => {
       this.refs.wrapper.classList.toggle("dark", root.classList.contains("dark"));
     };
     const observer = new MutationObserver(sync);
     observer.observe(root, { attributes: true, attributeFilter: ["class"] });
     this.onCleanup(() => observer.disconnect());
     sync();
   }
   ```
6. Not verified: Tailwind v3, `@tailwindcss/postcss` and the Tailwind CLI; Vite's `root` in a sub-folder; `dark:` from the `prefers-color-scheme` default inside a shadow root; Nativele components shipped as a package in `node_modules`; a template `<style>` inside a `shadow: true` component together with Tailwind; the CSS nesting fallback of `<style scoped>` in browsers without `@scope`; Tailwind's `prefix()` option and the `dark:` variant inside a shadow root.

## Verify

Run in the project:

```sh
npm run build                     # expect: ts-dom check: no issues, then ✓ built
npx ts-dom doctor src/nv          # expect: ts-dom doctor: the set-up looks right
grep -cF '<a class used only in one of your templates>' dist/assets/*.css   # expect: 1
grep -cF '<a class used only in an installed Skill file>' dist/assets/*.css   # expect: 0 (the @source not line of step 3)
```

For an arbitrary value, search for the escaped form (`grep -cF 'p-\[13px\]'`). Then, against both `npm run dev` and `npx vite preview`, read computed styles in the browser, for example:

```js
getComputedStyle(document.querySelector("status-card").firstElementChild).backgroundColor   // not "rgba(0, 0, 0, 0)"
getComputedStyle(document.querySelector("badge-box").shadowRoot.firstElementChild).boxShadow // not "none"
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A class set in `render` does nothing; the element has it in the DOM | the class name is built from pieces | use full strings, or `@source inline(...)` (limitation 1) |
| Utilities inside a `shadow: true` component do nothing | document styles do not reach a shadow root | step 5 |
| In a Shadow component colors and padding work, but `shadow-*`, `ring-*` or `translate-*` compute to `none` | the stylesheet is adopted in the shadow root but missing from the document, so Tailwind's `@property` variables are not registered | keep `import "./style.css"` in the entry |
| A Shadow component flashes unstyled on load | the stylesheet comes from a `<link>` | `adoptedStyleSheets` (step 5) |
| A utility on an element does not override the template's `<style scoped>` rule | unlayered template styles beat `@layer utilities` | wrap the template rule in `@layer components { }`, or use the `!` modifier |
| `@apply` in a template `<style>` has no effect | template styles are not processed by Tailwind | use theme variables (`var(--color-...)`) or utility classes in the markup |
| Templates in another folder of a workspace are not styled | they are outside the project folder Tailwind scans | `@source "<path relative to the CSS file>"`; how the app gets the package's components is in `nativele-monorepo` |
| The built CSS has classes no component uses, from the Skill files | Tailwind scans `.agents/` (or `.claude/`), where `ts-dom skills add` puts the Skills, unless `.gitignore` matches it | add `@source not "../.agents";` (relative to the CSS file) under `@import "tailwindcss";` |
| A check that a class is absent from the build fails, although no component uses it | Tailwind scans every file in the project that `.gitignore` does not match, including test scripts that name the class | keep such scripts outside the project, or build the class name from pieces in them |

## See also

- Light DOM and Shadow DOM, and what reaches a shadow root: https://github.com/Pixmi/nativele/blob/main/docs/components.md#light-default-and-shadow
- `<style>` and `<style scoped>` in templates: https://github.com/Pixmi/nativele/blob/main/docs/components.md#styles
- Common DOM operations in `render` (classes): https://github.com/Pixmi/nativele/blob/main/docs/components.md#common-dom-operations-in-render
- The Vite plugin: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#with-vite-optional
- Adding Nativele to Vite: `npx ts-dom skills nativele-vite`
- Components from another package of a workspace: https://github.com/Pixmi/nativele/blob/main/skills/nativele-monorepo/SKILL.md
