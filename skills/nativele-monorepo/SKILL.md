---
name: nativele-monorepo
description: "Use Nativele across the packages of a workspace (npm or pnpm workspaces, optionally with a task runner such as turbo): a package of shared components used by one or more apps, where each package generates and checks its own components, how an app gets their modules and their tag types, where @nativele/ts-dom and typescript must be installed, and which package must be generated or built before another type-checks. Use when a repository has several package.json files and Nativele components in one of them are used by another."
metadata:
  tier: official
  nativele: ">=0.5.5 <0.6.0"
  verified: "2026-11-05"
  tools: "npm@11.19.1 pnpm@12.16.1 turbo@2.11.10 vite@8.3.6 typescript@7.0.2 create-vite@9.3.4 vue-tsc@3.3.14"
  author: "Nativele maintainers"
  detects: "turbo nx lerna"
---

# Nativele in a monorepo

## When to use

- The repository is a workspace (a root `package.json` with `workspaces`, or a `pnpm-workspace.yaml`), and Nativele components live in a package that another package uses: a component package (`packages/ui`) consumed by one or more apps (`apps/web`), or several packages that each have components.
- Signals: more than one `package.json` that lists `@nativele/ts-dom`; an app that depends on a workspace package (`"@acme/ui": "workspace:*"` or a version) whose source has `define()` calls; `turbo`, `nx` or `lerna` in the root `package.json`, which is what `ts-dom doctor` matches (it reads only dependencies, and a workspace is declared by `workspaces` or `pnpm-workspace.yaml`, not by a dependency).
- This Skill owns the workspace side of Nativele: where each package's `ts-dom` commands run and on which folder, how a component package exposes its modules and tag types, which package declares `@nativele/ts-dom` and `typescript`, and the order in which packages must be generated or built. It keeps the user's package manager, workspace layout and task runner. It does not own `tsconfig*.json` (`nativele-typescript`), the build tool and its config (`nativele-vite` or the framework's Skill), lint, CI, or the task runner's config; it states what they must do and leaves the how to them.
- Not for one package with several folders: scan one folder, as the [architecture guide](https://github.com/Pixmi/nativele/blob/main/docs/architecture.md#generated-files-checks-and-tsconfig) says. Not for setting a workspace up from nothing.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.5.5 (the last agent trial) |
| npm (workspaces) | 11.19.1, on Node 24.22.2 |
| pnpm (workspaces) | 12.16.1 |
| turbo | 2.11.10 (with npm workspaces) |
| vite | 8.3.6 |
| typescript | 7.0.2 (and 6.0.3 where hoisting put it, see Known limitations) |
| create-vite (`vanilla-ts`, the app) | 9.3.4 |
| vue-tsc | 3.3.14 (only to see which package's checker `ts-dom check` runs) |

Verified on 2026-11-05 in Google Chrome 148 with a component package `packages/ui` and a Vite app `apps/web` from `create-vite`, built once before Nativele was added, in an npm workspace and a pnpm workspace: the component package exported as TypeScript source and as built JavaScript with declarations, and the built one also packed and installed into a separate app. Not verified: yarn and Bun workspaces, nx, lerna, TypeScript project references across packages (`tsc -b` with `composite`), and apps with a UI framework consuming the package. With a different major version of npm, pnpm or turbo, treat every step as unverified.

## Set-up

Check first, then change only what fails. Use the workspace's own package manager and commands for every install and script; never add or switch one.

1. **Read the workspace.** The root `package.json` (`workspaces`, `packageManager`, scripts), `pnpm-workspace.yaml`, the lockfile (which package manager), and a task runner's config (`turbo.json`, `nx.json`). For each package: does its `package.json` list `@nativele/ts-dom` and `typescript`, where are its templates (the folder with `.html` and `define()` files), which workspace packages does it depend on, and what is its `exports`.
   When a component that already lives in an app moves into the package, keep its tag name, and remove what pointed to its old place in the app: the old folder in the app's `tsDom({ dirs })` and in its `ts-dom` scripts (point them at the folder that holds the app's own components; a folder that no longer exists fails with `dir-not-found`, and the app's own templates are then not generated), the import in the app's entry, and the `ts-dom-tags.ts` left in the old folder.
2. **Check the copies of the library:** `npm ls @nativele/ts-dom` or `pnpm why -r @nativele/ts-dom`. Expect one version (npm prints the others as `deduped`; pnpm prints `Found 1 version of @nativele/ts-dom`). Two versions work, but ship the runtime twice (Known limitations 6).
3. **Declare the dependencies in every package that needs them.** Each package resolves `@nativele/ts-dom`, `typescript` and the `ts-dom` command from its own folder, so relying on another package's hoisted copy breaks when the layout changes (Known limitations 7):

   | Package | `@nativele/ts-dom` | `typescript` |
   |---|---|---|
   | component package | `peerDependencies` with the range the apps use (`"^0.5.5"`), and the same version in `devDependencies` for its own `ts-dom` and tests | `devDependencies` |
   | app | `dependencies` | `devDependencies` |

   The peer lets an app outside the workspace install the package without a second copy (verified: a packed component package installed into a separate app gave one `@nativele/ts-dom`, `deduped`). Inside the workspace the package's own `devDependencies` entry satisfies its peer, so the peer does not stop a second version there; step 2 does. Install with the workspace's command (`npm i -D -w @acme/ui @nativele/ts-dom typescript`, `pnpm --filter @acme/ui add -D @nativele/ts-dom typescript`), then add the peer to that `package.json` (`npm pkg set "peerDependencies.@nativele/ts-dom=^0.5.5" -w @acme/ui`, or by editing the file). The app depends on the component package the way the workspace already links its packages (`"workspace:*"` in pnpm, a version in npm).
4. **Each package scans only its own folder, and its `ts-dom` commands run in that package.** In `packages/ui`: `ts-dom check src`; in `apps/web`: `ts-dom check src`, and `tsDom()` keeps the app's own `dirs`. From the root, run them through the workspace (`npm exec -w web -- ts-dom check src`, `pnpm --filter web exec ts-dom check src`, `pnpm -r exec ts-dom check src`, or each package's script). Do not give one command the folders of several packages, and do not add another package's folder to `tsDom({ dirs })` (Known limitations 4).
5. **The component package exposes its components through one entry module** (its `exports`):
   - it imports or re-exports every module that calls `define()`, so importing the package registers the tags;
   - it has the line `export type {} from "./ts-dom-tags.js";`, which brings the package's generated tag map into every program that imports the package, so consumers get the props, events and list item types of its tags (Known limitations 2); the component classes it exports must be `export class`, as in [Composition](https://github.com/Pixmi/nativele/blob/main/docs/components.md#composition-using-multiple-components-together);
   - its `package.json` has no `"sideEffects": false`. If the project wants `sideEffects`, list the entry module and every module that calls `define()` (Known limitations 9).
6. **Source or built.** Both were verified inside a workspace with Vite; which one is the user's choice, and the build belongs to the build owner:
   - Source: `"exports": { ".": "./src/index.ts" }`. The app's bundler compiles the package, and the app's type check reads the package's source with the app's tsconfig, so the package's generated files must exist before the app type-checks or builds.
   - Built: the package's build writes JavaScript and declarations (`tsc` with `declaration` and `outDir: "dist"` was verified), and `"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }`. The generated templates are compiled into `dist` (`x.html.js`, `x.html.d.ts`, `ts-dom-tags.d.ts`), the declaration of the entry keeps `export type {} from "./ts-dom-tags.js"`, and a consumer runs no `ts-dom` on the package. A package published outside the workspace must be built: the consumer's `ts-dom` does not generate inside `node_modules`, and `npm pack` leaves out the git-ignored generated files, so a source package installed from a tarball failed to resolve its `./x.html.js` imports. Ship `dist` (`"files": ["dist"]`); the templates and generated sources are not needed.
   The tsconfig for the package's build belongs to the TypeScript Skill (`nativele-typescript`); what this Skill needs from it is that it includes the folder with `ts-dom-tags.ts` and emits declarations.
7. **The app imports the package once for its side effect** in its entry module (`import "@acme/ui";`), and the types it needs (`import type { UiButton, Tag } from "@acme/ui";`). An object or array prop such as `badge` cannot be written as an attribute in the app's template; set it from TypeScript (`this.refs.badge.badge = {...}` in `render`, or the element's property). A template in the app that uses `<ui-button>` gets no import of it from `ts-dom gen`, because the tag is not defined in the app's folder ([architecture guide](https://github.com/Pixmi/nativele/blob/main/docs/architecture.md#generated-files-checks-and-tsconfig)).
8. **State the order to the owner of the scripts or the task runner.** The component package's `ts-dom gen` (source) or its build (built) must finish before the app's `ts-dom check`, `tsc` or `vite build`. What was observed with each tool, for the owner to use:
   - `npm run <script> --workspaces` runs the packages in the order of the `workspaces` array, not by dependency: `["packages/*", "apps/*"]` ran `packages/ui` first, `["apps/*", "packages/*"]` ran the app first. Do not reorder an array that lists apps first (the order is the team's, and other scripts may depend on it); name the packages in order instead: `npm run build -w @acme/ui && npm run build -w web`.
   - `pnpm -r run <script>` ran `packages/ui` first although `pnpm-workspace.yaml` listed `apps/*` first, because the app depends on it.
   - turbo with `"dependsOn": ["^build"]` ran the package first. Its `outputs` must contain what the next package reads: `dist/**` for a built package, and for a source package also the generated files (`"src/**/*.html.ts"`, `"src/**/ts-dom-tags.ts"`); with only `dist/**`, a cache hit on a clean checkout restored nothing and the app's check failed with `TS2307: Cannot find module './ui-button.html.js'` inside `packages/ui`.
   Each package's own script still type-checks after generating (`ts-dom check src && ...`), as the Vite Skill and the TypeScript Skill say; doctor's `typecheck-before-gen` reads the `.gitignore` files from the package up to the workspace root, so a root-only `.gitignore` counts.
9. **During development**, the app's dev server does not regenerate another package's templates. For a source package, run `ts-dom gen --watch src` in the component package next to the app's `vite`: the app's dev server then reloads the page when the package's generated file changes. A built package needs its own watch build, which is the build owner's.
10. **Skills and doctor.** `ts-dom skills add` copies into the folder it runs in (`.claude/skills/` or `.agents/skills/`), and `ts-dom doctor` looks for copies in the folder it runs in and the folders above it up to the workspace root (a `package.json` with `workspaces`, a `pnpm-workspace.yaml`, else the git root). Copy the Skills where the agent is started (usually the root); doctor in each package then sees them there.
11. **Run Verify.**

## Example

npm workspaces; with pnpm, the root has `pnpm-workspace.yaml` (`packages: ["apps/*", "packages/*"]`), the app depends on `"@acme/ui": "workspace:*"`, and the root script is `pnpm -r run build`. The app is `create-vite`'s `vanilla-ts` template with its `tsconfig.json` and `.gitignore` unchanged; its starter files (`counter.ts`, `assets`, `public`) were removed. The trial installed the packed library where the files say `^0.5.5`.

```json
// package.json (root)
{
  "name": "shop",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": { "build": "npm run build --workspaces" }
}
```

```gitignore
# .gitignore (root)
node_modules
*.html.ts
ts-dom-tags.ts
```

```json
// packages/ui/package.json
{
  "name": "@acme/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "build": "ts-dom check src" },
  "peerDependencies": { "@nativele/ts-dom": "^0.5.5" },
  "devDependencies": { "@nativele/ts-dom": "^0.5.5", "typescript": "^7.0.2" }
}
```

```json
// packages/ui/tsconfig.json (owned by TypeScript; shown as verified)
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM"],
    "strict": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

```html
<!-- packages/ui/src/ui-button.html -->
<button type="button" data-on-click="press">{{ label }}</button>
```

```ts
// packages/ui/src/ui-button.ts
import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./ui-button.html.js";

export class UiButton extends Component(tpl, {
  props: { label: "" },
  emits: { "ui-press": event<{ label: string }>() },
}) {
  press(): void {
    this.emit("ui-press", { label: this.props.label });
  }
}
define("ui-button", UiButton);
```

```html
<!-- packages/ui/src/ui-tag.html -->
<span>{{ text }}</span>
```

```ts
// packages/ui/src/ui-tag.ts
import { Component, define } from "@nativele/ts-dom";
import tpl from "./ui-tag.html.js";

export interface Tag {
  id: string;
  label: string;
}

export class UiTag extends Component(tpl, {
  props: { tag: { id: "", label: "" } as Tag },
  derive: { text: (s) => s.tag.label },
}) {}
define("ui-tag", UiTag);
```

```ts
// packages/ui/src/index.ts
export type {} from "./ts-dom-tags.js";
export { UiButton } from "./ui-button.js";
export { UiTag, type Tag } from "./ui-tag.js";
```

```json
// apps/web/package.json (the parts that change)
{
  "scripts": { "build": "ts-dom check src && vite build" },
  "dependencies": { "@acme/ui": "^0.0.0", "@nativele/ts-dom": "^0.5.5" },
  "devDependencies": { "typescript": "~7.0.2", "vite": "^8.3.6" }
}
```

```ts
// apps/web/vite.config.ts
import { defineConfig } from "vite";
import { tsDom } from "@nativele/ts-dom/vite";

export default defineConfig({
  plugins: [tsDom()],
});
```

```ts
// apps/web/src/main.ts (index.html has <app-shell></app-shell> in its body)
import "./style.css";
import "@acme/ui";
import "./app-shell.ts";
```

```html
<!-- apps/web/src/app-shell.html -->
<p>{{ message }}</p>
<ui-button data-ref="add" label="Add tag" data-on-ui-press="onAdd"></ui-button>
<div role="list">
  <template data-each="tags" data-key="id" data-prop="tag">
    <ui-tag role="listitem"></ui-tag>
  </template>
</div>
```

```ts
// apps/web/src/app-shell.ts
import { Component, define } from "@nativele/ts-dom";
import type { EmitEvent } from "@nativele/ts-dom";
import type { Tag, UiButton } from "@acme/ui";
import tpl from "./app-shell.html.js";

export class AppShell extends Component(tpl, {
  state: { message: "No tags yet", tags: [] as Tag[] },
}) {
  onAdd(e: Event): void {
    const { label } = (e as EmitEvent<UiButton, "ui-press">).detail;
    const n = this.state.tags.length + 1;
    this.set({ message: `${label}: ${n}`, tags: [...this.state.tags, { id: `t${n}`, label: `tag ${n}` }] });
  }
  override render(v: { tags: readonly Tag[] }): void {
    this.refs.add.label = v.tags.length ? "Add another" : "Add tag";
    this.lists.tags.items = v.tags;
  }
}
define("app-shell", AppShell);
```

`this.refs.add` is `UiButton` and `this.lists.tags.items` takes `Tag` items only because the package's tag map reaches the app through `export type {} from "./ts-dom-tags.js"`.

## Known limitations

1. **A tag from another package is neither imported nor defined for you.** The app's generated `x.html.ts` imports only components defined in the app's scanned folder. With only `import type` from the package, the build succeeds and the page shows the tags as empty, never-upgraded elements (`customElements.get("ui-button")` is `undefined`), with no error in the console. Import the package for its side effect (step 7).
2. **The package's `ts-dom-tags.ts` does not reach consumers by itself**: nothing imports it. Without step 5's line, the app's `refs` of the package's tags are plain `HTMLElement` (`TS2339: Property 'label' does not exist on type 'HTMLElement'`), and a keyed list of the package's item component takes any object type with the key field but rejects items typed by an interface (`Index signature for type 'string' is missing in type 'Tag'`). `import type {} from "./ts-dom-tags.js"` and `/// <reference path="./ts-dom-tags.ts" />` work for a source package, but both are dropped from the emitted `index.d.ts` of a built one; `export type {} from` is kept there and erased from the JavaScript. `import "./ts-dom-tags.js"` is kept too, but as a runtime import of an empty module.
3. **Lint does not see another package's components.** With the tag map in place, `tsc` checks their prop types (`TS2322: Type 'number' is not assignable to type 'string'`), list item types and `EmitEvent` details, but a misspelled attribute (`lable="Save"`) or event (`data-on-ui-pres`) on the package's tag is not reported: `unknown-prop` and `unknown-event` read only the scanned folders.
4. **One `ts-dom` run over several packages' folders breaks package boundaries.** `ts-dom gen packages/ui/src apps/web/src` from the root writes `import "../../../packages/ui/src/ui-button.js"` into the app's generated files, bypassing the package's `exports`; the app's own run (and `tsDom()` at build start) writes the files without it, so `ts-dom gen --check` from either side reports the other's files as `stale-generated`. With a built package, an app bundled from those files contained both `packages/ui/dist/ui-button.js` and `packages/ui/src/ui-button.ts`. `tsDom({ dirs: ["src", "../../packages/ui/src"] })` does the same. From the root, `ts-dom check` also needs a root `tsconfig.json` (without one: `tsc-failed`; `ts-dom doctor`: `no-tsconfig`), and uses what resolves from the root: its `typescript`, and `vue-tsc` only if the root `package.json` lists it (`ts-dom check` picks the checker by the `package.json` of the folder it runs in: in a pnpm workspace it ran `vue-tsc` in the app that listed it and `tsc` in the component package).
5. **A tag defined in two packages fails silently at runtime.** `define()` skips a tag that is already registered, so the module loaded first wins and the other class is never used, with no error. Per package, `ts-dom check` reports it only when both tag maps are in one program, as `duplicate-define` (from tsc's `TS2717` in `ts-dom-tags.ts`; its `Fix:` says to rename the tag). A run over both folders reports `duplicate-define`, with the problems of limitation 4. Give each package's tags a prefix of their own.
6. **Two versions of `@nativele/ts-dom` work but ship twice.** With the component package on another version than the app, props, events, a keyed list of the package's item component and a store created in the package and bound in the app all worked, and the minified bundle grew from 18.20 kB to 34.29 kB. No `ts-dom` command reports it, and inside the workspace the peer does not prevent it (step 3); step 2 does.
7. **Hoisting hides missing dependencies until an install changes it.** In an npm workspace, a component package that listed nothing generated, checked and built through the root's hoisted copies, and doctor said `the set-up looks right`. After adding and removing `vue-tsc` in the app, `typescript` moved into `apps/web/node_modules`, and `ts-dom check src` in the package printed only `warning [tsc-not-found]` and exited 0, so nothing was type-checked. Adding `vue-tsc` to the app had also put `typescript@6.0.3` at the root while the app listed `~7.0.2`: `npx tsc` in the app was 7.0.2, while `ts-dom check` from the root ran 6.0.3. In pnpm the same package fails at once: `Command "ts-dom" not found`, and the app's check reports `TS2307: Cannot find module '@nativele/ts-dom'` in the package's files. Step 3 fixes all of these.
8. **`ts-dom doctor` reads the folder it runs in** for its `package.json`, `tsconfig.json` and Vite config, and the folders up to the workspace root for `.gitignore` and Skill copies. At the root without folders it reports `dir-not-found` for `src`. Run it in each package with that package's folder, and check the script order yourself (step 8).
9. **`"sideEffects": false` drops the components from a production build.** With it in the component package, `vite build` removed `import "@acme/ui"` and every `define()`, and no tag was registered. A list must name the entry module too: a list of only the modules that call `define()` still dropped them, while `["./src/index.ts", "./src/ui-*.ts"]` and `["**/*.ts"]` kept them.
10. **The app's dev server does not watch another package's templates** (step 9).

## Verify

At the root:

```sh
npm ls @nativele/ts-dom          # pnpm: pnpm why -r @nativele/ts-dom; expect one version
```

In each package that has components (here `packages/ui`, then `apps/web`; pnpm: `pnpm exec ts-dom ...`):

```sh
npx ts-dom doctor src            # expect: no error; tsconfig-* findings go to the TypeScript Skill; skill-available is info
npx ts-dom check src             # expect: ts-dom check: no issues (never tsc-not-found)
```

From the root, the build through the workspace on a clean checkout (no `*.html.ts`, no `ts-dom-tags.ts`, no `dist`):

```sh
npm run build                    # pnpm: pnpm run build; expect: packages/ui's script before apps/web's, each "ts-dom check: no issues", then vite's "built in"
```

Then prove the types cross the package boundary: in the app's `render`, write `this.refs.add.label = v.tags.length;` and expect `TS2322: Type 'number' is not assignable to type 'string'` from `npx ts-dom check src`; write `this.lists.tags.items = v.tags.map((t) => ({ id: t.id, name: t.label }));` and expect a `TS2322` that ends with `Property 'label' is missing in type '{ id: string; name: string; }'`. Undo both. In the browser (`vite preview`), `customElements.get("ui-button")` and `customElements.get("ui-tag")` are defined, clicking the button changes its label to "Add another" and adds a `<ui-tag>` per click, and the console has no errors.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The package's tags render nothing, no console error, `customElements.get(tag)` is `undefined` | the app imports the package only as types, or `"sideEffects": false` dropped it from the build | `import "@acme/ui"` in the app's entry (step 7); remove `sideEffects: false` or list the entry and `define()` modules |
| `TS2339: Property 'label' does not exist on type 'HTMLElement'` on a ref of the package's tag | the package's tag map does not reach the app | `export type {} from "./ts-dom-tags.js"` in the package's entry; for a built package, rebuild it |
| `TS2307: Cannot find module './ui-button.html.js'` in `../../packages/ui/src/...` during the app's check | the source package was not generated first (clean checkout, wrong order, or a task runner cache without the generated files in `outputs`) | run the package's `ts-dom gen src` first (step 8) |
| `TS2307: Cannot find module '@acme/ui'` and `TS2882` for `import "@acme/ui"` | the built package's `dist` does not exist yet | build the package first (step 8) |
| `Index signature for type 'string' is missing in type 'Tag'` on a keyed list of the package's item component | the package's tag map does not reach the app (limitation 2) | as above |
| `Could not resolve './ui-tag.html.js' in node_modules/@acme/ui/src/ui-tag.ts`, and `TS2307` for it | a source package installed from a tarball or a registry: `npm pack` left out the git-ignored generated files, and the app's `ts-dom` does not generate inside `node_modules` | publish the package built (step 6) |
| `TS2307: Cannot find module '@nativele/ts-dom'` in the package's files (pnpm) | the component package does not list it | step 3 |
| `pnpm exec ts-dom ...` stops with `Command "ts-dom" not found`, and `npx ts-dom` asks the registry for an unrelated package named `ts-dom` (`404`) | the package where it runs does not list `@nativele/ts-dom` | step 3 |
| `error [tsc-not-found]` and exit code 1 | `typescript` is not resolvable from that package (it was only hoisted) | `typescript` in the package's `devDependencies` |
| `stale-generated` for the app's files right after a run elsewhere | one run covered several packages' folders (limitation 4) | run each package on its own folder; regenerate with `ts-dom gen src` in the app |
| `error [duplicate-define]` mentioning `TS2717` | two packages define the same tag (limitation 5) | rename one tag |
| `tsc-failed`: `vue-tsc did not check the types` in one package only | `ts-dom check` runs `vue-tsc` where that package lists it; with TypeScript 7 it fails | see the TypeScript Skill (`nativele-typescript`) |
| `npm i -D -w @acme/ui ...` reports success but the package's `package.json` is unchanged | npm 11.19.1 did not save to a workspace folder created after the last install | run `npm i` at the root once, then the command again |
| pnpm prints `Agent skills awaiting approval: @nativele/ts-dom` on install | a pnpm 12 permissions message; `ts-dom skills` and `ts-dom skills add` worked without approving | the user decides with `pnpm approve` |

## See also

- One scanned folder, and components outside the scanned folders: https://github.com/Pixmi/nativele/blob/main/docs/architecture.md#generated-files-checks-and-tsconfig
- How a template brings in child components, and `ts-dom-tags.ts`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#composition-using-multiple-components-together
- Scanning several folders, the generated files, `ts-dom gen --check` and `--watch`: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#installation-and-setup
- What `ts-dom check` and `ts-dom doctor` check, and how `check` picks `vue-tsc`: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#checks
- The tsconfig of each package: https://github.com/Pixmi/nativele/blob/main/skills/nativele-typescript/SKILL.md
- The Vite plugin, `dirs` and the build script: https://github.com/Pixmi/nativele/blob/main/skills/nativele-vite/SKILL.md
- How Skills share a project, and who owns which configuration: https://github.com/Pixmi/nativele/blob/main/skills/README.md#how-skills-work-together
