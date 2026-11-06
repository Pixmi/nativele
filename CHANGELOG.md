# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning is described below.

## Versioning policy

- Version `0.x`: the API is still evolving. **A minor version (0.Y.0) may contain breaking changes**; a patch version (0.Y.Z) only fixes bugs and documentation.
- From `1.0.0` on, [SemVer](https://semver.org/) applies: breaking changes only in major versions.
- Public API: the exports of `ts-dom`, `@nativele/ts-dom/vite` and `@nativele/ts-dom/oxlint`; the commands and flags of the `ts-dom` CLI; the `data-*` and `{{ }}` syntax of templates; rule ids (`ts-dom/unused-markup`, `ts-dom/a11y`, `ts-dom/data-flow` and their `ignore` ids).
- Adding a lint rule is a minor change; lint rules are warnings or opt-in and do not count as breaking.
- Before every release run `npm run verify:pack` (`publint` and `attw`), `tsc`, the unit tests, the browser tests, `npm run smoke` and `npm run smoke:no-bundler`; all of them run in `.github/workflows/ci.yml`.

## 0.6.3 (not published)

### Fixes

- A `data-on-*` on an element inside a `data-if` block of a list item never fired: the list registered the item's events after taking its hidden blocks out. Events are registered first, as refs already were.

## 0.6.2 (not published)

### New checks

- `ts-dom gen` reports `data-each` on a `<template>` inside `<svg>` or `<math>` as the error `each-in-svg`, with its line, column and a `Fix:`, instead of crashing with `Cannot read properties of undefined (reading 'childNodes')`: the parser makes such a `<template>` an ordinary element without content, so no list can be built from it.
- A `data-ref` on a `<form>` types `elements` with the controls the template puts inside the form, by `name` and `id`: one control is its element type (`<input name="fee">` makes `this.refs.form.elements.fee` an `HTMLInputElement`; `<select>`, `<textarea>`, `<button>`, `<output>`, `<fieldset>` and `<object>` likewise), several with one name (a radio group, repeated checkboxes) are a `RadioNodeList`, and one inside a `data-if` or `<slot>` may also be `undefined`. A misspelled name is a tsc error; the rest of `HTMLFormElement` is unchanged. Controls inside a child component's tag or a `data-each` item, `<input type="image">`, and controls joined from outside the form with `form="id"` are not typed. Types only: nothing changes at runtime.
- The `el` of a list item (in `get(key)` and in the `update` callback of `replace()` and `upsert()`) is typed by the item's root tag instead of `Element`: the item component's class for a list with `data-key` and `data-prop`, so `row.el.selected = true` is checked against its props, and the element type for plain items (`HTMLLIElement` for an `<li>`). Codegen writes it to the list schema as `rootElement`.

### Documentation

- Lists: per-row state of the parent (selected, rank) is a separate prop of the item component, set on each row through `get(key).el`; only the rows whose value changed render again. This replaces the advice to map the items to new objects that carry the field, which re-renders every row.
- The form recipes read values through `this.refs.form.elements` instead of a `data-ref` per field.

### Breaking changes

- Code that relied on a list item's `el` being `Element` can fail where the root's own type conflicts with it, for example a cast such as `ctx.el as HTMLInputElement` on an `<li>` item (`HTMLLIElement` and `HTMLInputElement` do not overlap). Remove the cast, or cast to the element the template has at the root.

## 0.6.1 (not published)

### New checks

- A `data-on-*` handler may declare its first parameter as the event it receives, and `define()` checks it against the template: `EmitEvent<Child, "event">` for an event that the child component on that tag declares in `emits`, otherwise the type `HTMLElementEventMap` lists for the event name (`click` `MouseEvent`, `keydown` `KeyboardEvent`, `submit` `SubmitEvent`), otherwise `Event`. A parameter that does not accept that event, for example `KeyboardEvent` on a `click` or another component's `EmitEvent`, is a tsc error (`wrongHandlerParameters`) that names the method and its event type; a handler bound to several events or tags must accept all of them. A handler typed `(e: Event)`, or without a parameter, compiles as before, so the cast `(e as EmitEvent<Child, "event">)` is no longer needed.
- `ts-dom check` reports that error as `handler-event-type` at the `data-on-*` attribute, with the event type to declare in its `Fix:`.

### Breaking changes

- `Schema["events"]`, written by codegen, maps each handler to the `[tag, event]` pairs it is bound to (`{ onSave: ["button", "click"] }`) instead of being a union of handler names. Only a schema written by hand for `template<...>()` has to change: `events: Record<never, never>` for a template without handlers.
- A handler that already declared a parameter type the bound event cannot satisfy (for example `CustomEvent<Detail>` on an element where the event is typed `Event`, such as a wrapper that catches a bubbling event of a grandchild) is now a tsc error. Type it `Event` and cast in the body, or move the handler to the tag that emits the event.

## 0.6.0

Five new Official Skills cover the technical areas every Nativele project shares, and the Skills now work together by clear ownership: each configuration area has one owning Skill, and the others state what they need and point to it.

### Changed

- Whitespace `collapse` keeps the whitespace the browser renders, so a formatter's line breaks and indentation no longer change the text on the page. It follows the default display of each element, as Prettier and oxfmt assume it. The generated data of existing `collapse` projects changes:
  - A run of whitespace between two inline-level siblings (text, phrasing elements such as `<a>`, `<b>`, `<span>`, `<time>`, inline-blocks such as `<button>` and `<input>`, custom and unknown elements) becomes one space even when it contains a line break; it used to be dropped. `<a>{{ author }}</a>\n  <time>{{ date }}</time>` renders `ann 2 days ago` as the browser does, not `ann2 days ago`. The same holds at the start and end of an inline element's content (`<a>\n  <x-icon></x-icon>\n  Label\n</a>`), so `childNodes` and `textContent` gain those spaces, and a space now separates custom elements written on separate lines.
  - Whitespace next to a block-level element (`<div>`, `<p>`, `<section>`, `<ul>`, `<li>`, headings, table parts, ...) and at the start and end of a block or inline-block element's content is dropped, with or without a line break: `<button>\n  Toggle\n</button>` has the text `"Toggle"`, no longer `" Toggle "`, and `<div>a</div> <div>b</div>` no longer has a `" "` between the blocks.
  - Only HTML whitespace (space, tab, line feed, form feed, carriage return) is collapsed: a non-breaking space (`&nbsp;`) is kept; it used to become a plain space.
  - `&#32;` between two inline elements is no longer needed to keep a space a formatter turns into a line break (it still works).
  - In SVG, whitespace between elements is dropped, and the content of a `<text>` follows the inline rule: `<tspan>`, `<textPath>` and `<a>` inside it are inline, as the browser lays them out, so `<text>Hello <tspan>{{ name }}</tspan> <tspan>b</tspan></text>` keeps both spaces. oxfmt formats SVG text content the same way; Prettier formats it as blocks and puts a line break, which renders as a space, where text touches a `<tspan>`.
  - `<pre>`, `<textarea>`, `<style>`, `<script>` and `preserve` are unchanged.
- `tsc-not-found` is an error instead of a warning, so `ts-dom check` exits with 1 when TypeScript is not installed (for example in a CI job that omits the dev dependencies) instead of passing without a type check.

### New checks

- `ts-dom doctor` reports `tsconfig-misses-tag-map` (error): the tsconfig `include` does not match a scanned folder's `ts-dom-tags.ts` (for example `"include": ["src/**/*.tsx"]`), or an `exclude` pattern removes it. Nothing imports the tag map, so it is in the program only through `include`; left out, tags are typed as plain `HTMLElement` and lists of item components fail with `item-not-in-tag-map`. Excluding the generated `x.html.ts` files is not reported: their components import them. Nor is a tag map that a TypeScript file in the program or in the scanned folder imports, re-exports or references through a relative path (a package entry with `export type {} from "./ts-dom-tags.js"`), which brings it into the program.
- `tsconfig-classic-resolution` also reports TypeScript 5's implicit classic resolution: `module` ES2015 to ESNext (or `amd`, `umd`, `system`, `none`), or `target` ES2015 or later without `module`, and no `moduleResolution`.
- `ts-dom doctor` accepts `--project=<path>`, like `check`, and `--strict`, which exits with 1 on warnings (info never changes the exit code).

### Fixes

- The generated `x.html.ts` files write an empty `refs` or `lists` as `Record<never, never>` instead of `{}`, so typescript-eslint's `recommended` config (`@typescript-eslint/no-empty-object-type`) reports nothing on them. The types mean the same to `tsc`.
- `tsconfig-not-strict` follows the project's TypeScript (resolved from the project, with `strict` read through `extends`): TypeScript 6 and 7 turn `strict` on when it is left out, so only `"strict": false`, or TypeScript 5 without `strict`, is reported; when the project's TypeScript cannot be resolved, a missing `strict` is reported with a message that says the version is unknown and TypeScript 5 leaves it off. The message says what is lost (possibly null values, implicit `any`); the names in templates are checked either way.
- `tsconfig-classic-resolution` says what fails: classic cannot resolve the runtime package that every generated file imports (TS2792) on TypeScript 5; TypeScript 6 deprecates it (TS5107) and 7 removes it (TS5108), and both stop before checking anything.
- `duplicate-define` says what happens at runtime: `define()` skips a tag that is already registered, so the class whose `define()` runs first wins and the other is dropped without an error.
- `ts-dom check` reports TS2717 in a generated `ts-dom-tags.ts` (one tag declared with different classes by two tag maps in one program, for example a folder scanned separately or a package) as `duplicate-define` with a rename fix, instead of asking to run `ts-dom gen`.
- The `item-not-in-tag-map` fix also names a tsconfig `include` or `exclude` that leaves `ts-dom-tags.ts` out of the program.
- `ts-dom check` keeps the `tsc` errors in other files that follow from a component's contract error (for example appending the broken component: `'HelloCard' is not assignable to ... 'string | Node'`), and each says which error it follows from and where. In the component's own file they are still left out. An error follows from a broken class only when a type quoted in its message is the class (`'HelloCard'`, `'typeof HelloCard'`, or a member of a union or intersection such as `'HelloCard & { extra: number; }'`), so with a broken class named `Index` or `Task`, `Index signature for type ...` or `'Task["status"]'` stay ordinary errors with their own `Fix:`.
- `ts-dom doctor` detects `.oxlintrc.jsonc` and `oxlint.config.ts` for `oxlint-plugin-missing`, and every Prettier config file (`.prettierrc.yaml`, `.yml`, `.json5`, `.toml`, `.prettierrc.*js`/`*ts`, `prettier.config.*`), the `prettier` key in package.json and `oxfmt.config.*` for `formatter-whitespace`.
- In a package of a workspace, `ts-dom doctor` reads the `.gitignore` files and the installed Skill copies of the folders up to the workspace root (the nearest folder with a package.json `workspaces` field or a `pnpm-workspace.yaml`, else the git root), so `typecheck-before-gen` sees a root `.gitignore` and `skill-available` is not repeated for Skills installed at the root. The formatter set-up for `formatter-whitespace` (Prettier and oxfmt config files, the `prettier` key, the `prettier` and `oxfmt` dependencies and scripts in package.json, `.prettierignore`) and the lint config for `oxlint-plugin-missing` are looked up the same way, nearest first, and the issue names the file found. The search stops at the home directory, which is read only when doctor runs in it, so a home folder kept in git (dotfiles) is not taken for the root of the projects inside it.
- `unknown-prop`, `invalid-prop-value` and `unknown-event` check a child tag against the definition that applies to the template: when several folders define the same tag (separate apps or packages in one working directory, or several folders given to `ts-dom lint`), the oxlint plugin and `ts-dom lint` use the one in the template's own package (nearest package.json), and check nothing for that tag when that is not exactly one, instead of using whichever definition was scanned last.
- `ts-dom doctor` reads `include`, `exclude` and `files` through `extends` as tsc does: each is taken from the nearest config that sets it, and `include` defaults to `**/*` only when the whole chain sets neither `include` nor `files`. With an array of bases where one sets `include` and a later one `files`, the include is no longer dropped, so `tsconfig-misses-templates` and `tsconfig-misses-tag-map` see the files tsc checks.
- `ts-dom rules` no longer says that `no-importer` can be enabled as `ts-dom/no-importer`: the oxlint plugin sees one file at a time and cannot tell that no file imports a template, so only `ts-dom lint` reports it.

### New Skills

- `nativele-typescript`: checks and adjusts the tsconfig that covers the components: what Nativele needs and why (`DOM`, a module resolution that finds packages, an `include` that brings in `ts-dom-tags.ts`, `strict`), the stricter options that work and the one that does not (`isolatedDeclarations`), how `ts-dom check` and `ts-dom doctor` choose configs, and what framework type checkers need; verified with TypeScript 7, 6 and 5.
- `nativele-linting`: brings the Nativele lint rules into the project's existing oxlint, Vite+ (`vp lint`) or ESLint flat config: groups, single rule ids, severities and ignore lists, what runs in the linter and what only in `ts-dom lint` and `ts-dom check`, generated files and test folders.
- `nativele-formatting`: keeps oxfmt, Prettier or `vp fmt` and the templates consistent: what reformatting does to the rendered spacing in each whitespace mode, why `collapse` is the mode with a formatter, how to check that a reformat changed no text, and keeping the formatter off the generated files.
- `nativele-ci`: the Nativele steps in an existing CI: generating before any type check, `ts-dom check` when the generated files are git-ignored and `gen --check` plus `check --no-write` when they are committed, which exit codes fail the job, JSON output, and the browser real-browser tests need.
- `nativele-monorepo`: Nativele across the packages of a workspace (npm or pnpm, optionally turbo): a component package that generates its own files and exports its tag map, an app that imports it, where `@nativele/ts-dom` and `typescript` are declared, and the order in which packages generate or build.

### Skills

- `skills/README.md` has "How Skills work together": a Skill owns one task or technical area, states what it needs from another area instead of configuring it, keeps the user's existing configuration, acts on what the project has, and works without any other Skill installed. When two Skills disagree about one setting, the Skill that owns the setting decides.
- The existing Skills no longer give their own instructions for the tsconfig, the linter, the formatter, CI or a workspace: each states its requirement in one sentence and points to the owning Skill, and keeps its own verified facts (framework behavior, the framework's type checker, the errors it hit). The Vite Skill now says that with a formatter the plugin and the scripts use the whitespace mode the formatting Skill decides, and the testing Skill notes that a formatter's whitespace can reach `textContent`.
- The Skills state no verification process and name no file a reader cannot open; `nativele-zod` names the Zod and Valibot versions it was verified with, `nativele-monorepo` gives `tsc-not-found` as the error it is, `nativele-linting` leaves the build script to the build owner, and `nativele-angular` also generates before the template's `watch` script.
- `nativele-core` gives the `fill` callback of a list of plain elements (`text`, `refs`, `show`, `el`, and `hit.key` in an item's event handler), points Vite set-up to `nativele-vite`, whose build script generates before `tsc`; `nativele-monorepo` says that the tag prefix is for new tags while a moved component keeps its tag.
- The guides in `docs/` ship in the package, so an agent without network reads them under `node_modules/@nativele/ts-dom/docs/`.

### Guides

- `ts-dom check --no-write` in CI only works when the generated files are committed; with git-ignored files, run `ts-dom check` and then check that the working tree is unchanged.
- The lint `ignorePatterns` example also lists `**/ts-dom-tags.ts`, and the lint guide says that the oxlint plugin also loads in ESLint flat config (ESLint 9 and 10, with typescript-eslint's parser), and that ESLint needs the generated files in its ignores because it does not read `.gitignore`.
- Turning `unused-markup` off for test directories only silences templates a test file imports itself; a ref that only a test reads is still reported in the component.
- Scanning several folders uses two folders of one package as its example: scanning another package's folder writes relative imports into its files.
- A list of item components defined outside the scanned directories rejects items typed by an interface (`Index signature for type 'string' is missing`); the lists guide said it accepted any item with the key field.

## 0.5.5

Skills are verified by agent trials and stand on their own: each Skill can be followed and is accurate without its example project, which stays in the repository only as a reference.

- A Skill is verified by its agent trials. An `example/` is an optional reference project from the trial and is no longer run in CI; Official means accepted through an agent trial and maintained by the maintainers. Each Skill's Versions table names the version of its last agent trial, and `test/skills.test.ts` keeps that row in line with the `nativele` range.
- "SKILL.md format" (in `skills.yml`) is a required check for `main`: it reports on every pull request, skips its steps when nothing it checks changed, and also covers the links in the READMEs, `llms.txt` and the guides.
- `skills/README.md` gives a fixed form for the agent trial record added to a Skill pull request.
- Every Skill is self-contained. The architecture Skill names the interfaces of the small components its example code uses. Across the Skills, an example project is mentioned only as a reference implementation, never as the source of a step or a fact.

## 0.5.4

The guides, the Skills and the tools agree with each other: wrong statements in the guides are fixed, facts the Skills repeated now live in the guides, and the tools report the traps the Skill trials hit instead of staying silent.

### New checks

- `ts-dom doctor` reports `typecheck-before-gen` (warning): a package.json script, with its `pre` script and the scripts it runs through `npm run` (or pnpm, yarn, bun), that runs `tsc`, `vue-tsc`, `svelte-check` or `ng build`/`serve`/`test` before any `ts-dom gen` or `ts-dom check` while `.gitignore` leaves out `*.html.ts`; on a clean checkout it fails with TS2307. A `tsc -p` whose config covers none of the scanned folders is skipped.
- `ts-dom doctor` reports `framework-template` (error): an `.html` in a scanned folder that a TypeScript file names as an Angular `templateUrl`. The `invalid-hole` and `no-importer` hints now also say that the folder may not be meant to be scanned.
- `formatter-whitespace` also reports generated files written with `preserve` while a package.json script or the Vite config asks for `--whitespace=collapse`, with the command to regenerate them.
- `vite-plugin-missing` also reports a `vitest.config.*` that replaces the Vite config for Vitest without the `tsDom()` plugin and without importing `./vite.config`.

### Fixes

- The Vite plugin warns (`dir-not-found`) when a `tsDom({ dirs })` entry does not exist under Vite's `root`, instead of skipping it silently.
- A generated `ts-dom-tags.ts` in a subfolder that is not itself scanned (left over after components moved) is an orphan: `gen` deletes it, and `gen --check`, `check --no-write` and `doctor` report it as `stale-generated`.
- A `tsc` error located in a generated `x.html.ts` or `ts-dom-tags.ts` now says to run `ts-dom gen` or delete the leftover file, not to change the TypeScript there.
- `ts-dom check` leaves out `tsc` errors inside the body of a class it already reported for a contract error (for example an implicit `any` on a `bind` callback's parameter next to a `{{ hole }}` that names nothing).
- `ts-dom --help` lists `--include`, `--exclude` and `--whitespace` under `check` and `doctor`, which accept them.

### Documentation

- `docs/components.md` gains:
  - Light DOM slots and children managed by a framework;
  - when a Light or Shadow component builds its content;
  - the `props` and `"~emits"` members that framework declarations use;
  - `EmitEvent` with an undeclared name;
  - `ReadableStore`.
- Five framework Skills link to the slot section instead of repeating it.
- Corrected:
  - the import map in `docs/design.md`;
  - the generated files being "already in `.gitignore`" (a project adds them itself);
  - duplicate and misplaced reordering notes;
  - `llms.txt` lists every guide.
- The Skills agree on one build-script rule: a project whose type check is plain `tsc` runs `ts-dom check` before the bundler, and a framework type checker gets `ts-dom gen` in front. The README Skill tables show the right tiers.
- `test/skills.test.ts` checks the README Skill tables against each Skill's tier, and every link and anchor in the READMEs, `llms.txt`, the guides and the Skills.
- `docs/tooling.md`: the new checks; the bare specifier to map is `@nativele/ts-dom`; the Vite plugin generates when the build, the dev server or Vitest starts, never type-checks, prints rejected templates only in the terminal, and sends a full reload to every client; a run without `--whitespace` keeps each file's recorded mode; `check` runs `tsc` once per referenced project of a solution-style tsconfig.

## 0.5.3

How to lay out an app with several pages: a new architecture guide, an Official Skill that applies it, and a medium example app checked in CI. Building the example found a codegen bug with several scanned folders, fixed here.

### Guide and Skill

- New guide `docs/architecture.md`:
  - feature folders with their components, stores and tests, and a shared folder whose components' interface is their props and events;
  - pages as custom elements mounted by an external router: route params as props, leaving a page, lazy page modules;
  - where state lives at each level, and the split between unit, real-browser and end-to-end tests;
  - one scanned folder for the generated files, checks and tsconfig.
- New `nativele-architecture` (Official): the procedure for starting a multi-page Nativele app or restructuring one into this layout. The recommended router uses the Navigation API and `URLPattern` with no dependency; universal-router is the alternative. It covers the abort check after a lazy `import()` and the test split.
- Its example, a project tracker with lazy pages, shared components, feature and app-wide stores, unit, browser and end-to-end tests, runs in CI.

### Fixes

- When several folders are scanned (`ts-dom gen a b`, `ts-dom check a b`, `ts-dom doctor a b`, the Vite plugin's `dirs`), each folder was generated on its own, so a template in one folder that used a component defined in another got no import of it and the build silently left the component out, while the types still passed. The folders now share their `define()` calls: the template imports the child by its relative path, `gen --check` and `doctor` agree with what `gen` writes, and the Vite plugin keeps the imports across folders when a template is saved or a `define()` is added or removed. A tag defined with different classes in two scanned folders is now reported as `duplicate-define` at the second `define()` call.

## 0.5.2

Skills for the libraries a Nativele app most often sits next to: state stores, testing, data fetching, form validation and Tailwind CSS. Each was accepted through agent trials, and the trials found two bugs in the library, fixed here.

### Skills

- New `nativele-state-management` (Official): where state lives (component `state`, `createStore` or an external store), and a selector adapter that connects Zustand, Redux Toolkit or nanostores to `bind`, so a component re-renders only when its slice changes. Its example project runs in CI.
- New `nativele-testing` (Official): component tests with Vitest and happy-dom or jsdom, real-browser tests with Vitest browser mode, and end-to-end tests with Playwright. It covers what the unit-test DOM cannot do (`moveBefore`, focus during a reorder), forms, slots, isolation between test files, and a clean checkout. Its example project runs in CI.
- New `nativele-tanstack-query` (Experimental): `@tanstack/query-core` observers through `bind`. It covers loading, error and refreshing states; keys from props; shared requests; mutations; and stopping requests when a component is removed.
- New `nativele-zod` (Experimental): form validation with Zod or Valibot. It covers per-field messages, nested and array fields, `aria-invalid` and descriptions (also with several instances on a page), cross-field checks, and the emitted data typed from the schema.
- New `nativele-tailwind` (Experimental): Tailwind CSS v4 in templates. It covers source detection (and excluding the installed Skills), `shadow: true` with an adopted stylesheet, `<style scoped>` defaults in a layer so utilities win, class-based dark mode in a shadow root, and templates outside the project.
- `nativele-integration` is now Official, verified with Preact 11 and an example project in CI. Its worked example is Preact:
  - the JSX declaration that types Nativele tags;
  - `onitem-select` event props;
  - a ref that sets the property for a component defined after render;
  - keyed moves, which keep the element connected where the browser has `moveBefore`.

### Fixes

- In a list item, a `data-ref` on an element inside a `data-if` block was missing from the item's `refs` (the generated type declared it, so the code compiled and then threw). The refs are now collected before the item hides its `data-if` blocks.
- `unused-ref` (and the matching checks for holes and lists) reported every ref as unused when the class held `this.refs` in a variable (`const r = this.refs; r.name.focus()`). Such an alias now counts as using every name, like `this.refs[k]`; destructuring (`const { name } = this.refs`) is still checked name by name.

### Documentation

- `bind`: it calls back at once and on every change, and only a `bind` in `connected()` comes back after re-insertion. A source's `subscribe` must return its unsubscribe function and must not call the listener when subscribing.
- Styles:
  - a template's `<style>` is not in a cascade layer, so it beats layered framework styles unless its rules are put in a layer;
  - a `shadow: true` component uses an outside stylesheet through `adoptedStyleSheets`.
- Lists: without `moveBefore` (older browsers, happy-dom, jsdom), a moved item reconnects and loses focus.
- Slots: children added later are placed after a microtask.
- `define()`: defining a name a second time keeps the first class.
- Form recipe: `aria-invalid` must be `"true"`, and blur validation needs `data-on-focusout`.

## 0.5.1

Nativele components now have a Skill for each major framework, every Skill is accepted only after a fresh agent has done real work with it, and the checks that those trials found wrong in real framework projects are fixed.

### Skills

- New `nativele-vue` (Official): Nativele components in an existing Vue 3 app. It covers an `isCustomElement` predicate that matches only the Nativele tags, so kebab-case Vue components such as `<router-link>` keep resolving; object props as properties, and `.prop` for an element that is not defined yet; prop plus event in place of `v-model`; exact event names; `<KeepAlive>` and `bind`; and a template type declaration built from `ts-dom-tags.ts`. Its example project runs in CI.
- New `nativele-vite` (Official): Nativele in an existing Vite app without a framework. It covers `tsDom({ dirs })` relative to Vite's `root`, multi-page builds, and a build script that runs `ts-dom check` before `vite build` so a clean checkout builds. It also says which edits reload the page during `vite dev`, and covers Vite+. Its example project, a multi-page app with `root` in a sub-folder, runs in CI.
- New `nativele-svelte` (Experimental): Nativele components in Svelte 5. It covers props as properties, `onitem-select` event attributes, `{#if}` and keyed `{#each}` children in slots, `bind:this`, and a `svelte/elements` type declaration.
- New `nativele-angular` (Experimental): Nativele components in Angular. It covers `CUSTOM_ELEMENTS_SCHEMA`, `[prop]` and `(item-select)` bindings, and zoneless change detection. Because the Angular builder takes no Vite plugins, `ts-dom gen` runs in npm `pre*` scripts. It also covers content projection and unit tests.
- New `nativele-integration` (Experimental): Nativele components in a framework without a Skill of its own, such as Preact or Solid. It covers the four questions to answer from the framework's documentation, defining components before mount, and the limits every framework shares.
- `nativele-core` and `nativele-react` were filled in where trial agents had to guess:
  - the core Skill gains a complete example, the no-bundler page set-up, plain-element lists and event data;
  - the React Skill starts from an existing React app, adds the `strict` and oxlint steps Vite's template needs, and type-checks with `tsc -p`, because a references-only root tsconfig checks nothing.
- The React, Vue and Svelte Skills start the template's type-check script with `ts-dom gen src/nv &&`. The generated files are not committed, so on a clean checkout that script otherwise fails with `TS2307`.
- Skill pull requests are accepted through an agent trial. A fresh agent gets only the packed package and the Skill, and does a task the Skill claims to cover. The result is checked independently, and every guess or error the Skill does not cover is sent back. Integration Skills start from the tool's own starter project and cover only what Nativele adds.

### Tooling

- `ts-dom check` runs `vue-tsc` instead of `tsc` when the project's `package.json` lists it: `vue-tsc` takes the same arguments, prints the same errors and reads `.vue` files, which plain `tsc` reports as `TS2307: Cannot find module './App.vue'`. When the checker cannot run, the message names it.
- `ts-dom doctor` checks `strict`, `lib` and `moduleResolution` only in the tsconfig files that cover the component folders, when there are any. Vite's templates no longer get `tsconfig-no-dom-lib` and `tsconfig-not-strict` for `tsconfig.node.json`, which covers only `vite.config.ts`, whether it lists it in `include` or in `files`.
- The generated `ts-dom-tags.ts` no longer ends with `export {}`, which linters reported as a useless empty export.

## 0.5.0

Nativele is a light, composable UI layer that grows its integrations through Skills instead of through the library. This version ships the first Skills and the command that delivers them, types `changed` and list event handlers more precisely, and adds recipes for common screens.

### Skills

- New `skills/` folder with the specification every Skill follows (versions it was verified with, set-up, a complete example, known limitations, verification commands; Official, Community and Experimental tiers) and a template for contributors. The package ships every `SKILL.md`.
- `nativele-core`: building components with Nativele, the `ts-dom check` loop and the rules an agent must follow (it replaces the README's "Rules for AI Agents").
- `nativele-react`: Nativele components in React 19, verified with React 19.3.1, Vite 8.3.5 and TypeScript 7.0.2: props as properties (define before render), `on<event-name>` handlers, children and slots (`shadow: true` or stable wrappers; Light DOM slots with changing React children are unsafe), lifecycle under StrictMode, and a TSX declaration that types every component's props and events from `ts-dom-tags.ts`. Its example project runs in a separate workflow (`skills.yml`) when a Skill or the library changes and once a month.
- `ts-dom skills` lists the Skills shipped with the installed version (tier, verified date and versions, and whether it is stale: older than six months or not covering the installed version); `ts-dom skills <name>` prints one; `ts-dom skills add <name...>` copies Skills into `.claude/skills/` when the project has `.claude`, otherwise into `.agents/skills/` (`--to=<dir>` for another folder). `--json` prints the list as data.
- `ts-dom doctor` suggests the Skills whose dependencies the project has (`skill-available`) and reports a project copy that differs from the shipped one (`skill-outdated`). Both are `info` and never change the exit code.

### Components

- `changed` in `render(view, changed)` also holds the derived values whose value changed (all of them on the first render), so `if (changed.has("visible")) this.lists.visible.items = view.visible` works for a derived list. Its type includes the derived names; annotate it with the names you check (`ReadonlySet<"items" | "visible">`) and tsc reports a misspelled name. The examples and guides no longer use `ReadonlySet<string>`.
- `EventHit<Item, KeyField>`: naming the item type and its key field (`hit: EventHit<Todo, "id">`) types `hit.item` as `Todo` and `hit.key` as `Todo["id"]`, with no cast.

### Lint

- New lint rule `unguarded-input-value` (in the `data-flow` group, and `ts-dom/unguarded-input-value` on its own): a `render()` that writes an `<input>`, `<textarea>` or `<select>` value without comparing it first, which moves the caret while the user types.

### Documentation

- New guide `docs/recipes.md` with `examples/recipes` and a real Chrome test: loading and error states from a shared store, showing store data in a component with state, a filtered list, events from list items, a modal dialog opened through a typed ref, and form validation.
- The guides say that `store.set` replaces the value (a component's `this.set` merges), that a component with `state`, `props` or `derive` shows store data by copying it into state, that a hidden `data-if` block keeps its elements and refs, and that Vite needs `"type": "module"` in `package.json`.
- The README's "Rules for AI Agents" becomes "Nativele Skills".
- The project's agent instructions are `AGENTS.md`, in English, and state the direction: a light UI foundation layer for larger applications, with integrations delivered as Skills.
- The README is now the introduction (the short version, Nativele Skills, a quick start with two examples, the example apps), and the full guide lives in `docs/`: templates, components and data flow, lists, recipes, setup and checks, performance, design, and developing Nativele. The guide is in English only; `README.zh-TW.md` mirrors the README. The components guide gains a table of the common DOM operations in `render` (text, `data-if` against `hidden`, attributes, classes, form values, lists).
- The README opens with a banner and the line "Designed for AI agents. Driven by TypeScript. Defined in vanilla HTML."; the package description, `llms.txt` and the repository description use the same wording, and describe the library as one for building web components rather than a UI library (it ships no ready-made components).
- The setup guide, the README and `ts-dom --help` say which commands write files: `ts-dom check` rewrites the generated files first, `ts-dom check --no-write` and `ts-dom gen --check` write nothing.

### Breaking changes

- `changed` in `render` now also holds derived names. Code that reads `changed.size` or iterates it sees more names; `changed.has(...)` checks on state and props behave as before.
- `EventHit` is now a type alias instead of an interface, so it can no longer be extended with `interface X extends EventHit`; intersect it instead (`EventHit & { ... }`).

## 0.4.6

Released together with 0.4.1 to 0.4.5, which were not published on their own.

- `ts-dom rules --explain=<id>` explains any rule id: why it exists (tied to the principle it protects), a wrong example and the fix. `ts-dom rules --json` prints every rule as data. Every rule id has an explanation; a test keeps them in step.
- The README's Checks section says which tool checks what: a formatter such as oxfmt for well-formed markup and layout (it reports misnested tags that the library's parser would silently repair), `ts-dom gen` for the template rules, `tsc` for names and types, lint for usage, data flow and accessibility, `ts-dom doctor` for the set-up, and `ts-dom check` for all of them at once.

## 0.4.5

Not published on its own; it ships with 0.4.6.

- Every rule id of `unused-markup`, `data-flow` and `a11y` is also a lint rule of its own (`ts-dom/unused-ref`, `ts-dom/missing-handler`, ...), so a project can enable rules one by one with their own severity. The three group rules stay.
- `missing-handler` offers a suggestion that adds the method to the component class.
- In the editor, the Oxc extension for VS Code (`oxlint --lsp`) shows the findings and offers the quick fix; `oxlint --fix-suggestions` applies it from the command line. Both are covered by tests that run the oxlint shipped with Vite+.
- Each template is analyzed once per file text and template text, however many rules ask for it.

## 0.4.4

Not published on its own; it ships with 0.4.6.

- `ts-dom doctor [dirs...]` checks the project set-up: a tsconfig with `strict`, the DOM lib, a module resolution other than `classic` and an `include` covering the template folders (read through `extends`: relative paths, packages and arrays; a solution-style tsconfig through its references); the runtime package being resolvable; templates imported as `./x.html` instead of `./x.html.js`; stale generated files; the Vite and oxlint plugins being configured; and a formatter (oxfmt, Prettier) set up while templates keep their whitespace. Page entries and `dist` are not counted as templates, and a folder that does not exist is reported. Stable rule ids, a `Fix:` per issue, `--json`, exit code 1 on errors.

## 0.4.3

Not published on its own; it ships with 0.4.6.

- `ts-dom check [dirs...]` runs everything in one pass for agents and CI: template diagnostics, generated files (regenerated, or reported as stale with `--no-write`), the project's own `tsc` (TypeScript 5, 6 or 7), and the lint rules (`--a11y` adds accessibility). TypeScript errors from the template contract point at the template line and column (`missing-binding`, `missing-handler`), item component problems get their own rule ids, and errors that only follow from a broken class (the ones naming that class) are left out. A tag defined twice is reported, and a tsc that does not run to completion (no tsconfig, a bad option) is reported as `tsc-failed` instead of passing silently. A solution-style tsconfig (`"files": []` with `references`) is checked through its referenced projects, a folder that does not exist is reported as `dir-not-found`, and every plain tsc error carries a `Fix:` hint. `--json` prints the issues as data; `--strict` fails on warnings.
- The README, the rules for AI agents and `llms.txt` use `ts-dom check` as the command to run after a change.

## 0.4.2

Not published on its own; it ships with 0.4.6.

- `ts-dom gen --check` writes nothing and lists generated files that are missing, outdated or orphaned (a deleted template) and the errors that would make `ts-dom gen` fail, with exit code 1 if there are any; `--json` prints them as data. `ts-dom gen` removes an orphaned generated module. A module generated with whitespace `collapse` records it, and a later `gen`, `gen --check`, `check` or `doctor` without the option keeps that mode (`--whitespace=preserve` switches back).

## 0.4.1

Not published on its own; it ships with 0.4.6.

- `npm run bench` measures lists of 1,000 to 10,000 items in real Chrome (create, update 10%, reverse, remove half, append) for component items, plain elements and a direct DOM baseline; the README's Performance section shows the results and when to choose which.
- Assigning `items` sets the prop of a new item before its element goes into the document, so the item component is connected with its item already set and renders once instead of first rendering without it. `replace()` and `upsert()` keep inserting first.
- README: a fourth example, a list of components (add, remove, sort, toggle, events up from the item), the one-line rule for choosing between `items =` and `replace()`, and how moving an item affects `connected()` and subscriptions with and without `moveBefore`. The introduction and the package description say what the library is built for: type safety and AI coding agents, which can correct their own mistakes from `tsc` errors and the `Fix:` hints of every diagnostic.
- `state`, `props`, the `view` passed to `render` and the argument of `derive` functions are typed `DeepReadonly` (class instances with private members keep their own type) (exported, with `PropAccessors`): changing an array or object inside them in place is a `tsc` error, since the list and child props compare by reference and would not update. `set()` accepts read-only values. A parent can still assign a child's props.

### Breaking changes

- Code that annotates `render`'s `view`, or a helper that takes the state, with mutable array types (`Item[]`) must use read-only ones (`readonly Item[]` or `DeepReadonly<State>`), and code that changes state objects in place no longer compiles.

## 0.4.0

### Lists of components

- `<template data-each="todos" data-key="id" data-prop="todo"><todo-row role="listitem"></todo-row></template>` and `this.lists.todos.items = todos`: each item is one component that receives its item as a property, matched by key. An element is kept for a key that stays (moved with `moveBefore`), created for a new key and removed for a key that is gone; reading `items` returns the items in document order.
- `tsc` checks the assigned items against the property type the item component declares and the `data-key` field (a string or a number). An item component defined in a scanned folder must be exported and listed in `ts-dom-tags.ts`, otherwise the assignment is a type error that names the cause; only components from outside the scanned folders get a loose type.
- New codegen rules `each-binding-incomplete`, `invalid-each-binding` and `each-binding-root`, and runtime errors with a `Fix:` hint for what types cannot see (`invalid-items`, `invalid-item`, `missing-key`, `duplicate-key`, `list-not-bound`, `unknown-prop`). A wrong `data-prop` throws before the list changes.
- The accessibility check `list-structure` accepts a custom element with `role="listitem"` as a list item.
- `replace()` stays for lists of plain elements, and `data-each` still cannot be nested: a list inside an item is that component's own list.

### Vite dev server

- Editing a template regenerates its `x.html.ts` and reloads the page once if a page uses it; a save that changes nothing does not reload. This works under Vite and Vite+ (which reports changed files by relative path).
- Deleting a template removes its generated module, and adding or removing a `define()` updates `ts-dom-tags.ts` and the child imports of the templates.
- A generated module rewritten by something else (`ts-dom gen --watch`, a checkout) reloads the page through Vite; duplicate change events and identical rewrites by other dev servers no longer reload it twice.
- `dirs` are resolved against Vite's `root` instead of the working directory. The `define()` scan is cached and redone only when a `.ts` file with a `define()` changes. Messages go to the logger of the server that saw the change.

### Fixes

- The accessibility messages say "natively" again where it had been replaced by "ts-domy".

### Breaking changes

- The Vite plugin's `dirs` are relative to Vite's `root`; a project whose `root` differs from the working directory must adjust them.
- A project whose item component class is not exported, or whose `ts-dom-tags.ts` is stale, now gets a type error on `items`.

## 0.3.0

- `ts-dom gen` rejects `<html>`, `<head>` and `<body>` inside a template (rule `document-tag`) instead of silently dropping them; a file that starts with `<!doctype html>` or `<html>` is still a page entry whatever its name.
- `tpl.instantiate().rootElement` is the template's only top-level element, typed by its tag; the type has it only for a template with exactly one top-level element (generated `x.html.ts` files carry a `rootElement` field, so regenerate them with `ts-dom gen`).
- Non-bubbling events such as media events (`canplay`, `loadeddata`, ...), `close`, `cancel` and `invalid` now reach `data-on-*` handlers; they were listened for in the bubble phase and never fired.

## 0.2.1

- Releases are published through npm Trusted Publishing: the release workflow stages the version without an npm token, and a maintainer approves it on npm. No library code changes.

## 0.2.0

First release.

### Core

- `Component(tpl, options)`: Light DOM by default, `shadow: true` for Shadow DOM (verified in real Chrome, including Shadow/Light mixed composition).
- `state`, `props`, `derive`, `emits` options. `{{ hole }}` and `data-if` bind automatically to same-named state, props and derived values; names are checked by tsc.
- `set(patch | updater)` is the only way to change state (shallow merge, no change means no render). `render(view, changed)` handles what automatic binding cannot do. `batch(fn)` coalesces updates. Rendering is synchronous.
- `props` are owned by the parent and read-only inside the component. They can be set from HTML attributes (converted by the type of the default value, camelCase <-> kebab-case) or JS properties, and a value assigned before the element is upgraded is kept.
- `emits` declares events; `emit(name, detail)` is type checked and does not bubble by default. `EmitEvent<Child, "name">` gives the event type.
- `data-on-<event>="method"`: event delegation to a method `(event, { el, key, item })`; non-bubbling events use the capture phase; only elements of the component's own template are owned; `define()` verifies in the types that the methods exist.
- Lists: `lists.name.replace(items, key, update, { skipUnchanged })`, `upsert`, `remove`, `clear`; per-item `data-if` and `{{ }}`.
- Light DOM `<slot>`: named, default, fallback, dynamic assignment (including a changed `slot` attribute), `slotchange()`, `assignedNodes()`.
- Light DOM `<style>` is injected once per document; `<style scoped>` uses the native `@scope` and falls back to CSS nesting.
- `createStore` (`get` / `set` / `subscribe`), `bind`, `on`, `onCleanup`.
- Trusted Types compatible: the generated `x.html.ts` holds the parsed markup as data and the runtime builds it with `createElement`, `setAttribute` and `createTextNode`, so no HTML string is parsed and pages that enforce `require-trusted-types-for 'script'` work without a policy (verified in real Chrome).
- Components accept atomic moves (`connectedMoveCallback`) and keyed lists reorder with `moveBefore` where available, so a moved item is not disconnected and keeps its focus and subscriptions.
- `tpl.instantiate()` builds a template without a component and returns typed `root`, `refs`, `lists`, `text` and `show`.
- `ts-dom gen` rejects `<script>`, `on*` attributes, `srcdoc` and `javascript:` URLs (rules `forbidden-tag`, `forbidden-attribute`, `unsafe-url`), because they run code or are blocked when Trusted Types is enforced.
- `whitespace: "collapse"` (CLI `--whitespace=collapse`, Vite plugin option) collapses whitespace runs and drops line-break-only text between tags; the default keeps text as written.
- `replace()` throws `[duplicate-key]` for two items with the same key and leaves the list untouched. `EventHit<Item>` types `hit.item` when the handler annotates it. `bind` accepts any source with `get` and `subscribe` (`ReadableStore`).
- `ts-dom gen --include=<glob> --exclude=<glob>` (and the Vite plugin options) generate only the selected templates, for migrating a project in steps.
### Composition

- Child components used in a template are imported automatically by the generated `x.html.ts`; HTML is the only source of dependencies.
- `ts-dom gen` also generates `ts-dom-tags.ts`, which registers every exported `define("tag", Class)` component in `HTMLElementTagNameMap`, so `refs.child` is fully typed. `define()` calls inside strings and comments are ignored.

### Tooling

- No Vite or bundler required: `ts-dom gen` writes `x.html.ts` (a real TypeScript module with the template markup and its types), imported as `./x.html.js`; the compiled JS runs in a browser with an import map. `ts-dom gen --watch` is available.
- `ts-dom` CLI: `gen [--watch]`, `lint [--a11y] [--strict] [--json]`, `rules`.
- `@nativele/ts-dom/vite`: optional plugin (generate, watch, optional a11y warnings).
- Every diagnostic has a stable rule id, an HTML location where possible, and says what is wrong and how to fix it. `ts-dom rules` lists them.
- `@nativele/ts-dom/oxlint` rules: `unused-markup` (errors), `data-flow` (warnings: `prop-forwarding`, `emit-forwarding`, `props-mutation`, `custom-event-on-native`, plus the HTML-level child contract checks `unknown-prop`, `invalid-prop-value`, `unknown-event`), `a11y` (21 rules, opt in).

### Design decisions

- One direction of data flow: state is changed by its owner, props by the parent, events go up. Events do not bubble by default; data needed several levels down belongs in a shared store, not in forwarded props or re-emitted events.
- `{{ }}` accepts a single identifier only; there are no expressions and no attribute bindings.
- `<slot>` is not allowed inside `data-each` (the item repeats, the user content does not); `data-if` is not allowed on a list item root; `data-each` cannot be nested.
- No fine-grained reactivity: `derive` is recomputed and `render` is called as a whole after every change.

### Known limitations

See the "Limitations" section of the README.
