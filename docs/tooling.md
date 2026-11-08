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

Set `"type": "module"` in `package.json`. With `"module": "NodeNext"`, a package without it is CommonJS, so `tsc` emits `require`/`exports` and the browser stops with `ReferenceError: exports is not defined`.

Workflow: first generate the template modules, then compile and type-check with `tsc`.

```sh
npx ts-dom gen        # generate x.html.ts for every x.html under src/
npx tsc               # type-check and compile to out/
```

In your code, import templates with a `.js` suffix (standard NodeNext style; TS maps it to the generated `x.html.ts`):

```ts
import tpl from "./user-card.html.js";
```

### Scanning several folders

To scan several folders of one package, list them: `npx ts-dom gen src/app src/shared`. The same goes for `--check`, `--watch`, `check`, `doctor`, `lint` and the Vite plugin's `dirs` option.

The folders are generated together. A template in one folder that uses a component defined in another gets the import of that component, as the relative path from the template to the file with the `define()`.

A tag defined with two different classes, in one folder or across folders, is a `duplicate-define` error at the second `define()`. Defining the same class again is not a duplicate.

Do not scan another package's folder: the relative imports would be written into that package's generated files. A package of shared components generates its own files, and the app imports the package.

During development, use `npx ts-dom gen --watch` to keep watching `.html` files, together with `tsc --watch`. Each change reads the files again and parses only the templates it regenerates: a saved template, or, when a `define()` changes, the tag map and the templates that use its tag.

### Generated files

`ts-dom gen` writes `x.html.ts` next to each template and `ts-dom-tags.ts` in each scanned folder. Never edit them: they are derived from the templates and the `define()` calls, and the next run overwrites them.

Most projects do not commit them: add `*.html.ts` and `ts-dom-tags.ts` to `.gitignore`. A project that commits them checks in CI that they are current, with `ts-dom gen --check` or `ts-dom check --no-write` (see [Checks](#checks)).

`npx ts-dom gen --check` writes nothing. It lists the generated files that are:

- missing;
- outdated: their template or a `define()` changed;
- orphaned: their template was deleted, or a `ts-dom-tags.ts` is left in a subfolder that is not itself scanned, for example after the components moved.

It exits with code 1 if there are any, and `--json` prints them as data. Use it in CI when the project commits the generated files, or to confirm they are fresh before reading type errors.

### Whitespace

Whitespace in text is kept as written. To keep only the whitespace the browser renders, use `npx ts-dom gen --whitespace=collapse` or the Vite plugin option `whitespace: "collapse"`. With `collapse`:

- A run of whitespace between two inline-level siblings (text, `<a>`, `<b>`, `<span>`, `<button>`, `<input>`, custom elements) becomes one space, line breaks included.
- Whitespace next to a block-level element (`<div>`, `<p>`, `<li>`, headings, table parts) is dropped, and so is whitespace at the start and end of a block or inline-block element's content.
- An inline element keeps one space at the start and end of its content.
- A non-breaking space (`&nbsp;`) is kept.
- `<pre>`, `<textarea>`, `<style>` and `<script>` are left alone.
- In SVG, the content of a `<text>` follows the inline rule (`<tspan>`, `<textPath>` and `<a>` in it are inline), and whitespace between other SVG elements is dropped.

It decides by each element's default display, as formatters such as Prettier and oxfmt do for HTML. An element whose CSS changes its display is still judged by its tag: a `<div>` styled `display: inline` loses the space next to it.

With a formatter, `collapse` keeps the rendered text and `textContent` unchanged when a template is reformatted. The one exception is SVG text in Prettier, which puts a line break between text and a `<tspan>` that touch; that renders as a space (oxfmt does not do this).

Each generated file records its mode. A run without `--whitespace` keeps the mode a file was last written with, and a new file gets `preserve`, so pass `--whitespace=preserve` to switch back.

`gen --check` and `check` accept `--whitespace=`, `--include=` and `--exclude=` as `gen` does, and use them to decide which generated files are stale.

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

When you use a bundler you do not need an import map. The `@nativele/ts-dom/vite` plugin is a convenience:

- it generates the `.html.ts` files when the build, the dev server or Vitest starts;
- it watches `.html` and regenerates during dev;
- it offers optional ARIA warnings.

It never type-checks: run `ts-dom check` (or `ts-dom gen` and `tsc`) for that.

A template that codegen rejects is printed only in the terminal that runs Vite, not in the browser. At build start the build fails; in dev the page keeps the last generated module.

```ts
import { defineConfig } from "vite-plus"; // or "vite"
import { tsDom } from "@nativele/ts-dom/vite";

export default defineConfig({
  plugins: [tsDom()], // options: dirs (default ["src"]), runtime, whitespace, include, exclude, a11y
});
```

While the dev server runs, the plugin keeps the generated files in step:

- Adding or editing a template regenerates its `x.html.ts`. When the module has been loaded, the plugin sends a full reload to every connected client; a save that changes nothing does not reload.
- Deleting a template removes its `x.html.ts`.
- Adding, changing or removing a `define()` updates `ts-dom-tags.ts` and the child imports of the templates that use its tag.

The page reloads rather than hot-swapping the component because a custom element tag can be defined only once, so a new class cannot replace the running one.

`dirs` are relative to Vite's `root`, not the working directory. An entry that does not exist there is reported as a `dir-not-found` warning when the build or dev server starts.

A `vitest.config.ts` replaces `vite.config.ts` for Vitest, so add `tsDom()` to its `plugins` too, or merge the Vite config into it (`mergeConfig(viteConfig, defineConfig({ test: {} }))` with `viteConfig` imported from `./vite.config`). Otherwise the tests start without generated files.

Vite loads `vite.config.ts` as an ES module only when `package.json` has `"type": "module"` (`npm pkg set type=module`); without it, Vite warns that the config is loaded as CommonJS.

When installing, we recommend installing `vite-plus` first and then `ts-dom`: when both are installed in the same npm run, `vite` may not be hoisted to the top level.

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

The same module is an ESLint plugin for flat config, verified with ESLint 9 and 10 and typescript-eslint's parser for `.ts` files: `import tsDom from "@nativele/ts-dom/oxlint"` and a config object `{ plugins: { "ts-dom": tsDom }, rules: { "ts-dom/unused-markup": "error" } }`.

ESLint does not read `.gitignore`, so add the generated files to its ignores: `globalIgnores(["**/*.html.ts", "**/ts-dom-tags.ts"])` from `eslint/config`.

Each rule id is also a rule of its own, so a project can enable rules one by one and give each its own severity, for example `"ts-dom/unused-ref": "warn"` or `"ts-dom/unused-text": "error"` instead of the whole `ts-dom/unused-markup` group. `ts-dom rules` lists the ids.

The exception is `no-importer`, which only `ts-dom lint` reports. The oxlint plugin reports inside the file it lints, and a template that no class uses has no such file.

#### In the editor

Install the Oxc extension for VS Code (it runs `oxlint --lsp`) and keep the plugin in your oxlint config. The findings show as you type, on the import that brings the template into the file of the class that uses it: the template's own import, or the import of a module that re-exports it.

The plugin offers no fixes: a fix can only change the file being linted, and the problems it reports live in the HTML (an unused `data-ref`, a missing `alt`). For markup structure and layout use a formatter such as oxfmt.

A `data-on-*` method that the class does not define is not a lint finding: tsc reports it at the `define()` call, and `ts-dom check` points it at the template as `missing-handler`.

#### Command line

Without oxlint, the same checks are available through the CLI:

```sh
npx ts-dom lint [dirs...]   # unused markup (errors) and data flow suggestions (warnings)
npx ts-dom lint --a11y      # additionally check ARIA / accessibility (warnings)
npx ts-dom lint --strict    # warnings also make the exit code 1 (errors always do)
npx ts-dom lint --ignore=unchecked-custom-elements   # leave out the warnings with this rule id (repeatable; also for ts-dom check and ts-dom doctor)
npx ts-dom lint --json      # output JSON: { "issues": [{ file, line, col, severity, rule, message }] }
npx ts-dom rules            # list the ids of the static checks, with descriptions
npx ts-dom rules --explain=unused-ref   # why the rule exists, a wrong example and the fix
npx ts-dom rules --json     # every rule as data: { id, group, description, why, bad, good }
```

Every message has the same format. It explains **what is wrong, why, and how to fix it**, and includes the line and column in the HTML:

```
a.html:2:1 error [unused-ref] data-ref="dead" is never used by the component class. Fix: use this.refs.dead, or remove the attribute if the element needs no TypeScript access.
a.html:3:1 warning [unknown-prop] <x-kid lable> is not a declared prop of <x-kid>. Declared props: label, count. Did you mean "label"? Fix: declare "lable" in the child's props option, or remove the attribute.
```

Exit codes: 0 = no problems, 1 = there are errors (or warnings when `--strict` is used). Messages from the oxlint plugin start with `./x.html.js:line:column [rule id] message` and are reported on the `import` line.

#### Nativele component packages

Lint also checks the components of the Nativele component packages that a template's package depends on. A package counts when:

- the template's package lists it in `dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies`;
- it is found as `node_modules/<name>/package.json`, the same way as a manifest (below), whether it is a workspace package (`packages/ui`) or a published one;
- it lists `@nativele/ts-dom` among its own dependencies.

Lint reads the modules its `exports` name (any condition but `types`; `*` patterns are left out), or its `module` or `main` when it has no `exports`. It follows them through relative imports, re-exports and `import "./x.js"`.

Each component they `define()` is checked like one in the scanned folders: `unknown-prop`, `invalid-prop-value`, `unknown-event`, `unknown-slot`, `unknown-custom-element` and `click-semantics`. How much lint knows depends on how the package ships:

| The package ships | Lint knows |
| --- | --- |
| TypeScript source, with the templates beside the modules | props, events, slots and what each component renders |
| JavaScript that `tsc` wrote, importing `./x.html.js` | props and events; slots and content are not known, as the `.html` files are not shipped |
| A bundled or minified build | nothing: its `define("tag", Class)` calls do not read as such after bundling |

A `define()` in the scanned folders wins over a package's. A tag that two such packages define is listed by `unchecked-custom-elements` as defined in several packages.

None of this changes what `ts-dom gen` writes: generated files import only from the scanned folders, so each package keeps its own boundary.

A tag that the program only declares, by a `customElements.define()` call or an `HTMLElementTagNameMap` entry, gives lint its name and nothing else. `unknown-custom-element` does not report it, and `unchecked-custom-elements` lists it as declared only in TypeScript.

#### Custom elements manifests

Lint also checks the elements of other libraries that publish a [Custom Elements Manifest](https://github.com/webcomponents/custom-elements-manifest) (schema 1.x or 2.x). That is the JSON file a package names in the `customElements` field of its `package.json`; Web Awesome has one, for example.

For each template, the manifests that apply are those of its package, the nearest folder with a `package.json`:

- the package's own `customElements` field;
- that of each of its `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies`.

Each dependency is found as `node_modules/<name>/package.json`, from the package up to the workspace root (the same bound as doctor's), and followed through symbolic links, so pnpm and workspace links work. Only those files are read: `node_modules` is never listed, and a dependency that is not installed or declares no manifest is skipped.

Each package reads its own dependencies, so two apps of a monorepo on different versions of a library each get their own manifest. A manifest is parsed again only when its text changes.

With a manifest, a library element is checked like a Nativele component:

| Check | From the manifest |
| --- | --- |
| `unknown-prop` | An attribute the element's `attributes` do not list |
| `invalid-prop-value` | A value the attribute's type does not allow |
| `unknown-event` | A `data-on-*` event the element's `events` do not list and no element fires natively |
| `unknown-slot` | A direct child's `slot="name"` that the element's `slots` do not list |
| `unknown-custom-element` | A tag nothing defines, one or two edits from a manifest's tag with the same prefix (`<wa-buton>`) |
| `unknown-native-event` | Not reported for a name the manifest lists as an event of any of its elements |

- The `attributes`, `events` and `slots` of an element include those of the classes it extends in the manifest.
- `unknown-prop` never reports `aria-*`, `data-*`, inline event handlers such as `onclick`, or the global attributes of HTML, such as `inputmode`.
- `invalid-prop-value` checks three kinds of type: string literals (`'neutral' | 'brand'`), with "Did you mean"; `boolean`, where `="false"` is reported because the attribute is true whenever it is present; and `number`, where a value that is not a number is reported, also on a Nativele component's number prop. Other types (`Element[]`, a type alias, no type) are not checked.
- `unknown-event` is not reported when no element of the manifest lists events.
- `unknown-slot` also checks a Nativele component, against its template's `<slot name>` elements.
- `unknown-prop`, `unknown-event` and `unknown-slot` are not reported for an element whose manifest may leave those out (below). For `unknown-prop` that includes an attribute entry lint cannot read.
- `unknown-native-event` skips a name a manifest lists also when that element's event list may be incomplete.

A manifest may leave out what an element inherits. Lint follows each element's `superclass` through the manifest, and takes the element's attributes, events and slots as complete only when the chain ends at one of these:

- `HTMLElement`, `LitElement` or `ReactiveElement`;
- a class outside the manifest whose members the analyzer copied into the chain (an `inheritedFrom` that names it, as in Web Awesome's manifest).

Otherwise (no `superclass`, a class from another package, a loop), none of the three is reported as unknown for that element, and only the values of the attributes it lists are checked.

A tag that a `define()` in the scanned folders defines uses that definition, not a manifest's. A tag that two manifests of a package's dependencies define is not checked; `unchecked-custom-elements` lists it as defined in several packages.

Types stay with `tsc`: the ref, property and event types come from the package's own declarations, never from the manifest. A manifest that differs from them can only cause lint warnings.

A manifest that is missing, not valid JSON or of another schema version is treated as absent, so `unchecked-custom-elements` lists its tags. `ts-dom doctor` reports it as `custom-elements-manifest`.

A manifest says nothing about what an element renders, so for `click-semantics`, `control-name` and `heading-empty` a library element's content stays unreadable (see [ARIA / Accessibility Checks](#aria--accessibility-checks)).

#### Misspelled event names

A `data-on-*` on a native element is reported as `unknown-native-event` only when all of these hold:

- the name is no element's native event;
- no component in the scanned folders emits it with `bubbles: true`;
- no module in the scanned folders creates it as `new Event("name", { bubbles: true })` or `new CustomEvent("name", { bubbles: true })`;
- no manifest lists it;
- the element's content in the template holds no `<slot>` and no custom element whose events lint cannot know;
- one of the element's own native events is one or two letters away (`<form data-on-submt>`, with "Did you mean").

Lint cannot know a custom element's events when it reads no `define()` or manifest for it, when its manifest may leave events out, or when it is a component whose template cannot be read or holds such an element.

#### Misspelled tags

A tag that nothing defines is reported as `unknown-custom-element` at its first use in each template, when a known tag with the same prefix (the text before the first `-`) is one or two edits away. Nothing defines a tag when none of these does:

- a `define()` in the scanned folders or in a Nativele component package the template's package depends on;
- a `customElements.define("tag", ...)` call or an `HTMLElementTagNameMap` entry in the scanned TypeScript;
- an applicable manifest.

```
a.html:7:3 warning [unknown-custom-element] <wa-buton> is not defined in the scanned folders or by the custom elements manifest of @awesome.me/webawesome, so the browser leaves it an undefined element that shows only its children; <wa-button>, defined by the custom elements manifest of @awesome.me/webawesome, is close to it. Did you mean "wa-button"? Fix: correct the tag name; if another package defines it, import that package (it is not in this package's dependencies, or declares no custom elements manifest).
```

Without a close match nothing is reported there, and `unchecked-custom-elements` lists the tag.

A tag defined at run time by code outside the scanned folders, one or two letters from a known tag, is a false positive. Pass `--ignore=unknown-custom-element`, and `unchecked-custom-elements` lists the tag instead.

#### Custom elements lint cannot read

`ts-dom lint` and `ts-dom check` print one `unchecked-custom-elements` warning per run when the templates use custom elements that lint has no single definition of. Their attributes, events and `data-on-click` are then not checked. The warning sits at the first use of the first such tag and lists the tags by cause, each cause with its fix.

With `--a11y`, `unchecked-content` names the same causes, and four more, for content that `click-semantics`, `control-name` and `heading-empty` cannot read (see [ARIA / Accessibility Checks](#aria--accessibility-checks)).

| Cause | Reported by | Fix |
| --- | --- | --- |
| Not defined: no `define()` in the scanned folders or a component package, and no manifest | both | Scan the folder with its `define()`, or list the package that defines it in the dependencies |
| Declared only in TypeScript (`customElements.define()`, `HTMLElementTagNameMap`) | both | Define a Nativele component with `define()`; another library's package needs a manifest |
| `define()` passes a class lint cannot follow to a class extending `Component(...)` | both | Import the class by a relative path where `define()` is called |
| Defined in several packages, and not exactly once in the template's package | both | Keep one `define()` of a tag per package |
| `Component()` gets a template lint cannot follow to an `.html` imported by a relative path | `unchecked-content` | Pass a template imported by a relative path (`import tpl from "./x.html.js"`) |
| The template file the class imports does not exist | `unchecked-content` | Restore the file or correct the import path |
| A component of a package that ships its modules without their `.html` templates | `unchecked-content` | Check by hand, or have the package ship each `.html` next to the module that imports it |
| An element from a manifest, which does not say what the element renders | `unchecked-content` | Check by hand that the element around it is operable or named |

Each cause in a message carries its detail: the `define()` location, the packages, the class's location, the template path or the package.

Elements that are not Nativele components, such as those of a library without a manifest or a plain custom element, need no change. Silence the warning with `--ignore=unchecked-custom-elements`, which a `--strict` run needs.

The oxlint plugin and the Vite plugin report per template, so they do not report `unchecked-custom-elements`, which would repeat in every file.

#### Coexisting with another template system

A project that keeps an older template system while it moves to Nativele scans only the Nativele folders: `ts-dom gen src/nv`, and the same folders for `check`, `lint`, `doctor` and `tsDom({ dirs })`. An `.html` of the other system in a scanned folder is reported as `no-importer`.

In oxlint, which lints every file it is given, leave the other system's paths to its own tooling with `ignorePatterns`, or turn the `ts-dom/*` rules off for them in `overrides`.

Lint, `ts-dom check` and the oxlint plugin treat only `./x.html.js` imports as Nativele templates, so the other system's `import view from "./x.html"` is never linted as one. `ts-dom doctor` still reports such an import in a scanned folder as `template-import-without-js`, because a Nativele template whose `.js` was forgotten looks the same.

Recommended check workflow: `ts-dom check` (it runs `gen`, `tsc` and `lint` in one pass; see [Checks](#checks)).

## Checks

Each tool checks what it can see, and none repeats another:

| Tool | What it checks |
|---|---|
| A formatter such as oxfmt (`oxfmt --check`, or `vp fmt --check`) | Whether the template markup is well formed and laid out consistently. It knows nothing of `{{ }}` or `data-*` names. |
| `ts-dom gen` | The template rules: holes, `data-each`, `data-if`, `data-on-*`, forbidden markup. |
| `tsc` | That every name in the HTML exists in the component with the right type, and that lists, props and events fit. |
| `ts-dom lint` / the oxlint plugin | What the HTML declares but the class never uses, data flow between components, accessibility. |
| `ts-dom doctor` | The project set-up that the other tools depend on. |
| `ts-dom check` | Runs `gen`, `tsc` and `lint` in one pass and points the template contract errors at the template. |

A misnested closing tag such as `<p><div></p></div>` is a syntax error for the formatter, while the HTML parser the library uses would silently repair it into a different tree. When you use a formatter, generate with whitespace `collapse`, or reformatting can change the spacing on the page.

`ts-dom gen` and the Vite plugin stop on a template error and write no files.

Every message has a stable rule id and explains what is wrong, why, and how to fix it. `npx ts-dom rules` lists the ids of the static checks, and `npx ts-dom rules --explain=<id>` explains one.

At run time, `Component()` and components throw errors with a `[rule id]` and a fix, at definition, connection and use. These runtime ids (`render-loop`, `missing-key`, `item-prop-missing` and others) are not in `ts-dom rules`.

### ts-dom doctor

Run `npx ts-dom doctor [dirs...]` when the set-up itself may be wrong. It checks what a project needs before the other checks can work, and reports errors and warnings. It prints "ts-dom doctor: the set-up looks right" only when it reports nothing.

| Id | Severity | Reports |
|---|---|---|
| `no-tsconfig` | error | There is no tsconfig, or the `--project` file is missing |
| `tsconfig-not-strict` | warning | `strict` is `false`, or left out on TypeScript 5 or on a version doctor cannot determine |
| `tsconfig-no-dom-lib` | error | `lib` leaves out DOM |
| `tsconfig-classic-resolution` | error | Modules resolve the classic way, which cannot resolve the runtime package |
| `tsconfig-misses-templates` | error | `include` leaves out a folder with templates |
| `tsconfig-misses-tag-map` | error | `include` or `exclude` leaves `ts-dom-tags.ts` out of the program |
| `runtime-not-installed` | error | The runtime package cannot be resolved |
| `template-import-without-js` | error | A template is imported as `./x.html` instead of `./x.html.js` |
| `framework-template` | error | A scanned `.html` is an Angular `templateUrl` |
| `typecheck-before-gen` | warning | A script type-checks before `ts-dom gen` while `*.html.ts` is git-ignored |
| `vite-plugin-missing` | warning | The Vite config, or a `vitest.config.*` that replaces it, does not use the plugin |
| `oxlint-plugin-missing` | warning | The lint config does not load the oxlint plugin |
| `formatter-whitespace` | warning | A formatter is set up while templates are generated with `preserve` |
| `custom-elements-manifest` | warning | A package's custom elements manifest is missing, not valid JSON or of another schema version |
| `skill-outdated` | warning | The project's copy of a Skill differs from the one shipped with the installed version |

- `tsconfig-not-strict`: TypeScript 6 and 7 turn `strict` on by default, so on them only `false` is reported.
- `tsconfig-classic-resolution`: `moduleResolution` is `classic`, or it is left out while `module` is ES2015 to ESNext on TypeScript 5.
- `tsconfig-misses-tag-map`: a file in the program that imports or re-exports `ts-dom-tags.ts`, as a component package's entry does, keeps it in. Without it, the tags are typed as plain `HTMLElement`.
- `framework-template`: such a folder holds framework templates and should not be scanned.
- `typecheck-before-gen`: doctor follows each script through its `pre` script and the scripts it runs with `npm run`, and looks for `tsc`, `vue-tsc`, `svelte-check` and `ng build`/`serve`/`test`. Such a script fails with TS2307 on a clean checkout. A `tsc -p` whose config covers none of the scanned folders is skipped.
- `formatter-whitespace`: also reported when generated files were written with `preserve` while the scripts or the Vite config ask for `collapse`.
- `custom-elements-manifest`: lint does not check that package's elements.

Doctor reads `.gitignore` files, Skill copies, and formatter and oxlint configuration from the folder up to the workspace root, nearest first, and never above the home directory. The workspace root is the folder with a `package.json` that has `workspaces` or with a `pnpm-workspace.yaml`, else the git root.

It recognizes these configuration files:

- oxlint: `.oxlintrc.json`, `.oxlintrc.jsonc`, `oxlint.config.*`, or a `lint` block in the Vite config;
- Prettier: `.prettierrc*`, `prettier.config.*`, or the `prettier` key of `package.json`;
- oxfmt: `.oxfmtrc.json`, `.oxfmtrc.jsonc`, `oxfmt.config.*`.

Options:

- `--project=<path>` picks the tsconfig to check.
- `--ignore=<id>` leaves out the warnings with that id.
- `--strict` makes a warning give exit code 1 too; errors always do.
- `--json` prints the issues as data. Every issue has a stable rule id and a `Fix:` hint.

### ts-dom check

Run `npx ts-dom check [dirs...]` for one pass over everything. In order, it:

1. reports template diagnostics;
2. regenerates the generated files, or with `--no-write` reports stale ones as `stale-generated` instead;
3. runs the project's own `tsc` (TypeScript 5, 6 or 7), or `vue-tsc` when the project's package.json lists it in `dependencies` or `devDependencies`, so `.vue` files are checked too;
4. runs the lint rules; `--a11y` adds the accessibility checks.

`--project=` picks the tsconfig. A solution-style tsconfig, with `"files": []` and `references`, runs `tsc` once per referenced project.

#### Errors at the template

TypeScript errors that come from the template contract point at the template, not at the `Component(...)` call:

- A `{{ title }}` with nothing named `title` is `missing-binding`, at its line and column in the `.html`.
- A missing handler is `missing-handler`.
- A handler whose first parameter does not accept the event it is bound to is `handler-event-type`, at its `data-on-*` attribute, with the event type in the `Fix:`.
- `any` in a component's contract is `any-in-contract` (below).
- A tag declared with two different classes by two tag maps in one program (TS2717 in `ts-dom-tags.ts`) is `duplicate-define`.
- Item component problems get their own rule ids.

`any-in-contract` is reported where the `any` is declared:

- at the `state`, `props`, `derive` or `emits` entry that declares it: the innermost property written in the option's object literal, also when its key is quoted;
- for a handler or its first parameter, at its `data-on-*` attribute;
- for a template typed `any`, at the `Component(...)` call.

The generated type carries the template's path relative to the scanned folder, and these errors name it (`template: "card.html"`). So they point at the right template also when `define()` is in another file than the class, or one file declares several classes.

#### Errors that follow from a broken class

Errors that only follow from a broken class are left out in the broken component's own file and in `node_modules`. That includes the parameters of callbacks inside its body that lose their type with it, such as a `bind` callback's parameter.

An error inside the body that does not follow from it, such as `const s: string = 42`, is kept. In other files these errors are kept, and their message says which contract error they follow from.

A class in such an error is the one its name refers to in that file, so a class of the same name in another file is not mistaken for it.

#### Other messages

- Without TypeScript installed, `tsc-not-found` is an error, so a CI job that omits the dev dependencies fails instead of passing unchecked.
- An error located in a generated `x.html.ts` or `ts-dom-tags.ts` says to run `ts-dom gen`, or to delete the file when it is left over from a deleted template or a folder that is not scanned. It never says to edit the file.
- A TS2307 for a `./x.html.js` import says to run `ts-dom gen` and to scan the folder that holds the template.

`--json` prints the issues as data. The exit code is 1 when there is an error, and with `--strict` also when there is a warning.

### Which command writes files

| Command | Writes | Runs |
|---|---|---|
| `ts-dom gen` | the generated `x.html.ts` files and `ts-dom-tags.ts`, and deletes orphaned ones | codegen only |
| `ts-dom gen --check` | nothing | codegen only: lists missing, outdated or orphaned generated files |
| `ts-dom check` | the generated files | codegen, `tsc`, lint |
| `ts-dom check --no-write` | nothing: stale generated files are reported, and `tsc` runs on the files as they are | codegen, `tsc`, lint |

`ts-dom check` writes the generated files because that is what a developer or an agent wants after a change.

In a CI job, `ts-dom check --no-write` and `ts-dom gen --check` work only when the generated files are committed: on a clean checkout without them every generated file is missing. When they are git-ignored, run `ts-dom check`, then check that the working tree is unchanged (`git status --porcelain` prints nothing).

### Rules of unused-markup

| Id | Detection |
|---|---|
| `unused-ref` | A `data-ref` is not used by the component |
| `unused-if` | A `data-if` is never toggled (`data-if` is hidden by default, so the content never appears) |
| `unused-text` | A `{{ hole }}` is never filled and displays blank |
| `unused-list` | A `data-each` is never rendered, so the list is always empty |
| `unused-item-name` | A name inside a list item is never referenced |
| `no-importer` | No component class passes this template to `Component()`, and no TypeScript file imports it (a module that only re-exports it does not count) |

lint compares per **class body** of `class X extends Component(tpl)`, where `tpl` is followed through the imports to its template, in any scanned file:

- a default import of the `.html.js`;
- a name exported by a module that re-exports it (`export { default as cardTpl } from "./card.html.js"`, `export *`);
- a member of a namespace import (`import * as t from "./templates/index.js"` with `Component(t.card)`, a barrel's `export * as t from ...`).

When the `state` / `props` / `derive` options are used, `{{ }}` and `data-if` are handled by automatic binding and are not required to appear in the code.

If the code uses dynamic access such as `refs[k]`, `text[k]` or `lists[k]`, lint cannot tell which names are used, so it treats all of them as used.

Importing multiple templates in the same file therefore does not make them overwrite each other:

```ts
import listTpl from "./list.html.js";   // data-ref="title"
import cardTpl from "./card.html.js";   // data-ref="title" (Card never uses it)
class List extends Component(listTpl) { connected() { this.refs.title.hidden = true } }
class Card extends Component(cardTpl) {}   // → reports that title in card.html is unused
```

Refs, text and so on should be used by the component's own class. Access through an instance outside the class, for example in tests, is not counted.

Turning this rule off for test directories silences only templates that a test file imports itself. A ref that only a test reads is still reported in the component, so remove it and query the DOM in the test.

A module that imports the template of a class (a story, a test helper) does not count. When no class uses the template, for example when `Component` is wrapped by a helper or the module only calls `tpl.instantiate()`, the whole text of the modules that import it is compared instead.

## Skills

The package ships Skills: task procedures for coding agents. `npx ts-dom skills` lists them and shows which ones cover the project's dependencies; the [README](../README.md#nativele-skills) has the commands, and [skills/README.md](../skills/README.md) is the specification. `ts-dom doctor` reports a project copy of a Skill that differs from the shipped one as `skill-outdated`.

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

All three read the components defined in the scanned folders, so `click-semantics` on a component's tag gives the same result everywhere.

### In the Vite and oxlint plugins

The Vite plugin and the oxlint plugin read the folders and files again for each save or lint. A change anywhere is seen at once: a child template that loses its `<button>`, a `define()` in a new file, a `package.json` added.

Between runs they keep only what is computed from a file's content, up to two results per file: one for its content on disk and one for an editor's unsaved buffer of it. A result is used only while the file still has that content, so a template is parsed again only when it, or a file its warnings came from, has changed.

What they keep for a file they stop reading (deleted, renamed, not imported, or in a folder that is not scanned) is dropped, so a long-running language server or dev server does not grow.

The Vite plugin prints the warnings of the saved template and of the templates whose warnings changed. The oxlint plugin lints a file as oxlint gives it, unsaved edits included.

The lints oxlint makes in one turn of Node's event loop share one reading of the other files. How oxlint spreads its lints over turns changes only how often files are read, never what is reported: each lint sees its own file as oxlint gives it and the other files as they were on disk during its turn.

### Rule ids

`ignore` takes rule ids and can turn off individual checks:

| Id | Check |
|---|---|
| `img-alt` | `<img>` needs `alt` (use `alt=""` for decorative images) |
| `control-name` | `<button>`, `<a href>`, and `<summary>` need a readable name (text, `{{ }}`, `aria-label`, or `aria-labelledby`) in their composed content |
| `form-label` | `<input>`, `<select>`, and `<textarea>` need a `<label for>`, a wrapping `<label>`, or `aria-label` |
| `iframe-title` | `<iframe>` needs `title` |
| `dialog-name` | `<dialog>` needs `aria-label` or `aria-labelledby` |
| `heading-empty` | `h1`–`h6` must not be empty in their composed content |
| `aria-role` | `role` must be a valid ARIA role |
| `aria-attr` | `aria-*` must be a valid ARIA attribute |
| `role-tabindex` | A non-natively-focusable element with an interactive role (button, tab, checkbox…) needs `tabindex`, with or without a `data-on-click` |
| `tabindex-positive` | Do not use a `tabindex` greater than 0 |
| `hidden-focusable` | A focusable element must not have `aria-hidden="true"` |
| `label-for` | `<label for>` must point to an `id` that exists in the template |
| `id-in-list` | An `id` inside a `data-each` item is duplicated with each item; use `data-ref` or a class instead |
| `duplicate-id` | An `id` must not be duplicated within a template |
| `aria-idref` | The ids referenced by `aria-labelledby`, `describedby`, `controls`, `owns`, etc. must exist in the template |
| `heading-order` | Heading levels must not skip (`h3` directly after `h1`), judged by document order within the template |
| `table-header` | `<table>` needs `<th>`; for layout tables set `role="presentation"` |
| `list-structure` | The children of `<ul>`/`<ol>` (including the root element of a `data-each` item) must be `<li>`; `<li>` must be inside `<ul>`, `<ol>`, or `<menu>` |
| `landmark-label` | When a template has multiple `<nav>` or `<aside>`, they need to be distinguished with `aria-label` |
| `redundant-role` | `role` is the same as the element's native semantics, for example `<button role="button">` |
| `click-semantics` | `data-on-click` should be on an operable element, or on an element whose composed content holds one |
| `unchecked-content` | One warning per element that `click-semantics`, `control-name` or `heading-empty` cannot judge without content lint cannot read |

- `form-label` also accepts a `<label>` around the slot of a Nativele component's template that the control is put in.
- `aria-idref`: use `ignore` to turn it off when the ids point to elements outside the template.
- `click-semantics`: the operable elements are `button`, `a[href]`, `input` other than `hidden`, `select`, `textarea`, `summary`, `contenteditable`, and an element with an interactive role plus `tabindex`. Otherwise keyboards and assistive technologies cannot use the element.
- `click-semantics` also passes a `<label>` or a `<ul>` around such a control, or a component whose template has one: a click on that control, by keyboard too, reaches the handler around it.
- `click-semantics` leaves an element with an interactive role to `role-tabindex`, so every element is judged by one of the two rules whichever of them is turned off. On a Nativele component's tag the message names the component's template.

### Composed content

`click-semantics`, `control-name` and `heading-empty` judge an element's **composed content**:

- its own descendants;
- for each Nativele component inside it, the descendants of that component's template, with each `<slot>` replaced by what the element using the component puts in it, by slot name;
- a slot that gets nothing shows its fallback content, and content for a slot the component does not have is not shown.

Lint cannot read two kinds of content: a custom element whose template it cannot read, and a `<slot>` of the template being checked, which its user fills (its fallback content is read). For each such custom element, `unchecked-content` names the cause and its fix from the table in [Custom elements lint cannot read](#custom-elements-lint-cannot-read).

Content lint can read decides when it is enough: `<button><wa-icon></wa-icon> Save</button>` has a name, and `<div data-on-click><wa-icon></wa-icon><button>…</button></div>` holds an operable element.

When the content lint can read would fail the rule, the rule is not reported, since the unreadable content may be what makes the element right (a `<div data-on-click>` around a `<wa-button>`). `unchecked-content` is reported instead.

So these are not passed over silently: `<div data-on-click="open"><wa-icon name="x"></wa-icon> Open</div>`, a `<button><slot></slot></button>`, and an `<h2>` around only a `<slot>`.

Check such an element by hand, then pass `--ignore=unchecked-content` (or `ignore` in the Vite and oxlint options) once the elements it names are right.

Ignoring a rule, such as `--ignore=control-name`, also keeps `unchecked-content` from naming that rule. `unchecked-content` is not reported when every rule it could not judge is ignored.

A custom element that itself has `data-on-click` and has no contract (one of the first four causes) is left to `unchecked-custom-elements`. One from a manifest is not reported, as it may handle the keyboard itself.

### Elements with data-ref

To avoid many false positives, elements with `data-ref` are treated as "managed by TS", and the checks whose "name or reference may be set in TS" are skipped for them: `img-alt`, `control-name`, `form-label`, `iframe-title`, `dialog-name`, `heading-empty`, `role-tabindex`, `table-header`, `landmark-label`, `aria-idref`.

This is a static check that looks only at the HTML template: it does not analyze attributes that TS adds at runtime, and it does not cover items that can only be judged with actual rendering, such as color contrast, focus management, and keyboard interaction, so it cannot replace tools like axe and manual testing.
