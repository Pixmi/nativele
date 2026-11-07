---
name: nativele-linting
description: "Bring the Nativele (@nativele/ts-dom) template lint rules into a project's existing linter (oxlint, Vite+ vp lint, or ESLint flat config) without replacing it: which rules exist and where they run (ts-dom lint, ts-dom check, the ts-dom JS plugin), choosing groups, single rule ids, severities and ignore lists, and keeping generated files and test folders out. Use when a project with @nativele/ts-dom has oxlint or eslint, when ts-dom doctor reports oxlint-plugin-missing, or when a ts-dom lint finding needs a decision."
metadata:
  tier: official
  nativele: ">=0.6.0 <0.7.0"
  verified: "2026-11-06"
  tools: "oxlint@1.91.0 vite-plus@1.5.0 eslint@10.14.0 eslint@9.39.4 typescript-eslint@8.72.1 typescript@7.0.2 typescript@6.0.3"
  author: "Nativele maintainers"
  detects: "oxlint eslint"
---

# Nativele linting

## When to use

- The project depends on `@nativele/ts-dom` and lints with oxlint (`.oxlintrc.json`), Vite+ (`vp lint`, a `lint` block in `vite.config.ts`) or ESLint (`eslint.config.*`), and the Nativele rules should run in that linter, in the editor and in the project's lint command.
- `ts-dom doctor` reports `oxlint-plugin-missing`, or a lint finding (`unused-ref`, `img-alt`, `unknown-prop`, ...) needs a decision: fix it, give the rule another severity, or ignore an id.
- Generated files (`*.html.ts`, `ts-dom-tags.ts`) show up in the linter's output, or a template used only by tests is reported.
- This Skill owns the lint configuration as far as Nativele is concerned: `.oxlintrc.json`, the `lint` block of `vite.config.ts`, and `eslint.config.*`. It does not own the rest of `vite.config.ts` (the build: `nativele-vite`), `tsconfig*.json` (`nativele-typescript`), formatting (`nativele-formatting`), the components themselves (`nativele-core`), tests (`nativele-testing`) or CI (`nativele-ci`). It keeps the project's linter, plugins and rules; it never replaces a linter, adds a second one, or rewrites a config.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.6.0 (the last agent trial) |
| oxlint | 1.91.0 (`.oxlintrc.json`) |
| vite-plus | 1.5.0 (`vp lint`, which runs oxlint 1.91.0, with the `lint` block in `vite.config.ts`) |
| eslint | 10.14.0 and 9.39.4 (flat config `eslint.config.js`) |
| typescript-eslint | 8.72.1 (the parser for `.ts` files in ESLint; it requires `typescript` below 6.1, so the ESLint projects used 6.0.3) |
| typescript | 7.0.2 (oxlint and Vite+ projects), 6.0.3 (ESLint projects) |

Verified on 2026-11-06 in fresh projects built from the packed library, with a fixture that has an unused `data-ref`, a template no file imports, an `<img>` without `alt`, a misspelled child prop, a missing handler and a test-only component. With a different major version of oxlint or ESLint, or a legacy `.eslintrc*` config, treat every step as unverified.

## Set-up

Check first, then change only what the task needs. Keep the user's plugins, rules, categories, ignore patterns, key order and formatting.

1. **Find the linter the project actually uses.** Look for `.oxlintrc.json` (or `.oxlintrc.jsonc`), a `lint:` block in `vite.config.ts` (Vite+), `eslint.config.js`/`.mjs`/`.ts`, and the `lint` script in `package.json`. Use the one the `lint` script runs. If there is none, do not add a linter: `ts-dom check` (which `nativele-core` already runs) and `ts-dom lint` give the same findings without one. Other linters were not tried; for them, run `npx ts-dom lint <dir>` as its own step and leave their config alone.
2. **See what is reported today.** Run `npx ts-dom lint <dir> --a11y` with the folders the project passes to `ts-dom check`, and the project's own lint command. The first shows every Nativele finding; the second shows what the linter already reports, so a new finding after the change can be told apart from an old one. Run `npx ts-dom doctor <dir>`: `oxlint-plugin-missing` names the config file that lacks the plugin.
3. **Load the plugin in that config, next to what is there.**
   - oxlint (`.oxlintrc.json`) and Vite+ (`lint` in `vite.config.ts`, same keys): add `{ "name": "ts-dom", "specifier": "@nativele/ts-dom/oxlint" }` to `jsPlugins` (create the array if missing; keep other entries). The plain string `"@nativele/ts-dom/oxlint"` also works. Do not touch `plugins` (the built-in ones) or `categories`.
   - ESLint (flat config): `import tsDom from "@nativele/ts-dom/oxlint"` and add a config object `{ plugins: { "ts-dom": tsDom }, rules: { ... } }` to the exported array. The same module is a valid ESLint plugin. It needs the TypeScript parser the project already uses for `.ts` files (verified with `typescript-eslint`).
   - Loading the plugin enables nothing: with `jsPlugins` set and no `ts-dom/*` rule, nothing is reported and doctor is satisfied. Step 4 decides the rules.
4. **Choose rules and severities** (see "Rules, groups and severities" below). The baseline is `"ts-dom/unused-markup": "error"`. Add `"ts-dom/data-flow"` and `"ts-dom/a11y"` as `"warn"` when the user wants them; ask before turning on a11y in an existing project with many templates, and show the count from step 2.
5. **Keep generated files out of the linter.** The rules run on the component files, never on `*.html.ts` or `ts-dom-tags.ts`, but the project's own rules do. oxlint and `vp lint` skip what `.gitignore` lists, so when `.gitignore` has `*.html.ts` and `ts-dom-tags.ts` (as the setup guide recommends), nothing is needed. Otherwise, and always with ESLint (it does not read `.gitignore`), add `**/*.html.ts` and `**/ts-dom-tags.ts` to the existing ignore list: `ignorePatterns` for oxlint and Vite+, `globalIgnores([...])` from `eslint/config` for ESLint. Never fix a finding inside a generated file: it is rewritten on the next `ts-dom gen`.
6. **Test folders.** Access from a test never counts as use (Known limitations 3), and the rules only report a template in the file of the class that uses it. Turn `ts-dom/unused-markup` off only for files that declare such a class themselves (a test-only host component): an `overrides` entry `{ "files": ["test/**"], "rules": { "ts-dom/unused-markup": "off" } }` in oxlint, or `{ files: ["test/**"], rules: { "ts-dom/unused-markup": "off" } }` in ESLint, with the project's own test globs. Do not lower `unused-ref` for component files to make room for tests; a ref that only a test reads is removed and the test queries the DOM (the testing Skill owns how).
7. **State what other areas need, and leave the how to them.** The lint script belongs to the build owner and the CI steps to `nativele-ci`: the project's lint command covers the Nativele rules, except `no-importer` (Known limitations 1), which `ts-dom check` reports. The type check order (generated files before `tsc`) is a requirement `nativele-typescript` states; the script that runs it belongs to the build owner. Formatting templates, and keeping the formatter off the generated files, belongs to `nativele-formatting`.
8. **Run Verify.**

### What runs where

| | `ts-dom lint [dirs]` | `ts-dom check [dirs]` | The `ts-dom` JS plugin in oxlint, `vp lint` or ESLint |
|---|---|---|---|
| unused-markup (errors) | all 7 ids, including `no-importer` | all 7 ids, including `no-importer` | 6 ids; `no-importer` does not exist here |
| data-flow (warnings) | always | always | when `ts-dom/data-flow` or a single id is on |
| a11y (warnings) | with `--a11y` | with `--a11y` | when `ts-dom/a11y` or a single id is on |
| Also runs | nothing else; needs no generated files and writes nothing | codegen (writes the generated files unless `--no-write`) and `tsc` | the project's other rules |
| Severity and ignore | fixed: unused-markup is an error, the rest warnings; no per-id switch (filter `--json` if needed) | the same | per rule in the config, `ignore` on the three groups |
| Where a finding points | `src/nv/card.html:3:3 error [unused-ref] ...` | the same | the template's `import` line in the `.ts` file, with the HTML location first: `src/nv/card.ts:2:1: error ts-dom(unused-markup): ./card.html.js:3:3 [unused-ref] ...` |
| Exit code | 1 on an error (also with `--json`); 1 on a warning too with `--strict`; 0 otherwise | the same | the linter's own (oxlint and ESLint: 1 on an error, 0 on warnings only) |
| `--json` | `{ "issues": [{ file, rule, severity, message, line, col }] }`; data-flow child issues add `tag`, `attrs`, `events` | `{ "issues": [...] }` | the linter's own format |

`ts-dom lint` and `ts-dom check` scan only the folders passed to them, and `--include`/`--exclude` do not filter their lint findings. Neither reads the linter's config, so a severity or ignore chosen there does not change them (Known limitations 2).

### Rules, groups and severities

- Three groups: `ts-dom/unused-markup`, `ts-dom/data-flow`, `ts-dom/a11y`. A group reports all of its ids; `["warn", { "ignore": ["img-alt"] }]` drops ids from it. `npx ts-dom rules` lists every id by group, and `npx ts-dom rules --explain=<id>` says why it exists.
- Every id is also a rule of its own (`ts-dom/unused-ref`, `ts-dom/img-alt`, `ts-dom/unknown-prop`, ...), for a severity per id. A single-id rule takes no options.
- To give one id another severity, ignore it in its group and enable it alone: `"ts-dom/unused-markup": ["error", { "ignore": ["unused-ref"] }], "ts-dom/unused-ref": "warn"`. A group and one of its ids both on report the finding twice.
- Choose by what each id costs when it is missed: unused-markup ids are dead or broken markup (blank text, an empty list) and stay errors. data-flow ids are design advice plus child contract checks (`unknown-prop`, `invalid-prop-value`, `unknown-event`), warnings by default; raise the contract ids to `"error"` singly if the user wants. a11y ids are static hints, warnings, and `ignore` takes the ids that do not apply (for example `aria-idref` when labels point outside the template).
- An `ignore` id that does not exist is silently accepted: check every id against `npx ts-dom rules` before writing it.

## Example

An oxlint project, before:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn"],
  "rules": {
    "no-console": "warn",
    "eqeqeq": "error"
  }
}
```

`.gitignore` already lists `node_modules`, `*.html.ts` and `ts-dom-tags.ts`; tests in `test/` include a host component that imports its own template. After (only `jsPlugins`, three rules and `overrides` added):

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn"],
  "jsPlugins": [{ "name": "ts-dom", "specifier": "@nativele/ts-dom/oxlint" }],
  "rules": {
    "no-console": "warn",
    "eqeqeq": "error",
    "ts-dom/unused-markup": "error",
    "ts-dom/a11y": ["warn", { "ignore": [] }],
    "ts-dom/data-flow": ["warn", { "ignore": [] }]
  },
  "overrides": [{ "files": ["test/**"], "rules": { "ts-dom/unused-markup": "off" } }]
}
```

With Vite+, the same keys go into the existing `lint` block of `vite.config.ts` (`jsPlugins`, the `ts-dom/*` rules, and `ignorePatterns: ["**/*.html.ts", "**/ts-dom-tags.ts"]` only if `.gitignore` does not list them); the `plugins: [tsDom()]` entry and the rest of the file belong to the build.

An ESLint project (flat config), after; the lines added are the `globalIgnores`, the `tsDom` import and the last two objects:

```js
import { globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import tsDom from "@nativele/ts-dom/oxlint";

export default tseslint.config(
  globalIgnores(["**/*.html.ts", "**/ts-dom-tags.ts"]),
  tseslint.configs.recommended,
  {
    plugins: { "ts-dom": tsDom },
    rules: { "ts-dom/unused-markup": "error", "ts-dom/data-flow": "warn" },
  },
  { files: ["test/**"], rules: { "ts-dom/unused-markup": "off" } },
);
```

Without `globalIgnores`, `tseslint.configs.recommended` reports `@typescript-eslint/no-empty-object-type` errors in the generated `*.html.ts` files.

## Known limitations

1. **`no-importer` runs only in `ts-dom lint` and `ts-dom check`.** The plugin checks a template from the file of the class that uses it, so a template that no class uses is invisible to it, and `"ts-dom/no-importer"` fails with `Rule 'no-importer' not found in plugin 'ts-dom'`. Keep `ts-dom check` (or `ts-dom lint`) in the project's checks; a lint command alone does not cover it.
2. **The CLI ignores the linter's choices.** `ts-dom lint` and `ts-dom check` always report unused-markup as errors and have no ignore option: an id set to `"warn"` or ignored in the linter still fails `ts-dom check`. Fix the finding rather than relax the linter when the project runs both; relax only what the user accepts in both places (or filter `--json` in the user's own script).
3. **Use from outside the class does not count.** `unused-markup` compares a template with the body of `class X extends Component(tpl)`; `el.refs.x` in a test, in another component or in a script outside the class is not use, in any of the three tools. Turning the rule off for test folders silences only templates those test files import.
4. **Child contracts are read from the working directory.** `unknown-prop`, `invalid-prop-value` and `unknown-event` need the child component's `define()`; the plugin scans for them from the folder the linter runs in. Run from a folder that does not contain the child (oxlint started in `test/` on `src`), the `unknown-prop` finding disappeared without a message. Run the linter from the project folder.
5. **Disable comments hide the whole template.** Every finding is reported on the `import` line, so `// oxlint-disable-next-line ts-dom/unused-markup` (or `eslint-disable`) above it silences every unused-markup finding of that template, while `ts-dom check` keeps reporting them. Do not use disable comments for template findings; fix the template or use `ignore` for an a11y or data-flow id the user accepts.
6. **Doctor reads only `.oxlintrc.json`, `.oxlintrc.jsonc`, `oxlintrc.json`, `oxlint.config.ts`, `oxlint.config.mts` and the `lint` block of `vite.config.*`.** It does not look at ESLint configs at all. Doctor also counts the plugin as configured when `jsPlugins` names it, even with no `ts-dom/*` rule on. Check the config yourself, and confirm with a finding (Verify).
7. **No fixes, and no missing handlers.** The plugin offers no fixes or suggestions: an unused `data-ref` or a11y finding is fixed by editing the `.html`. A `data-on-*` method the class does not define is not a lint finding at all: tsc reports it at the `define()` call, and `ts-dom check` points it at the template as `missing-handler`, so keep `ts-dom check` (or `tsc`) in the project's checks.
8. **Not verified:** the editor integration (the Oxc and ESLint VS Code extensions), whether the plugin picks up a child's new prop in a long-running editor session without a restart, legacy `.eslintrc*`, oxlint's JavaScript or TypeScript config files, and linters other than oxlint and ESLint.

## Verify

```sh
npx ts-dom lint src/nv --a11y      # expect: ts-dom lint: no issues (or only findings the user accepted)
npx oxlint                         # or: npx vp lint / npx eslint . ; expect: exit code 0 and no ts-dom(...) or generated-file findings
npx ts-dom doctor src/nv           # expect: no oxlint-plugin-missing
npx ts-dom check src/nv            # expect: ts-dom check: no issues
```

Then prove the linter runs the rules: add `<span data-ref="probe"></span>` to a template, run the project's lint command, and expect `error ts-dom(unused-markup): ./<name>.html.js:<line>:<col> [unused-ref] data-ref="probe" is never used by the component class.` on the template's import line (when the class gets its template through a barrel, the location is the template's path from the `.ts` file instead, such as `../templates/card.html:5:1`; ESLint prints the same message under the `.ts` file); exit code 1. Remove it afterwards. If a11y or data-flow is on, an `<img>` without `alt` gives `[img-alt]`, and a misspelled attribute on a child tag gives `[unknown-prop]`, both as warnings.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `x Plugin 'ts-dom' not found` | a `ts-dom/*` rule without the `jsPlugins` entry | add `{ "name": "ts-dom", "specifier": "@nativele/ts-dom/oxlint" }` to `jsPlugins` |
| `x Failed to load JS plugin: @nativele/ts-dom/oxlint-plugin` ... `is not exported` | a wrong specifier | `@nativele/ts-dom/oxlint` |
| `x Rule 'no-importer' not found in plugin 'ts-dom'` | `no-importer` has no rule in the plugin | remove it; `ts-dom check` reports it (Known limitations 1) |
| `Error: Rule 'ts-dom/unused-ref' does not accept options` | `ignore` on a single-id rule | `ignore` only on the three groups |
| `Unexpected property "ignor". Expected properties: "ignore".` | a misspelled option key | `ignore` |
| An ignored id is still reported | the id is misspelled (accepted silently), or it is ignored in the group but also enabled alone | check the id with `npx ts-dom rules`; one place per id |
| Every finding appears twice, once as `ts-dom(unused-markup)` and once as `ts-dom(unused-ref)` | the group and a single id are both on | ignore the id in the group, or drop one of them |
| The linter is clean but `ts-dom check` fails with `[unused-ref]` or `[no-importer]` | Known limitations 1 and 2 | fix the template; the CLI does not read the linter's config |
| `@typescript-eslint/no-empty-object-type`, `sort-keys`, `import(newline-after-import)` or similar in `*.html.ts` | the project's own rules run on generated files | ignore `**/*.html.ts` and `**/ts-dom-tags.ts` in the linter (step 5); never edit the generated files |
| oxlint reports thousands of findings in `node_modules` | the project has no `.gitignore` listing `node_modules` (oxlint linted `node_modules` then, and stopped once `.gitignore` listed it) | add `node_modules` to `.gitignore` or `ignorePatterns`, as the user prefers |
| `[unused-ref]` for a ref a test reads | test access is not use (Known limitations 3) | remove the ref and query the DOM in the test |
| `[unknown-prop]` missing for a child tag | the linter ran from a folder without the child's `define()` (Known limitations 4) | run it from the project folder |

## See also

- Lint settings, the oxlint plugin, the editor and the `ts-dom lint` flags: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#lint-optional
- What each tool checks, `ts-dom check` and `ts-dom doctor`: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#checks
- The a11y ids and what each checks: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#aria--accessibility-checks
- The data-flow rules and what to do instead of passing through layers: https://github.com/Pixmi/nativele/blob/main/docs/components.md#avoiding-layer-by-layer-passing-lint-ts-domdata-flow
- How Skills share a project, and who owns which configuration: https://github.com/Pixmi/nativele/blob/main/skills/README.md#how-skills-work-together
