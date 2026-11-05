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

Workflow: first generate the template modules, then compile and type-check with `tsc`.

```sh
npx ts-dom gen        # generate x.html.ts for every x.html under src/
npx tsc               # type-check and compile to out/
```

Whitespace in text is kept as written. To collapse each run of whitespace into one space and drop line-break-only text between tags (so indented HTML does not add stray spaces), use `npx ts-dom gen --whitespace=collapse` or the Vite plugin option `whitespace: "collapse"`; `<pre>` and `<textarea>` are left alone.

During development, use `npx ts-dom gen --watch` to keep watching `.html` files, together with `tsc --watch`.

`npx ts-dom gen --check` writes nothing: it lists generated files that are missing, outdated (their template or a `define()` changed) or orphaned (their template was deleted), and exits with code 1 if there are any (`--json` for machine-readable output). Use it in CI if your project commits the generated files, or to confirm they are fresh before reading type errors.

In your code, import templates with a `.js` suffix (standard NodeNext style; TS maps it to the generated `x.html.ts`):

```ts
import tpl from "./user-card.html.js";
```

### Running in the browser (no bundler)

The compiled JS is standard ES modules. Only one bare module specifier, `ts-dom`, needs to be mapped, and an import map does it:

```html
<script type="importmap">
  { "imports": { "@nativele/ts-dom": "/node_modules/@nativele/ts-dom/dist/index.mjs" } }
</script>
<user-card></user-card>
<script type="module" src="/out/main.js"></script>
```

This workflow (installing only `typescript`, no Vite, from `gen` to running in a real browser) is verified automatically by `npm run smoke:no-bundler`.

### With Vite (optional)

When you use a bundler you do not need an import map. The `@nativele/ts-dom/vite` plugin is just a convenience: it generates `.html.ts` automatically at build time, watches `.html` and regenerates during dev, and offers optional ARIA warnings.

```ts
import { defineConfig } from "vite-plus"; // or "vite"
import { tsDom } from "@nativele/ts-dom/vite";

export default defineConfig({
  plugins: [tsDom()], // options: dirs (default ["src"]), runtime, whitespace, include, exclude, a11y
});
```

While the dev server runs, the plugin keeps the generated files in step: adding or editing a template regenerates its `x.html.ts` and reloads the page once if a page uses it (a save that changes nothing does not reload), deleting a template removes its `x.html.ts`, and adding or removing a `define()` updates `ts-dom-tags.ts` and the child imports of the templates. `dirs` are relative to Vite's `root`. The page reloads rather than hot-swapping the component because a custom element tag can be defined only once, so a new class cannot replace the running one.

Vite loads `vite.config.ts` as an ES module only when `package.json` has `"type": "module"` (`npm pkg set type=module`); without it, Vite warns that the config is loaded as CommonJS.

When installing, we recommend installing `vite-plus` first and then `ts-dom` (when both are installed in the same npm run, `vite` may not be hoisted to the top level).

### Lint (optional)

```ts
// lint settings in vite.config.ts (vp lint / oxlint)
lint: {
  ignorePatterns: ["node_modules", "dist", "**/*.html.ts"],
  jsPlugins: [{ name: "ts-dom", specifier: "@nativele/ts-dom/oxlint" }],
  rules: {
    "ts-dom/unused-markup": "error",
    "ts-dom/a11y": ["warn", { ignore: [] }], // optional: ARIA checks, see [ARIA / Accessibility Checks](#aria--accessibility-checks)
    "ts-dom/data-flow": ["warn", { ignore: [] }], // optional: avoid passing props and events layer by layer, see [Data Flow](components.md#data-flow-props-down-events-up)
  },
},
```

Each rule id is also a rule of its own, so a project can enable rules one by one and give each its own severity, for example `"ts-dom/unused-ref": "warn"` or `"ts-dom/missing-handler": "error"` instead of the whole `ts-dom/unused-markup` group. `ts-dom rules` lists the ids.

**In the editor.** Install the Oxc extension for VS Code (it runs `oxlint --lsp`) and keep the plugin in your oxlint config: the findings show on the template's import line as you type, and `missing-handler` offers a quick fix that adds the method to the component class. From the command line, `oxlint --fix-suggestions` applies the same fix. A fix can only change the file being linted, so problems that live in the HTML (an unused `data-ref`, broken markup) are reported but not fixed there; for markup structure and layout use a formatter such as oxfmt.

Without oxlint, the same checks are available through the CLI:

```sh
npx ts-dom lint [dirs...]   # unused markup (errors) and data flow suggestions (warnings)
npx ts-dom lint --a11y      # additionally check ARIA / accessibility (warnings)
npx ts-dom lint --strict    # warnings also make the exit code 1 (errors always do)
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

**When the set-up itself may be wrong: `npx ts-dom doctor [dirs...]`.** It checks what a project needs before any of the checks can work: a tsconfig with `strict`, the DOM lib, a module resolution that maps `./x.html.js` to the generated file and an `include` that covers the template folders; the runtime package being installed; templates imported as `./x.html.js` (not `./x.html`); generated files that are stale; the Vite plugin and the oxlint plugin being configured; and, when a formatter such as oxfmt or Prettier is set up, templates generated with whitespace `collapse`. Every issue has a stable rule id and a `Fix:` hint, and `--json` prints them as data.

**One command for all of them: `npx ts-dom check [dirs...]`.** It reports template diagnostics, regenerates the generated files (with `--no-write` it reports stale ones instead), runs the project's own `tsc` (TypeScript 5, 6 or 7; `--project=` picks the tsconfig), and runs the lint rules (`--a11y` adds the accessibility checks). TypeScript errors that come from the template contract point at the template, not at the `Component(...)` call: a `{{ title }}` with nothing named `title` is reported at its line and column in the `.html` as `missing-binding`, and a missing handler as `missing-handler`; item component problems get their own rule ids, and the errors that only follow from a broken class are left out. `--json` prints the issues as data, and the exit code is 1 when there is an error (with `--strict`, a warning too).

Which command writes files:

| Command | Writes | Runs |
|---|---|---|
| `ts-dom gen` | the generated `x.html.ts` files and `ts-dom-tags.ts` | codegen only |
| `ts-dom gen --check` | nothing | codegen only: lists missing, outdated or orphaned generated files |
| `ts-dom check` | the generated files (they are derived and not committed, so this is what a developer or an agent wants after a change) | codegen, `tsc`, lint |
| `ts-dom check --no-write` | nothing: stale generated files are reported instead of refreshed, and `tsc` runs on the files as they are | codegen, `tsc`, lint |

In a CI job that must leave the working tree untouched, run `ts-dom check --no-write` (or `ts-dom gen --check` when you only want to know whether the generated files are current); a job that regenerates first, as most do, can run `ts-dom check`.

1. **codegen diagnostics** (`ts-dom gen` and the Vite plugin, with line and column numbers; on errors they abort and write no files): duplicate `data-ref`, `data-each` without a single root element, `data-each` not on a `<template>`, nested `data-each`, an incomplete or invalid `data-key` / `data-prop`, a `data-key` list whose item is not one custom element, `data-if` on an item root element, `<slot>` inside an item, `<style>` not at the first level, invalid holes, holes inside attributes, invalid `data-on-*` (including names that collide with DOM or ts-dom members), `<html>`, `<head>` and `<body>` inside a template, and markup that runs code or Trusted Types blocks: `<script>`, `on*` attributes, `srcdoc`, and `javascript:` URLs.
2. **tsc**: an error when TypeScript uses a name the HTML does not declare (`this.refs.nope`, `this.show("nope", true)`); all constraints between `state`, `props`, `derive`, `emits` and the HTML (see [Data Flow](components.md#data-flow-props-down-events-up)); child component prop names and types; `define()` checks that the methods for `data-on-*` exist.
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
| `missing-handler` | A method referenced by `data-on-*` is not defined by the class |
| `no-importer` | No TypeScript file imports this template |

lint compares per **class body** of `class X extends Component(tpl)`. When the `state` / `props` / `derive` options are used, `{{ }}` and `data-if` are handled by automatic binding and are not required to appear in the code, but the methods referenced by `data-on-*` must exist (if the code uses dynamic access such as `refs[k]`, `text[k]`, or `lists[k]`, it cannot tell which names are used, so it conservatively treats all of them as used). Hence importing multiple templates in the same file does not make them overwrite each other:

```ts
import listTpl from "./list.html.js";   // data-ref="title"
import cardTpl from "./card.html.js";   // data-ref="title" (Card never uses it)
class List extends Component(listTpl) { connected() { this.refs.title.hidden = true } }
class Card extends Component(cardTpl) {}   // → reports that title in card.html is unused
```

Note: refs, text, and so on should be used by the component's own class. Access through an instance outside the class (for example in tests) is not counted, so turn this rule off for test directories. When no corresponding class can be found (for example when `Component` is wrapped by a helper), it falls back to comparing the whole file.

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

`ignore` takes rule ids and can turn off individual checks:

| Id | Check |
|---|---|
| `img-alt` | `<img>` needs `alt` (use `alt=""` for decorative images) |
| `control-name` | `<button>`, `<a href>`, and `<summary>` need a readable name (text, `{{ }}`, `<slot>`, `aria-label`, or `aria-labelledby`) |
| `form-label` | `<input>`, `<select>`, and `<textarea>` need a `<label for>`, to be wrapped by a `<label>`, or `aria-label` |
| `iframe-title` | `<iframe>` needs `title` |
| `dialog-name` | `<dialog>` needs `aria-label` or `aria-labelledby` |
| `heading-empty` | `h1`–`h6` must not be empty |
| `aria-role` | `role` must be a valid ARIA role |
| `aria-attr` | `aria-*` must be a valid ARIA attribute |
| `role-tabindex` | A non-natively-focusable element with an interactive role (button, tab, checkbox…) needs `tabindex` |
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
| `click-semantics` | `data-on-click` should be on an operable element (`button`, `a[href]`, `label`, or an element with an interactive role plus `tabindex`); otherwise keyboards and assistive technologies cannot use it |

To avoid many false positives, elements with `data-ref` are treated as "managed by TS", and the checks whose "name or reference may be set in TS" are skipped for them: `img-alt`, `control-name`, `form-label`, `iframe-title`, `dialog-name`, `heading-empty`, `role-tabindex`, `table-header`, `landmark-label`, `aria-idref`.

This is a static check that looks only at the HTML template: it does not analyze attributes that TS adds at runtime, and it does not cover items that can only be judged with actual rendering, such as color contrast, focus management, and keyboard interaction, so it cannot replace tools like axe and manual testing.
