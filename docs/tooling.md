# Setup, checks and lint

Part of the [Nativele](../README.md) documentation.

## Installation and Setup

You only need TypeScript; **no Vite or any other bundler is required**:

```sh
npm i -D typescript
npm i @nativele/ts-dom
```

`tsconfig.json` (the same as in an ordinary TS project, with no special options):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "rootDir": "src",
    "outDir": "out"
  }
}
```

Set `"type": "module"` in `package.json`: with `"module": "NodeNext"`, a package without it is CommonJS, so `tsc` emits `require`/`exports` and the browser stops with `ReferenceError: exports is not defined`.

Workflow: first generate the template modules, then compile and type-check with `tsc`.

```sh
npx ts-dom gen        # generate x.html.ts for every x.html under src/
npx tsc               # type-check and compile to out/
```

Whitespace in text is kept as written. To keep only the whitespace the browser renders, use `npx ts-dom gen --whitespace=collapse` or the Vite plugin option `whitespace: "collapse"`: a run of whitespace between two inline-level siblings (text, `<a>`, `<b>`, `<span>`, `<button>`, `<input>`, custom elements) becomes one space, line breaks included; whitespace next to a block-level element (`<div>`, `<p>`, `<li>`, headings, table parts) and at the start and end of a block or inline-block element's content is dropped; an inline element keeps one space at the start and end of its content; a non-breaking space (`&nbsp;`) is kept; `<pre>`, `<textarea>`, `<style>` and `<script>` are left alone. In SVG, the content of a `<text>` follows the inline rule (`<tspan>`, `<textPath>` and `<a>` in it are inline), and whitespace between other SVG elements is dropped. It decides by each element's default display, as formatters such as Prettier and oxfmt do for HTML, so an element whose CSS changes its display is still judged by its tag: a `<div>` styled `display: inline` loses the space next to it. With a formatter, `collapse` keeps the rendered text and `textContent` unchanged when a template is reformatted, with one exception: Prettier treats SVG text as blocks and puts a line break between text and a `<tspan>` that touch, which renders as a space (oxfmt does not). Each generated file records its mode, and a run without `--whitespace` keeps the mode a file was last written with (a new file gets `preserve`), so pass `--whitespace=preserve` to switch back. `check` and `doctor` accept `--whitespace=`, `--include=` and `--exclude=` as `gen` does, and use them to decide which generated files are stale.

To scan several folders of one package, list them: `npx ts-dom gen src/app src/shared` (the same for `--check`, `--watch`, `check`, `doctor` and `lint`, and the Vite plugin's `dirs` option). The folders are generated together: a template in one folder that uses a component defined in another gets the import of that component, as the relative path from the template to the file with the `define()`, and a tag defined with different classes in two folders is a `duplicate-define` error. Do not scan another package's folder: the relative imports are written into that package's generated files. A package of shared components generates its own files, and the app imports the package.

During development, use `npx ts-dom gen --watch` to keep watching `.html` files, together with `tsc --watch`. Each change reads the files again, and parses only the templates it regenerates.

The generated files (`x.html.ts` next to each template, and `ts-dom-tags.ts` in each scanned folder) are derived from the templates, so most projects do not commit them: add `*.html.ts` and `ts-dom-tags.ts` to `.gitignore`.

`npx ts-dom gen --check` writes nothing: it lists generated files that are missing, outdated (their template or a `define()` changed) or orphaned (their template was deleted, or a `ts-dom-tags.ts` is left in a subfolder that is not itself scanned, for example after the components moved), and exits with code 1 if there are any (`--json` for machine-readable output). Use it in CI if your project commits the generated files, or to confirm they are fresh before reading type errors.

In your code, import templates with a `.js` suffix (standard NodeNext style; TS maps it to the generated `x.html.ts`):

```ts
import tpl from "./user-card.html.js";
```

### Running in the browser (no bundler)

The compiled JS is standard ES modules. Only one bare module specifier, `@nativele/ts-dom`, needs to be mapped, and an import map does it:

```html
<script type="importmap">
  { "imports": { "@nativele/ts-dom": "/node_modules/@nativele/ts-dom/dist/index.mjs" } }
</script>
<user-card></user-card>
<script type="module" src="/out/main.js"></script>
```

This workflow (installing only `typescript`, no Vite, from `gen` to running in a real browser) is verified automatically by `npm run smoke:no-bundler`.

### With Vite (optional)

When you use a bundler you do not need an import map. The `@nativele/ts-dom/vite` plugin is just a convenience: it generates the `.html.ts` files when the build, the dev server or Vitest starts, watches `.html` and regenerates during dev, and offers optional ARIA warnings. It never type-checks: run `ts-dom check` (or `ts-dom gen` and `tsc`) for that. A template that codegen rejects is printed only in the terminal that runs Vite (at build start the build fails; in dev the page keeps the last generated module), not in the browser.

```ts
import { defineConfig } from "vite-plus"; // or "vite"
import { tsDom } from "@nativele/ts-dom/vite";

export default defineConfig({
  plugins: [tsDom()], // options: dirs (default ["src"]), runtime, whitespace, include, exclude, a11y
});
```

While the dev server runs, the plugin keeps the generated files in step: adding or editing a template regenerates its `x.html.ts` and, when the module has been loaded, sends a full reload to every connected client (a save that changes nothing does not reload), deleting a template removes its `x.html.ts`, and adding or removing a `define()` updates `ts-dom-tags.ts` and the child imports of the templates. `dirs` are relative to Vite's `root`, not the working directory; an entry that does not exist there is reported as a `dir-not-found` warning when the build or dev server starts. The page reloads rather than hot-swapping the component because a custom element tag can be defined only once, so a new class cannot replace the running one.

A `vitest.config.ts` replaces `vite.config.ts` for Vitest, so add `tsDom()` to its `plugins` too, or merge the Vite config into it (`mergeConfig(viteConfig, defineConfig({ test: {} }))` with `viteConfig` imported from `./vite.config`); otherwise the tests start without generated files.

Vite loads `vite.config.ts` as an ES module only when `package.json` has `"type": "module"` (`npm pkg set type=module`); without it, Vite warns that the config is loaded as CommonJS.

When installing, we recommend installing `vite-plus` first and then `ts-dom` (when both are installed in the same npm run, `vite` may not be hoisted to the top level).

### Lint (optional)

```ts
// lint settings in vite.config.ts (vp lint / oxlint)
lint: {
  ignorePatterns: ["node_modules", "dist", "**/*.html.ts", "**/ts-dom-tags.ts"],
  jsPlugins: [{ name: "ts-dom", specifier: "@nativele/ts-dom/oxlint" }],
  rules: {
    "ts-dom/unused-markup": "error",
    "ts-dom/a11y": ["warn", { ignore: [] }], // optional: ARIA checks, see [ARIA / Accessibility Checks](#aria--accessibility-checks)
    "ts-dom/data-flow": ["warn", { ignore: [] }], // optional: avoid passing props and events layer by layer, see [Data Flow](components.md#data-flow-props-down-events-up)
  },
},
```

The same module is an ESLint plugin for flat config (verified with ESLint 9 and 10, with typescript-eslint's parser for `.ts` files): `import tsDom from "@nativele/ts-dom/oxlint"` and a config object `{ plugins: { "ts-dom": tsDom }, rules: { "ts-dom/unused-markup": "error" } }`. ESLint does not read `.gitignore`, so add the generated files to its ignores: `globalIgnores(["**/*.html.ts", "**/ts-dom-tags.ts"])` from `eslint/config`.

Each rule id is also a rule of its own, so a project can enable rules one by one and give each its own severity, for example `"ts-dom/unused-ref": "warn"` or `"ts-dom/unused-text": "error"` instead of the whole `ts-dom/unused-markup` group. `ts-dom rules` lists the ids. The exception is `no-importer`, which only `ts-dom lint` reports: the oxlint plugin reports inside the file it lints, and a template that no class uses has no such file.

**In the editor.** Install the Oxc extension for VS Code (it runs `oxlint --lsp`) and keep the plugin in your oxlint config: the findings show as you type on the import that brings the template into the file of the class that uses it: the template's own import, or the import of a module that re-exports it. The plugin offers no fixes: a fix can only change the file being linted, and the problems it reports live in the HTML (an unused `data-ref`, a missing `alt`); for markup structure and layout use a formatter such as oxfmt. A `data-on-*` method that the class does not define is not a lint finding: tsc reports it at the `define()` call, and `ts-dom check` points it at the template as `missing-handler`.

Without oxlint, the same checks are available through the CLI:

```sh
npx ts-dom lint [dirs...]   # unused markup (errors) and data flow suggestions (warnings)
npx ts-dom lint --a11y      # additionally check ARIA / accessibility (warnings)
npx ts-dom lint --strict    # warnings also make the exit code 1 (errors always do)
npx ts-dom lint --ignore=unchecked-custom-elements   # leave out the warnings with this rule id (repeatable; also for ts-dom check)
npx ts-dom lint --json      # output JSON: { "issues": [{ file, line, col, severity, rule, message }] }
npx ts-dom rules            # list all rule ids and descriptions
npx ts-dom rules --explain=unused-ref   # why the rule exists, a wrong example and the fix
npx ts-dom rules --json     # every rule as data: { id, group, description, why, bad, good }
```

Every message has the same format. It explains **what is wrong, why, and how to fix it**, and includes the line and column in the HTML:

```
a.html:2:1 error [unused-ref] data-ref="dead" is never used by the component class. Fix: use this.refs.dead, or remove the attribute if the element needs no TypeScript access.
a.html:3:1 warning [unknown-prop] <x-kid lable> is not a declared prop of <x-kid>. Declared props: label, count. Did you mean "label"? Fix: declare "lable" in the child's props option, or remove the attribute.
```

`ts-dom lint` and `ts-dom check` also print `unchecked-custom-elements` once per run when the templates use custom elements that lint has no single definition of, so their attributes, events and `data-on-click` are not checked: at the first use of the first one, it lists the tags by cause, each cause with its fix:

| Cause | Fix |
| --- | --- |
| No `define()` in the scanned folders | For the project's own components, add the folders that define them to the scanned folders |
| `define()` passes a class that lint cannot follow through relative imports to a class extending `Component(...)` in the scanned folders (named with the `define()` location) | For a Nativele component, declare the class in the scanned folders and import it by a relative path where `define()` is called |
| Defined in several packages, and not exactly once in the template's package (named with the packages) | Keep one `define()` of a tag per package |

Elements that are not Nativele components, such as another library's or a plain custom element, need no change; silence the warning with `--ignore=unchecked-custom-elements`, which a `--strict` run needs. The oxlint plugin does not report it, as it would repeat it in every file.

Exit codes: 0 = no problems, 1 = there are errors (or warnings when `--strict` is used). Messages from the oxlint plugin start with `./x.html.js:line:column [rule id] message` and are reported on the `import` line.

Recommended check workflow: `ts-dom check` (it runs `gen`, `tsc` and `lint` in one pass; see [Checks](#checks)).

## Checks

Each tool checks what it can see, and none repeats another:

| Tool | What it checks |
|---|---|
| A formatter such as oxfmt (`oxfmt --check`, or `vp fmt --check`) | Whether the template markup is well formed (a misnested closing tag such as `<p><div></p></div>` is a syntax error there, while the HTML parser the library uses would silently repair it into a different tree) and laid out consistently. It knows nothing of `{{ }}` or `data-*` names. Generate with whitespace `collapse` when you use one, or reformatting can change the spacing on the page. |
| `ts-dom gen` | The template rules: holes, `data-each`, `data-if`, `data-on-*`, forbidden markup. |
| `tsc` | That every name in the HTML exists in the component with the right type, and that lists, props and events fit. |
| `ts-dom lint` / the oxlint plugin | What the HTML declares but the class never uses, data flow between components, accessibility. |
| `ts-dom doctor` | The project set-up that the other tools depend on. |
| `ts-dom check` | Runs `gen`, `tsc` and `lint` in one pass and points the template contract errors at the template. |

Four complementary checks. **Every message has a stable rule id and explains what is wrong, why, and how to fix it**; `npx ts-dom rules` lists all rules.

**When the set-up itself may be wrong: `npx ts-dom doctor [dirs...]`.** It checks what a project needs before any of the checks can work: a tsconfig with `strict` (required on TypeScript 5, which leaves it off, and when the installed version cannot be determined; on 6 and 7 it only must not be `false`), the DOM lib, a module resolution that resolves the runtime package the generated files import (not `classic`, which TypeScript 5 also picks when `module` is ES2015 to ESNext and `moduleResolution` is left out), an `include` that covers the template folders, and an `include` and `exclude` that keep `ts-dom-tags.ts` in the program (`tsconfig-misses-tag-map`, an error, unless a file in the program imports or re-exports it, as a component package's entry does; otherwise its tags would be typed as plain `HTMLElement`); the runtime package being installed; templates imported as `./x.html.js` (not `./x.html`); generated files that are stale; the Vite plugin and the oxlint plugin being configured, including a `vitest.config.*` that replaces the Vite config without the plugin (`vite-plugin-missing`); when a formatter such as oxfmt or Prettier is set up, templates generated with whitespace `collapse`, and generated files that were written with `preserve` while the scripts or the Vite config ask for `collapse` (`formatter-whitespace`); a package.json script (with its `pre` script and the scripts it runs through `npm run`) that runs `tsc`, `vue-tsc`, `svelte-check` or `ng build`/`serve`/`test` before any `ts-dom gen` or `ts-dom check` while `.gitignore` leaves out `*.html.ts`, which fails with TS2307 on a clean checkout (`typecheck-before-gen`, skipped for a `tsc -p` whose config covers none of the scanned folders); and an `.html` in a scanned folder that a TypeScript file names as an Angular `templateUrl`, which is a framework template and means the folder should not be scanned (`framework-template`). `.gitignore` files, Skill copies, and formatter and oxlint configuration are read from the folder up to the workspace root, nearest first, and never above the home directory (a `package.json` with `workspaces`, a `pnpm-workspace.yaml`, else the git root), and the oxlint (`.oxlintrc.json`, `.oxlintrc.jsonc`), Prettier (`.prettierrc*`, `prettier.config.*`, the `prettier` key of `package.json`) and oxfmt (`.oxfmtrc.json`, `.oxfmtrc.jsonc`, `oxfmt.config.*`) config files are all recognized. `--project=<path>` picks the tsconfig to check, and with `--strict` a warning also gives exit code 1 (errors always do). Every issue has a stable rule id and a `Fix:` hint, and `--json` prints them as data.

**One command for all of them: `npx ts-dom check [dirs...]`.** It reports template diagnostics, regenerates the generated files (with `--no-write` it reports stale ones instead), runs the project's own `tsc` (TypeScript 5, 6 or 7; `--project=` picks the tsconfig, and a solution-style tsconfig, with `"files": []` and `references`, runs `tsc` once per referenced project; when the project's package.json lists `vue-tsc` in dependencies or devDependencies, it runs that instead, so `.vue` files are checked too), and runs the lint rules (`--a11y` adds the accessibility checks). TypeScript errors that come from the template contract point at the template, not at the `Component(...)` call: a `{{ title }}` with nothing named `title` is reported at its line and column in the `.html` as `missing-binding`, a missing handler as `missing-handler`, and a handler whose first parameter does not accept the event it is bound to as `handler-event-type` at its `data-on-*` attribute, with the event type in the `Fix:`. The generated type carries the template's path relative to the scanned folder, and these errors name it (`template: "card.html"`), so they point at the right template also when `define()` is in another file than the class, or one file declares several classes; item component problems get their own rule ids, and the errors that only follow from a broken class are left out in the broken component's own file, including the parameters of callbacks inside its body that lose their type with it (a `bind` callback's parameter, say), and in `node_modules`; an error inside the body that does not follow from it, such as `const s: string = 42`, is kept; in other files they are kept and their message says which contract error they follow from. A class in such an error is the one its name refers to in that file, so a class of the same name in another file is not mistaken for it. A tag declared with two different classes by two tag maps in one program (TS2717 in `ts-dom-tags.ts`) is reported as `duplicate-define`. Without TypeScript installed `tsc-not-found` is an error, so a CI job that omits the dev dependencies fails instead of passing unchecked. An error located in a generated `x.html.ts` or `ts-dom-tags.ts` says to run `ts-dom gen`, or to delete the file when it is left over from a template or folder that is no longer scanned, instead of to edit it. `--json` prints the issues as data, and the exit code is 1 when there is an error (with `--strict`, a warning too).

Which command writes files:

| Command | Writes | Runs |
|---|---|---|
| `ts-dom gen` | the generated `x.html.ts` files and `ts-dom-tags.ts`, and deletes orphaned ones | codegen only |
| `ts-dom gen --check` | nothing | codegen only: lists missing, outdated or orphaned generated files |
| `ts-dom check` | the generated files (they are derived and not committed, so this is what a developer or an agent wants after a change) | codegen, `tsc`, lint |
| `ts-dom check --no-write` | nothing: stale generated files are reported instead of refreshed, and `tsc` runs on the files as they are | codegen, `tsc`, lint |

In a CI job, `ts-dom check --no-write` (or `ts-dom gen --check` when you only want to know whether the generated files are current) only works when the generated files are committed: on a clean checkout without them it fails, because every generated file is missing. When they are git-ignored, run `ts-dom check`, then check that the working tree is unchanged (`git status --porcelain` prints nothing).

1. **codegen diagnostics** (`ts-dom gen` and the Vite plugin, with line and column numbers; on errors they abort and write no files): duplicate `data-ref`, `data-each` without a single root element, `data-each` not on a `<template>`, nested `data-each`, an incomplete or invalid `data-key` / `data-prop`, a `data-key` list whose item is not one custom element, `data-if` on an item root element, `<slot>` inside an item, `<style>` not at the first level, invalid holes, holes inside attributes, invalid `data-on-*` (including names that collide with DOM or ts-dom members), `<html>`, `<head>` and `<body>` inside a template, and markup that runs code or Trusted Types blocks: `<script>`, `on*` attributes, `srcdoc`, and `javascript:` URLs.
2. **tsc**: an error when TypeScript uses a name the HTML does not declare (`this.refs.nope`, `this.show("nope", true)`); all constraints between `state`, `props`, `derive`, `emits` and the HTML (see [Data Flow](components.md#data-flow-props-down-events-up)); child component prop names and types; `define()` checks that the methods for `data-on-*` exist and that their first parameter accepts the event the HTML binds them to.
3. **Runtime**: `Component()` and components, at definition, connection, and use, throw errors that carry a `[rule id]` and a fix for the same problems.
4. **lint** (`ts-dom/unused-markup`, `ts-dom/data-flow`, `ts-dom/a11y`): markup declared in the HTML but never used (errors, with the HTML location), data flow suggestions and child component contracts (warnings), ARIA (warnings).

Rules of `unused-markup`:

| Id | Detection |
|---|---|
| `unused-ref` | A `data-ref` is not used by the component |
| `unused-if` | A `data-if` is never toggled (`data-if` is hidden by default, so the content never appears) |
| `unused-text` | A `{{ hole }}` is never filled and displays blank |
| `unused-list` | A `data-each` is never rendered, so the list is always empty |
| `unused-item-name` | A name inside a list item is never referenced |
| `no-importer` | No component class passes this template to `Component()`, and no TypeScript file imports it (a module that only re-exports it does not count) |

lint compares per **class body** of `class X extends Component(tpl)`, where `tpl` is followed through the imports to its template: a default import of the `.html.js`, or a name exported by a module that re-exports it (`export { default as cardTpl } from "./card.html.js"`, `export *`), or a member of a namespace import (`import * as t from "./templates/index.js"` with `Component(t.card)`, a barrel's `export * as t from ...`), in any scanned file. When the `state` / `props` / `derive` options are used, `{{ }}` and `data-if` are handled by automatic binding and are not required to appear in the code (if the code uses dynamic access such as `refs[k]`, `text[k]`, or `lists[k]`, it cannot tell which names are used, so it conservatively treats all of them as used). Hence importing multiple templates in the same file does not make them overwrite each other:

```ts
import listTpl from "./list.html.js";   // data-ref="title"
import cardTpl from "./card.html.js";   // data-ref="title" (Card never uses it)
class List extends Component(listTpl) { connected() { this.refs.title.hidden = true } }
class Card extends Component(cardTpl) {}   // → reports that title in card.html is unused
```

Note: refs, text, and so on should be used by the component's own class. Access through an instance outside the class (for example in tests) is not counted. Turning this rule off for test directories silences only templates that a test file imports itself: a ref that only a test reads is still reported in the component, so remove it and query the DOM in the test. A module that imports the template of a class (a story, a test helper) does not count; when no class uses the template (for example when `Component` is wrapped by a helper, or the module only calls `tpl.instantiate()`), the whole text of the modules that import it is compared instead.

## Skills

The package ships Skills: task procedures for coding agents (set-up, a complete example, known limitations, verification commands, and the exact versions they were verified with).

```sh
npx ts-dom skills                     # list them: tier, verified date and versions, stale or not
npx ts-dom skills --json              # the same as data
npx ts-dom skills nativele-react      # print one
npx ts-dom skills add nativele-core   # copy into .claude/skills/ when the project has .claude, otherwise .agents/skills/
npx ts-dom skills add nativele-core --to=tools/skills
```

A Skill is marked stale when its verification is more than six months old or its range of Nativele versions does not include the installed one. `ts-dom skills add` only copies files; it installs nothing. `ts-dom doctor` reports, as `info` that never changes the exit code, the Skills whose dependencies the project has and that it has no copy of (`skill-available`), and a copy that differs from the one shipped with the installed version (`skill-outdated`; run `ts-dom skills add` again to replace it). The format of a Skill and how to contribute one are in [skills/README.md](../skills/README.md).

## ARIA / Accessibility Checks

**Off** by default. When enabled, it produces **warnings** (not errors) for places in the template where ARIA or a label is recommended. There are three ways to enable it, all sharing the same checks:

```ts
// 1. lint: shown by both the editor and vp lint, warnings are reported on the import line (the message contains the html line and column)
lint: { rules: { "ts-dom/a11y": ["warn", { ignore: ["img-alt"] }] } }

// 2. build: shown in the terminal during dev / build
plugins: [tsDom({ a11y: true })]            // or { a11y: { ignore: ["img-alt"] } }
```

```sh
# 3. CLI
npx ts-dom lint --a11y [--strict]
```

All three read the components defined in the scanned folders, so `click-semantics` on a component's tag gives the same result everywhere. The Vite plugin and the oxlint plugin read the folders and files again for each save or lint, so a change anywhere, such as a child template that loses its `<button>`, a `define()` in a new file or a `package.json` added, is seen at once; between runs they keep only what is computed from a file's content, found by that content, so a template is parsed again only when it or a template or TypeScript file its warnings came from has changed. The Vite plugin prints the warnings of the saved template and of the templates whose warnings changed. The oxlint plugin lints a file as oxlint gives it, unsaved edits included. The Vite plugin and the oxlint rule report per template, so `unchecked-custom-elements`, which is reported once per run, comes only from `ts-dom lint` and `ts-dom check`.

`ignore` takes rule ids and can turn off individual checks:

| Id | Check |
|---|---|
| `img-alt` | `<img>` needs `alt` (use `alt=""` for decorative images) |
| `control-name` | `<button>`, `<a href>`, and `<summary>` need a readable name (text, `{{ }}`, `aria-label`, or `aria-labelledby`), in their composed content (see below) |
| `form-label` | `<input>`, `<select>`, and `<textarea>` need a `<label for>`, to be wrapped by a `<label>` (also one around the slot of a Nativele component's template that the control is put in), or `aria-label` |
| `iframe-title` | `<iframe>` needs `title` |
| `dialog-name` | `<dialog>` needs `aria-label` or `aria-labelledby` |
| `heading-empty` | `h1`–`h6` must not be empty, in their composed content (see below) |
| `aria-role` | `role` must be a valid ARIA role |
| `aria-attr` | `aria-*` must be a valid ARIA attribute |
| `role-tabindex` | A non-natively-focusable element with an interactive role (button, tab, checkbox…) needs `tabindex`, with or without a `data-on-click` |
| `tabindex-positive` | Do not use a `tabindex` greater than 0 |
| `hidden-focusable` | A focusable element must not have `aria-hidden="true"` |
| `label-for` | `<label for>` must point to an `id` that exists in the template |
| `id-in-list` | An `id` inside a `data-each` item is duplicated with each item; use `data-ref` or a class instead |
| `duplicate-id` | An `id` must not be duplicated within a template |
| `aria-idref` | The ids referenced by `aria-labelledby`, `describedby`, `controls`, `owns`, etc. must exist in the template (use `ignore` to turn it off when pointing to elements outside the template) |
| `heading-order` | Heading levels must not skip (`h3` directly after `h1`), judged by document order within the template |
| `table-header` | `<table>` needs `<th>`; for layout tables set `role="presentation"` |
| `list-structure` | The children of `<ul>`/`<ol>` (including the root element of a `data-each` item) must be `<li>`; `<li>` must be inside `<ul>`, `<ol>`, or `<menu>` |
| `landmark-label` | When a template has multiple `<nav>` or `<aside>`, they need to be distinguished with `aria-label` |
| `redundant-role` | `role` is the same as the element's native semantics, for example `<button role="button">` |
| `click-semantics` | `data-on-click` should be on an operable element (`button`, `a[href]`, `input` other than `hidden`, `select`, `textarea`, `summary`, `contenteditable`, or an element with an interactive role plus `tabindex`), or on an element whose composed content (see below) holds one, such as a `<label>` or a `<ul>` around it or a component whose template has one (a click on that control, by keyboard too, reaches the handler around it); otherwise keyboards and assistive technologies cannot use it. An element with an interactive role is left to `role-tabindex`, so every element is judged by one of the two rules whichever of them is turned off. On a Nativele component's tag the message names the component's template. |
| `unchecked-content` | One warning per element that `click-semantics`, `control-name` or `heading-empty` cannot judge, because the content lint can read would fail the rule and the element also holds content lint cannot read (see below); it names the rules and that content |

`click-semantics`, `control-name` and `heading-empty` judge an element's **composed content**: its own descendants, and for each Nativele component inside it the descendants of that component's template, with each `<slot>` replaced by what the element using the component puts in it (by slot name; a slot that gets nothing shows its fallback content, and content for a slot the component does not have is not shown). Two kinds of content lint cannot read: a custom element whose template it cannot read, and a `<slot>` of the template being checked, which its user fills (its fallback content is read). For each such custom element `unchecked-content` names the cause and its fix, in the words `unchecked-custom-elements` uses:

| Cause | Fix |
| --- | --- |
| No `define()` in the scanned folders (another library's element, or a component outside the scanned folders) | For the project's own components, add the folders that define them to the scanned folders |
| `define()` passes a class that lint cannot follow through relative imports to a class extending `Component(...)` in the scanned folders | Declare the class in the scanned folders and import it by a relative path where `define()` is called |
| Defined in several packages, and not exactly once in the template's package | Keep one `define()` of a tag per package |
| The class passes `Component()` a template lint cannot follow to an `.html` file imported by a relative path (a template built by a function, or one imported from a package), named with the class's location | Pass `Component()` a template imported by a relative path, such as `import tpl from "./x.html.js"` |
| The template file the class imports does not exist, named with its path | Restore the template file or correct the import path in the class |

Content lint can read decides when it is enough: `<button><wa-icon></wa-icon> Save</button>` has a name, and `<div data-on-click><wa-icon></wa-icon><button>…</button></div>` holds an operable element. When the content lint can read would fail the rule, the rule is not reported, since the unreadable content may be what makes the element right (a `<div data-on-click>` around a `<wa-button>`), and `unchecked-content` is reported instead, so `<div data-on-click="open"><wa-icon name="x"></wa-icon> Open</div>`, a `<button><slot></slot></button>` and an `<h2>` around only a `<slot>` are not passed over silently. Check such an element by hand, then pass `--ignore=unchecked-content` (or `ignore` in the Vite and oxlint options) once the elements it names are right. A custom element that itself has `data-on-click` and has no contract (one of the first three causes) is left to `unchecked-custom-elements`.

To avoid many false positives, elements with `data-ref` are treated as "managed by TS", and the checks whose "name or reference may be set in TS" are skipped for them: `img-alt`, `control-name`, `form-label`, `iframe-title`, `dialog-name`, `heading-empty`, `role-tabindex`, `table-header`, `landmark-label`, `aria-idref`.

This is a static check that looks only at the HTML template: it does not analyze attributes that TS adds at runtime, and it does not cover items that can only be judged with actual rendering, such as color contrast, focus management, and keyboard interaction, so it cannot replace tools like axe and manual testing.
