---
name: nativele-vite
description: "Add Nativele to an existing Vite app without a UI framework, and set up the tsDom() Vite plugin correctly: dirs and Vite's root, multi-page apps, the build script, and what vite dev does when a template or component changes. Use when a project depends on vite (or vite-plus) and @nativele/ts-dom."
metadata:
  tier: official
  nativele: ">=0.7.0 <0.8.0"
  verified: "2026-11-08"
  tools: "vite@8.3.6 typescript@7.0.2 create-vite@9.3.4 vite-plus@1.5.0"
  author: "Nativele maintainers"
  detects: "vite vite-plus"
---

# Nativele + Vite

## When to use

- A Vite app with no UI framework (for example one started with `npm create vite@latest -- --template vanilla-ts`) that adds components written with Nativele (`@nativele/ts-dom`).
- Any Vite project with Nativele whose set-up goes beyond the defaults: `root` in a sub-folder, several HTML pages, Vite+, or questions about what `vite dev` does when a template changes.
- Signals: `vite` or `vite-plus` and `@nativele/ts-dom` in `package.json`, a `vite.config.ts`.
- With a UI framework, follow its Skill: `nativele-react`, `nativele-vue`, `nativele-svelte`, `nativele-angular`, or `nativele-integration` for any other. The plugin, `dirs`, `root` and the build script (step 5) apply there too.
- The hot-update behavior below was verified without a framework.
- Not for writing the components themselves (`npx ts-dom skills add nativele-core`), and not for setting Vite up.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.7.0 (the last agent trial) |
| vite | 8.3.6 |
| typescript | 7.0.2 |
| create-vite (`vanilla-ts` template, the starting point) | 9.3.4 |
| vite-plus | 1.5.0 (checked by hand with `vp dev`, `vp build` and `vp lint`) |

Verified on 2026-11-08 in Google Chrome 157, and by an agent trial: a fresh agent did real work with only the Skill, and the result was checked independently. With a different major version of Vite, treat every step as unverified.

## Set-up

Starting from the `vanilla-ts` template, which already has `"type": "module"`, a `tsconfig.json` with `"include": ["src"]` and no `strict`, no `vite.config.ts`, and `"build": "tsc && vite build"`:

1. `npm i @nativele/ts-dom`.
2. Keep the components in their own folder, for example `src/nv/`, each as `x.html` plus `x.ts` (write them with `nativele-core`).
3. The `tsconfig.json` must meet Nativele's requirements; in this template only an explicit `"strict": true` is missing, and `"include": ["src"]` already covers `src/nv`. Check and adjust it with the TypeScript Skill (`npx ts-dom skills nativele-typescript`).
4. Create `vite.config.ts` (the template has none, so `ts-dom doctor` cannot report the plugin as missing yet):

   ```ts
   import { defineConfig } from "vite";
   import { tsDom } from "@nativele/ts-dom/vite";

   export default defineConfig({ plugins: [tsDom({ dirs: ["src/nv"] })] });
   ```

   - `dirs` is resolved against Vite's `root`, not against the folder you run commands in (see step 8).
   - With a formatter, give the plugin the whitespace mode the formatting Skill decides (`npx ts-dom skills nativele-formatting`), for example `tsDom({ dirs: ["src/nv"], whitespace: "collapse" })`. Pass the same `--whitespace=collapse` to every `ts-dom gen` and `ts-dom check` in the scripts.
   - The other options are in the Vite plugin guide (See also).

5. Make the build script generate the templates before its type check, given the same folder:

   | Type check of the project | Build script |
   |---|---|
   | plain `tsc` (this template) | replace `tsc` with `ts-dom check`: `ts-dom check src/nv && vite build` |
   | a framework's own (`tsc -b`, `vue-tsc -b`, `svelte-check`) | keep it and put `ts-dom gen` first: `ts-dom gen src/nv && vue-tsc -b && vite build` |

   ```sh
   npm pkg set scripts.build="ts-dom check src/nv && vite build"
   ```

   On a clean checkout, a script that starts with `tsc` fails with `TS2307: Cannot find module './x.html.js'` and follow-on errors. The generated files are not committed, so nothing has written them yet.

   - `ts-dom check` writes them, then runs `tsc` and the lint rules.
   - `ts-dom gen` only writes them.
   - `vite build` writes them too, but never type-checks.

   CI starts from such a checkout; the rest of what its job needs is in `npx ts-dom skills nativele-ci`.

6. Add `*.html.ts` and `ts-dom-tags.ts` to `.gitignore`.
7. Import each page's components from that page's entry module, and write the tags straight into the page's HTML (`<hello-card name="home"></hello-card>`; attributes reach string props). Import the component modules the way the project imports its own (`./nv/hello-card.ts` in this template), and templates always as `./x.html.js`.
8. When `root` is a sub-folder (a multi-page app, or an app kept in `web/` of the same package), each path is relative to a different folder (an app with its own `package.json` in a workspace is covered by `npx ts-dom skills nativele-monorepo` instead):

   | Setting | Relative to | With `root: "web"` |
   |---|---|---|
   | `tsDom({ dirs })` | Vite's `root` | `["src/nv"]` |
   | `ts-dom check`, `doctor`, `gen`, `lint` arguments | the folder they run in (the one with `package.json` and `tsconfig.json`) | `web/src/nv` |
   | `include` in `tsconfig.json` (owned by `nativele-typescript`) | the tsconfig's folder | `["web/src"]` |
   | `build.rolldownOptions.input` | write absolute paths (see Troubleshooting) | `resolve(import.meta.dirname, "web/about.html")` |

   Nativele needs nothing per page: each page's entry imports the components that page uses.

9. With Vite+ instead of Vite, import `defineConfig` from `"vite-plus"`; the plugin, `dirs` and the build script are the same. The `lint` block of the config belongs to the linting Skill (`npx ts-dom skills nativele-linting`). If `vp build` then stops with `Cannot find package 'vite'`, see Troubleshooting.

## Example

A two-page app with `root: "web"`:

```
package.json  tsconfig.json  vite.config.ts
web/index.html  web/about.html
web/src/main.ts  web/src/about.ts
web/src/nv/hello-card.html  web/src/nv/hello-card.ts  web/src/nv/about-card.html  web/src/nv/about-card.ts
```

```jsonc
// package.json (scripts)
"dev": "vite",
"build": "ts-dom check web/src/nv && vite build"
```

```jsonc
// tsconfig.json: the template's, with "strict": true and
"include": ["web/src"]
```

```ts
// vite.config.ts
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { tsDom } from "@nativele/ts-dom/vite";

const page = (file: string) => resolve(import.meta.dirname, "web", file);

export default defineConfig({
  root: "web",
  plugins: [tsDom({ dirs: ["src/nv"] })],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rolldownOptions: { input: { main: page("index.html"), about: page("about.html") } },
  },
});
```

```html
<!-- web/index.html (body); web/about.html has <about-card></about-card> and /src/about.ts -->
<hello-card name="home"></hello-card>
<script type="module" src="/src/main.ts"></script>
```

```ts
// web/src/main.ts
import "./nv/hello-card.ts";
```

```html
<!-- web/src/nv/hello-card.html -->
<p>Hello, {{ name }}</p>
<button type="button" data-on-click="bump">clicked {{ count }}</button>
```

```ts
// web/src/nv/hello-card.ts
import { Component, define } from "@nativele/ts-dom";
import tpl from "./hello-card.html.js";

export class HelloCard extends Component(tpl, { props: { name: "" }, state: { count: 0 } }) {
  bump(): void {
    this.set({ count: this.state.count + 1 });
  }
}
define("hello-card", HelloCard);
```

## Known limitations

1. **Every change reloads the page; component state is lost.** A custom element tag can be defined only once, so there is no hot swap of a component. During `vite dev`:

   | Change | What happens |
   |---|---|
   | A template is edited | its `x.html.ts` is regenerated and the browser reloads; the terminal prints `[vite] (client) page reload src/nv/x.html` |
   | A template is saved with no change | no reload (the terminal still prints the `page reload` line) |
   | A template no page has loaded since the dev server started is edited | no reload |
   | A template some page has loaded is edited | every open page reloads, also pages that do not use it |
   | A template that `ts-dom gen` rejects is saved | no reload: the page keeps the last good version, and the error (`file:line:col error [rule-id] ... Fix: ...`) is printed only in the terminal, with no overlay in the browser |
   | A template uses a name the component does not have (`{{ nope }}`) | it is regenerated and reloads, the hole stays empty, and nothing reports it: only `ts-dom check` does |
   | A component `.ts` is edited | Vite reloads the page, and the new class runs |

2. **Do not call `import.meta.hot.accept()` in a module that imports components.** Vite then re-runs the modules instead of reloading, `define()` finds the tag already defined and keeps the old class, and the edit silently has no effect until a manual reload.
3. **Neither `vite dev` nor `vite build` type-checks.** Run `ts-dom check` (the build script in step 5 does), and run it after a template change that `vite dev` accepted without complaint.
4. **A wrong `dirs` only warns.** For a folder that does not exist from Vite's `root` (for example `["web/src/nv"]` with `root: "web"`), the plugin prints `warning [dir-not-found]` when the build starts and goes on. A folder that exists but holds none of the templates gives no warning. Either way nothing is generated, and the build then fails at an unresolved `./x.html.js` (see Troubleshooting).
5. **Pass one folder to every `ts-dom` command.** `ts-dom-tags.ts` is written into the folder a command is given, so `ts-dom check web` next to `ts-dom check web/src/nv` leaves a second `ts-dom-tags.ts` in `web/`; delete it and use the same folder everywhere.
6. Not verified: hot updates under a framework plugin (React Fast Refresh, Vue), server-side rendering, Vite library mode, and Vite versions other than 8.3. An app with its own `package.json` in a workspace is covered by `nativele-monorepo`.

## Verify

Run in the project (with `root: "web"`, the folder is `web/src/nv`):

```sh
npm run build                 # expect: ts-dom check: no issues, then ✓ built, and one HTML file per page in the output
npx ts-dom doctor src/nv      # expect: ts-dom doctor: the set-up looks right
```

Then run `npm run dev`, open every page and check that its components render and respond. Edit a template and check that the page reloads once and shows the change.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TS2307: Cannot find module './x.html.js'` from `npm run build` on a clean checkout | the build script starts with `tsc`, before anything generated the files | the build script of step 5; for CI, `nativele-ci` |
| `vite build`: `[UNRESOLVED_IMPORT] Could not resolve './x.html.js'`; `vite dev`: `Failed to resolve import "./x.html.js"` and a 500 for the module | `dirs` is not relative to Vite's `root` (the plugin warned `[dir-not-found]`), or leaves out the folder | give `dirs` relative to `root` (`["src/nv"]` with `root: "web"`) |
| `ts-dom check`: `[dir-not-found] The folder src does not exist` | the commands default to `src` in the folder they run in | pass the folder from there: `ts-dom check web/src/nv` |
| `ts-dom doctor`: `[tsconfig-misses-templates]`; `ts-dom check`: `TS18003: No inputs were found` | `include` is relative to the tsconfig, not to Vite's `root` | `"include": ["web/src"]` (`nativele-typescript`) |
| An edit to a component has no effect until the page is reloaded by hand | a module calls `import.meta.hot.accept()` | remove it |
| A template edit never reaches the page, and the terminal shows `error [rule-id]` | the template breaks a template rule | fix it by the `Fix:` hint; once the template generates again, the page shows it |
| `vite dev`: `(!) Failed to run dependency scan ... failed to resolve rolldownOptions.input value: "web/index.html"` | `vite dev` resolves a relative `input` against `root` | write absolute paths, as in the example |
| Vite warns `ESM syntax in a file loaded as CommonJS (vite.config.ts:1:1)` | `package.json` has no `"type": "module"` | `npm pkg set type=module` |
| `vp build`: `Cannot find package 'vite' imported from .../vitest/dist/config.js` | npm left `vite` nested under `vite-plus` on the first install (seen with npm 11.19, also without Nativele) | run `npm i` once more |

## See also

- The Vite plugin, its options and the dev server: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#with-vite-optional
- The `lint` block of `vite.config.ts` (Vite+) and the ts-dom rules: https://github.com/Pixmi/nativele/blob/main/skills/nativele-linting/SKILL.md
- What `ts-dom check`, `doctor` and `gen` check and write: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#checks
- Writing the components: `npx ts-dom skills nativele-core`
- The tsconfig: https://github.com/Pixmi/nativele/blob/main/skills/nativele-typescript/SKILL.md
- The whitespace mode with a formatter: https://github.com/Pixmi/nativele/blob/main/skills/nativele-formatting/SKILL.md
- CI: https://github.com/Pixmi/nativele/blob/main/skills/nativele-ci/SKILL.md
- An app in a workspace, including one `tsDom()` per package in one Vite config: https://github.com/Pixmi/nativele/blob/main/skills/nativele-monorepo/SKILL.md
