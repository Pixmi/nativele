---
name: nativele-typescript
description: "Check and adjust the TypeScript set-up of a project that uses Nativele (@nativele/ts-dom): what the tsconfig covering the components needs and why, which stricter options and layouts work, how the generated files and ts-dom check fit the type check. Use when a tsconfig is added or changed, when ts-dom doctor reports a tsconfig-* issue, or when tsc errors point at the set-up rather than the code."
metadata:
  tier: official
  nativele: ">=0.5.5 <0.6.0"
  verified: "2026-11-05"
  tools: "typescript@7.0.2 typescript@6.0.3 typescript@5.9.3 vue-tsc@3.3.14 @tsconfig/strictest@2.0.8"
  author: "Nativele maintainers"
  detects: "typescript"
---

# Nativele + TypeScript

## When to use

- The project depends on `@nativele/ts-dom` and `typescript`, and you set up, review or change a `tsconfig*.json`, or `ts-dom doctor` reports `no-tsconfig`, `tsconfig-not-strict`, `tsconfig-no-dom-lib`, `tsconfig-classic-resolution` or `tsconfig-misses-templates`.
- `tsc` or `ts-dom check` fails with errors that come from the set-up (module not found, DOM names missing, a component typed as `HTMLElement`) rather than from a component.
- This Skill owns `tsconfig*.json` as far as Nativele is concerned. It does not write components (`nativele-core`), the build or its scripts (`nativele-vite`, or the framework's Skill), lint configuration (`nativele-linting`), formatter configuration (`nativele-formatting`), CI (`nativele-ci`), or a framework's own type checker (`vue-tsc`, `svelte-check`, `ngc`); it states what those need from TypeScript and leaves the how to them.

Nativele's value is that `tsc` checks the HTML against the TypeScript: `ts-dom gen` writes a typed `x.html.ts` next to each template and a `ts-dom-tags.ts` per scanned folder, and the tsconfig decides whether `tsc` sees them. Nativele needs no special TypeScript option: it needs a few ordinary ones to be in place, and works with the common stricter ones.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.5.5 (the last agent trial) |
| typescript | 7.0.2, 6.0.3, 5.9.3 (every row below); 5.6.3, 5.4.5, 5.0.4 (the baseline set-up only) |
| vue-tsc | 3.3.14 (with typescript 6.0.3 and 7.0.2) |
| @tsconfig/strictest | 2.0.8 |

Verified on 2026-11-05 in fresh projects built from the packed library, with a fixture of components that covers state, props, derive, emits with and without detail, keyed lists of components, plain lists, slots, `shadow: true`, `bind`, `on`, `instantiate()` and the tag map, plus probe files whose `// @ts-expect-error` lines must each stay an error. With a TypeScript major version not listed, treat every statement as unverified.

## Set-up

Check first, then change only what fails. Never replace a tsconfig, reorder it, or change an option this Skill does not name.

1. **Find the config that type-checks the components.** Read `tsconfig.json` in the folder where `ts-dom` runs (the one with `package.json`). If it has `"files": []` and `references` (a solution-style root, as in Vite's templates), the configs that count are the referenced ones; find the one whose `include` covers the Nativele folder (in Vite's templates, `tsconfig.app.json`). Leave the other configs (for `vite.config.ts`, Node scripts, tests in another runtime) as they are.
2. **Read its effective options, not the file.** `npx tsc --showConfig -p <config>` prints the options after every `extends` (a relative path, a package such as `@tsconfig/strictest`, or an array) and the file list. It does not print defaults: an absent `strict` is on in TypeScript 6 and 7 and off in TypeScript 5 (see Known limitations). `npx tsc --listFilesOnly -p <config>` lists every file in the program; after `npx ts-dom gen <dir>`, each `x.html.ts` and the folder's `ts-dom-tags.ts` must be in it.
3. **Run `npx ts-dom doctor <dir>`** (the same folders you pass to `ts-dom check`). Each `tsconfig-*` issue names the file and the fix. Doctor reads `tsconfig.json` and its references only, and checks the referenced configs that cover the template folders; with another layout read Known limitations before acting on its output.
4. **Compare with what Nativele needs**, and change only the rows that fail:

   | Requirement | Why | Without it (exact error) |
   |---|---|---|
   | `lib` includes `DOM` (or `lib` absent: the default includes it) | the library's types and the generated files name DOM types | `node_modules/@nativele/ts-dom/dist/index.d.mts(3,24): error TS2304: Cannot find name 'Element'.` (with `skipLibCheck: true`: `TS2584: Cannot find name 'document'` and `TS2304: Cannot find name 'Event'` in your files); doctor: `tsconfig-no-dom-lib` |
   | A module resolution that finds packages in `node_modules`: `bundler` (with `module` `ESNext` or `Preserve`), `NodeNext`, or `Node16` (`node10` too, on TypeScript 5 only) | the components and the generated files import `@nativele/ts-dom` | with `classic` on TypeScript 5: `TS2792: Cannot find module '@nativele/ts-dom'`, and then every component loses its base class (`TS2339: Property 'refs' does not exist on type 'X'`); TypeScript 6 rejects `classic` and `node10` with `TS5107` (deprecated), TypeScript 7 with `TS5108` (removed) |
   | `include` covers the `.ts` files of every folder with templates | the generated `ts-dom-tags.ts` is imported by nothing, so only `include` brings it in; a component no other file imports is not checked at all | a component typed as plain `HTMLElement` (`TS2339: Property 'todo' does not exist on type 'HTMLElement'`), a keyed list reported as `item-not-in-tag-map`, and contract errors of unimported components (`missing-binding`) not reported; doctor: `tsconfig-misses-templates` |
   | `strict: true` (set explicitly) | null checks and implicit `any` belong to it | see "What `strict` adds" below; doctor: `tsconfig-not-strict` (a warning) |
   | `"type": "module"` in `package.json`, when `module` is `NodeNext` or `Node16` and `tsc` emits the JavaScript | without it the files are CommonJS | `tsc` reports nothing, but emits `Object.defineProperty(exports, "__esModule", ...)`, which a browser cannot run; with `bundler`, or when `tsc` does not emit, it makes no difference to the type check |

   Add a missing `DOM` to the existing `lib` array; add the missing folder to the existing `include` (as `"src/nv"` or a pattern ending in `.ts`, matching the style already there); change `moduleResolution` only when it is `classic`, absent with `module` `ESNext` on TypeScript 5 (that default is `classic`), or `node10`/`node` on TypeScript 6 or 7 (on 5.9.3 it works; leave it unless the user moves to a newer TypeScript).
5. **`strict`.** If it is absent, add `"strict": true`: on TypeScript 6 and 7 that changes nothing but makes it explicit for doctor and for TypeScript 5. If the project sets `"strict": false`, do not turn it on for the whole app on your own: the errors it brings in code outside the Nativele folder are not this task. Turn it on in the config that covers the Nativele folder, or, when that config is the whole app, add a config for the folder and pass it to `ts-dom check --project=`:

   ```json
   // tsconfig.nv.json
   { "extends": "./tsconfig.json", "compilerOptions": { "strict": true }, "include": ["src/nv"] }
   ```

   Tell the user that `ts-dom doctor` keeps warning `tsconfig-not-strict` on `tsconfig.json` in that case.
6. **Keep the user's other options.** The stricter options in the Compatibility table work with the generated files and the library's types; do not remove or relax one to make Nativele pass. The only option that does not work is `isolatedDeclarations` (Known limitations).
7. **State the order to the owner of the scripts.** The generated files are not committed, so every type check (`tsc`, `tsc -b`, `vue-tsc`, `svelte-check`, `ngc`, in a script, a hook or CI) must run after `ts-dom gen <dir>`, or be `ts-dom check <dir>`, which generates first. On a clean checkout a type check that runs first fails with `TS2307: Cannot find module './x.html.js' or its corresponding type declarations`, and doctor reports the script as `typecheck-before-gen`. Do not choose the script here: the build Skill (`nativele-vite`) or the framework's Skill owns it, and the CI steps belong to `nativele-ci`.
8. **Run Verify.**

### What `strict` adds

The template contract does not depend on `strict`: with `"strict": false` on 7.0.2, 6.0.3 and 5.9.3, `tsc` and `ts-dom check` still report `missing-binding`, `missing-handler` (from `define()`), an unknown `this.refs.x`, an unknown `this.show()` name, a child prop of the wrong type through `ts-dom-tags.ts`, a wrong `EmitEvent` detail type, `emit` with a missing, extra or undeclared event, writes to deeply read-only state, and a `data-prop` that is not a prop of the item component. What `strict` adds is everything about `null`, `undefined` and `any`: `'x' is possibly 'null'` (`TS18047`) from `querySelector`, `null` assigned to a prop or passed to `set()`, `hit.key` of an untyped `EventHit` used as a `PropertyKey` although it may be `undefined`, and `Parameter 'e' implicitly has an 'any' type` (`TS7006`). With `"strict": false` plus `"strictNullChecks": true` and `"noImplicitAny": true`, every one of those is reported again, but doctor still warns, because it reads only `strict`.

### Compatibility

Each option set on the config that covers the fixture, on 7.0.2, 6.0.3 and 5.9.3 (`tsc --noEmit`, and `ts-dom check`):

| Option | Result |
|---|---|
| `noUncheckedIndexedAccess` | works |
| `exactOptionalPropertyTypes` | works; `set({ x: undefined })` becomes an error, as for any `Partial` |
| `verbatimModuleSyntax` (with `NodeNext`, and with `bundler`) | works; emitting with `tsc` keeps the generated imports correct |
| `isolatedModules` | works |
| `erasableSyntaxOnly` | works |
| `noImplicitOverride` | works; your own `connected`, `render`, `slotchange` need `override`, as the guides write them |
| `noUnusedLocals`, `noUnusedParameters` | works, including generated files for templates without refs or with several root elements; name unused handler parameters `_e`, `_hit` |
| `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports` | works |
| `allowImportingTsExtensions` | works; still import templates as `./x.html.js` (Known limitations) |
| `skipLibCheck` `true` or `false` | both work; `false` also checks the library's own declarations, which pass |
| all of the above together, and `extends: ["@tsconfig/strictest/tsconfig.json", ...]` | works |
| `declaration` or `composite` (with `emitDeclarationOnly`, `rootDir`, `outDir`) | works; `ts-dom check` on a `composite` config passes too |
| `isolatedDeclarations` | does not work (Known limitations) |
| `moduleResolution` `bundler`, `NodeNext`, `Node16`; `module` `CommonJS` or `Preserve` with the default resolution | works |
| `moduleResolution` `classic` | does not work: see step 4 |
| `moduleResolution` `node10` (or `node`) | works on 5.9.3; rejected by TypeScript 6 (`TS5107`) and 7 (`TS5108`) |
| `lib` / `target` `ES2015` or `ES2017` with `DOM` | works; `target` `ES5` is rejected by TypeScript 7 itself (`TS5108`) |

### How `ts-dom check` and `ts-dom doctor` choose configs

| | `ts-dom check [dirs]` | `ts-dom doctor [dirs]` |
|---|---|---|
| Default | `tsconfig.json` in the working folder; a solution-style one (`"files": []` with `references`) is replaced by each referenced config, and `tsc --noEmit -p <config>` runs once per config | `tsconfig.json` and, when solution-style, its references; the option checks run on the configs whose `include` covers a template folder, or on all of them when none does |
| Another config | `--project=<path>` | none: it always starts from `tsconfig.json` |
| Checker | `vue-tsc` when `package.json` lists it, otherwise `typescript`'s `tsc` | does not type-check |
| No config | `tsc-failed` (an error) | `no-tsconfig` (an error) |

A `ts-dom check` whose config does not cover the Nativele folder still runs and can pass with the components unchecked: on a `tsconfig.json` that includes only Node scripts, it reported only the lint findings, not the `missing-binding` the same run with `--project=` found. Doctor reports that layout as `tsconfig-misses-templates`.

### Framework type checkers

This Skill decides what the tsconfig that covers the Nativele folder needs (the table in step 4); that applies unchanged when the checker is `vue-tsc`, `svelte-check` or `ngc`, which read the same tsconfig. The framework's Skill decides which checker runs, its script, its own config (`vueCompilerOptions`, Svelte or Angular options) and the declarations that type Nativele tags in the framework's templates. What this Skill states to them:

- They need the generated files first, as in step 7.
- They need TypeScript 6 today: `vue-tsc@3.3.14` with `typescript@7.0.2` stops with `Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/tsc' is not defined by "exports"` (and `ts-dom check` reports that as `tsc-failed`); `svelte-check@4.7.8` declares the peer range `typescript@"^5.0.0 || ^6.0.0"` and npm refuses `typescript@7.0.2` with `ERESOLVE`; `@angular/compiler-cli@22.2.4` declares `typescript: '>=6.0 <6.1'`. The requirements in step 4 are the same on 6.0.3.
- `ts-dom check` runs `vue-tsc` itself when `package.json` lists it (verified: it reported a `TS2322` inside an `.vue` file); it does not run `svelte-check` or `ngc`.

## Example

A Vite app with a solution-style root, the Nativele components in `src/nv`, and a strict preset through `extends`. Before:

```json
// tsconfig.json
{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }
```

```json
// tsconfig.app.json
{
  "extends": ["@tsconfig/strictest/tsconfig.json"],
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "verbatimModuleSyntax": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

`tsconfig.node.json` covers only `vite.config.ts` and has `"lib": ["ES2023"]`.

Checking it: the configs that count are the references, and `tsconfig.app.json` is the one whose `include` (`src`) covers `src/nv`. `npx tsc --showConfig -p tsconfig.app.json` shows `"strict": true` (from the preset) and `"moduleResolution": "bundler"`, and no `lib`, so the default for the target applies, which includes DOM. `npx ts-dom doctor src/nv` reports no `tsconfig-*` issue; it does not judge `tsconfig.node.json`, which covers no template folder, so its `"lib": ["ES2023"]` stays. Nothing in the tsconfigs changes. The one requirement left goes to the owner of the build script: `"build": "tsc -b && vite build"` type-checks before anything generates, and doctor reports it as `typecheck-before-gen` (the `.gitignore` lists `*.html.ts`); the Vite Skill or the framework's Skill decides how the script changes.

Verified with that layout: `npx ts-dom check src/nv` prints `ts-dom check: no issues`, `npx tsc -b` exits 0, and `npx tsc --listFilesOnly -p tsconfig.app.json` lists every `x.html.ts` and `src/nv/ts-dom-tags.ts`.

## Known limitations

1. **`strict` absent means different things.** TypeScript 6 and 7 turn `strict` on when the key is absent; TypeScript 5 leaves it off, so the same tsconfig loses the null checks on 5.9.3. `tsc --showConfig` does not show either default, and doctor warns `tsconfig-not-strict` whenever `strict` is not literally `true`. Write `"strict": true`.
2. **Doctor misses a `classic` default.** On TypeScript 5, `"module": "ESNext"` without `moduleResolution` resolves as `classic` (`tsc --showConfig` shows `"moduleResolution": "classic"`), and every import of `@nativele/ts-dom` fails with `TS2792`; doctor only reports `classic` when it is written, and printed `ts-dom doctor: the set-up looks right` for this config. Its message also says `classic` cannot resolve `./x.html.js`; on 5.9.3 that import resolved and the package import failed. Either way the fix is `bundler` or `NodeNext`.
3. **Doctor checks the folder, not the files `include` selects.** An `include` of `"src/nv/**/*.tsx"`, or an `exclude` of `**/ts-dom-tags.ts` (or of `**/*.html.ts` together with it), leaves `ts-dom-tags.ts` out of the program while doctor prints `the set-up looks right`; the symptoms are those of a missing `include` in step 4. Do not exclude the generated files from the config that covers the components, and let `include` select `.ts` files there. Excluding only `**/*.html.ts` is harmless (they are reached through imports) but has no purpose.
4. **Doctor has no `--project`.** It always starts from `tsconfig.json`. When that file is a plain config for something else (Node scripts, say) and another config covers the components, doctor reports `tsconfig-no-dom-lib` and `tsconfig-misses-templates` against `tsconfig.json`, although `ts-dom check --project=<the other config>` is correct. Do not add `DOM` or the component folder to a config that is not for them. Tell the user, and offer the change that makes the layout explicit: a solution-style `tsconfig.json` (`"files": []` with `references` to both configs); with it, doctor, `ts-dom check` without `--project`, and `tsc -b` were all clean on 7.0.2, 6.0.3 and 5.9.3. That renames what `tsc -p tsconfig.json` means, so it is the user's decision.
5. **`isolatedDeclarations` does not work** for the folder with components: every generated file fails with `TS9037: Default exports can't be inferred with --isolatedDeclarations.` and every component with `TS9021: Extends clause can't contain an expression with --isolatedDeclarations.` (`class X extends Component(tpl, ...)`). Keep it off in the config that covers the Nativele folder; a library package that needs it keeps its Nativele components in a package of their own (a workspace of several packages: `nativele-monorepo`).
6. **Template imports stay `./x.html.js`**, also with `allowImportingTsExtensions`. `import tpl from "./x.html.ts"` compiles, but the Nativele tools match `.html.js`: the template is reported as `no-importer`, and a `missing-binding` points at the `.ts` instead of the template line. With `allowImportingTsExtensions`, `tsc` requires `noEmit` or `emitDeclarationOnly`; `ts-dom check` always runs `tsc --noEmit`.
7. **Emitting with `tsc` on TypeScript 6 and 7** needs `rootDir` when `outDir` is set and the sources are in a subfolder: without it, `TS5011: The common source directory of 'tsconfig.json' is './src'. The 'rootDir' setting must be explicitly set`. TypeScript 5.9.3 emitted without it. This concerns projects without a bundler, where `tsc` writes the JavaScript.
8. **A plain `tsc` on a solution-style root checks nothing**: `npx tsc --noEmit` exited 0 with a broken component in `src/nv`; `tsc -b`, `tsc -p tsconfig.app.json` and `ts-dom check` reported it.

## Verify

```sh
npx tsc --showConfig -p <config>        # expect: lib absent or with dom; moduleResolution bundler, nodenext or node16; strict true; the files include src/nv/ts-dom-tags.ts
npx ts-dom doctor src/nv                # expect: no tsconfig-* issue (or only those Known limitations 4 explains)
npx ts-dom check src/nv                 # expect: ts-dom check: no issues
npx tsc -b                              # with a solution-style root (or tsc --noEmit -p <config>); expect: exit code 0
```

Then prove the check reaches the components: add `<p>{{ nope }}</p>` to a template of a component that has `state`, run `npx ts-dom check src/nv`, and expect `error [missing-binding] "nope" is used by {{ nope }} ...` at the template's line. If `strict` is on, also expect `const el = document.querySelector("x-y"); el.remove();` in a component file to give `TS18047: 'el' is possibly 'null'`. Remove both afterwards.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TS2307: Cannot find module './x.html.js' or its corresponding type declarations` | the generated files do not exist yet (clean checkout) | run `ts-dom gen <dir>` before the type check, or `ts-dom check <dir>` (step 7) |
| `TS2792: Cannot find module '@nativele/ts-dom'. Did you mean to set the 'moduleResolution' option to 'nodenext'` | `classic` resolution, written or the TypeScript 5 default for `module` `ESNext` | `"moduleResolution": "bundler"` (or `NodeNext`) |
| `TS5107: Option 'moduleResolution=node10' is deprecated` / `TS5108: ... has been removed` | TypeScript 6 / 7 with `node10` (or `node`) or `classic` | `bundler` or `NodeNext`; not `ignoreDeprecations` |
| `TS2304: Cannot find name 'Element'` in `node_modules/@nativele/ts-dom/dist/index.d.mts` | `lib` without `DOM` | add `"DOM"` to `lib` |
| `TS2339: Property '<prop>' does not exist on type 'HTMLElement'` on `document.createElement("x-y")`, or `item-not-in-tag-map` although `ts-dom gen` ran | `ts-dom-tags.ts` is not in the program: `include` misses the folder, selects only `.tsx`, or `exclude` drops it | fix `include`/`exclude`; confirm with `tsc --listFilesOnly -p <config>` |
| `ts-dom check: no issues` although a template is wrong | the config `ts-dom check` used does not cover the folder | `ts-dom doctor <dir>`; pass `--project=` or fix `include` |
| `TS2344: Type 'HTMLElementTagNameMap[K]' does not satisfy the constraint 'Element'` in `lib.dom.d.ts` | a follow-up of a component class broken by a contract error (`missing-binding`, ...) | fix the contract error that `ts-dom check` reports first |
| `tsc-failed`: `vue-tsc did not check the types: ... ERR_PACKAGE_PATH_NOT_EXPORTED ... './lib/tsc'` | `vue-tsc` with TypeScript 7 | TypeScript 6 in a Vue project; see the Vue Skill |
| `TS9037` / `TS9021` with `isolatedDeclarations` | Known limitations 5 | turn it off for the Nativele folder's config |
| `tsconfig-not-strict` although TypeScript 7 is strict by default | doctor reads only an explicit `"strict": true` | write `"strict": true` |

## See also

- Setup with TypeScript only, and the no-bundler tsconfig: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#installation-and-setup
- What each tool checks, `ts-dom check`, `ts-dom doctor` and which command writes files: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#checks
- The generated `x.html.ts` and why it is not committed: https://github.com/Pixmi/nativele/blob/main/docs/templates.md#how-types-are-generated
- `ts-dom-tags.ts` and element types across components: https://github.com/Pixmi/nativele/blob/main/docs/components.md#composition-using-multiple-components-together
- Several packages in a workspace, each with its own tsconfig: https://github.com/Pixmi/nativele/blob/main/skills/nativele-monorepo/SKILL.md
- How Skills share a project, and who owns which configuration: https://github.com/Pixmi/nativele/blob/main/skills/README.md#how-skills-work-together
