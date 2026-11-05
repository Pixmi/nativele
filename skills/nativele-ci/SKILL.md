---
name: nativele-ci
description: "Make a project's existing CI check the Nativele parts reliably (@nativele/ts-dom): generate before any type check, which ts-dom commands and flags give a trustworthy pass or fail, machine-readable output, committed or git-ignored generated files, keeping a check-only job from writing, caching, and what real-browser tests need. Use when CI is added or changed in a project that depends on @nativele/ts-dom, or when CI fails with TS2307 on ./x.html.js or passes although the templates are wrong."
metadata:
  tier: official
  nativele: ">=0.5.5 <0.6.0"
  verified: "2026-11-05"
  tools: "typescript@7.0.2 npm@11.19.1 pnpm@12.16.1"
  author: "Nativele maintainers"
  detects: "typescript"
---

# Nativele in CI

## When to use

- The project depends on `@nativele/ts-dom` and you add, review or change its CI (any provider: GitHub Actions, GitLab CI, Jenkins, a shell script on a build machine), or a pre-merge hook that runs the same checks.
- CI fails on a clean checkout with `TS2307: Cannot find module './x.html.js'`, fails with `stale-generated`, or passes although a template is wrong.
- This Skill owns the Nativele steps inside the project's CI: which `ts-dom` commands run, with which flags, in which order relative to the other steps, and how their result is read. It keeps the CI provider, the job layout, the install step and the package manager as they are. It does not own the test framework and its browser set-up (`nativele-testing`), the build and its scripts (`nativele-vite`, or the framework's Skill), the tsconfig (`nativele-typescript`), lint configuration (`nativele-linting`) or formatter configuration and the whitespace mode (`nativele-formatting`); it states what CI needs from them.

`detects` is `typescript`: no package in `package.json` shows that a project has CI. What this Skill keeps reliable is the type check of the templates, which needs `typescript` installed (without it `ts-dom check` fails with `tsc-not-found`, Known limitations 2), so `ts-dom doctor` offers it to the Nativele projects that type-check.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.5.5 (the last agent trial) |
| typescript | 7.0.2 |
| Node.js | 24.22.2 |
| npm | 11.19.1 (`npm ci`) |
| pnpm | 12.16.1 (`pnpm install`, `pnpm exec ts-dom`) |
| Google Chrome | 148.0.7778.178 (headless; only the `moveBefore` check) |

Verified on 2026-11-05 on Linux with fresh `git clone`s of a project built from the packed library (generated files git-ignored, and a variant with them committed), running every command below with `CI=true`, no terminal (`setsid -w`, stdin from `/dev/null`), and with deliberate errors. No CI provider was run: the steps are shell commands, which every provider runs as they are. With another major version of `@nativele/ts-dom`, treat every exit code below as unverified.

## Set-up

Check first, then change only the Nativele steps. Never replace the CI provider, merge or split jobs, change the install command beyond what step 4 names, or rewrite steps that are not about Nativele.

1. **Read the CI that exists.** Find its configuration (`.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `azure-pipelines.yml`, `.circleci/config.yml`, a script the build machine calls) and list, per job, the steps in order: checkout, install, and every step that type-checks, builds or tests, including the ones hidden in a `package.json` script (`npm run build` that starts with `tsc -b`). Note the package manager from the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`) and run `ts-dom` through it (`npx ts-dom`, `pnpm exec ts-dom`, or the project's own script); both `npx` and `pnpm exec` gave the same output and exit codes.
2. **Find out whether the generated files are committed.** `git ls-files | grep -E '(\.html\.ts|ts-dom-tags\.ts)$'` prints nothing (and exits 1) when they are not, which is the usual set-up with `*.html.ts` and `ts-dom-tags.ts` in `.gitignore`. The answer decides between step 5 and step 6. Do not change whether they are committed: that is the project's choice.
3. **Find the folders and flags the project generates with**: the folders passed to `ts-dom gen`/`check` in its scripts, the `dirs` of `tsDom()` in the Vite config, and `--whitespace=`, `--include=`, `--exclude=`. CI passes exactly the same. On a clean checkout a `ts-dom check` without `--whitespace` writes the files with whitespace kept as written; when the project generates with `--whitespace=collapse`, CI then checks different generated files than the developers have (`ts-dom gen --check --whitespace=collapse` reported them as `outdated`). Calling the project's own script (`npm run check`, say) keeps them in step. CI passes the mode the project uses; which mode that is belongs to `nativele-formatting`.
4. **Check that the CI install includes dev dependencies**, or at least `typescript` (and `vue-tsc` in a Vue project). With dev dependencies left out (`npm ci --omit=dev`), `ts-dom check` reports `error [tsc-not-found]` and exits 1, so the job fails instead of passing with the types unchecked (Known limitations 2).
5. **Generated files not committed (the usual case).** Generate before anything type-checks. Put `ts-dom check <dirs>` (with the flags from step 3) after the install and before every step that type-checks, builds or tests, or make sure the step that comes first generates (a script that starts with `ts-dom gen <dirs> &&` or `ts-dom check <dirs> &&`). A type check that runs first fails on the clean checkout CI starts from: `npm run build` with `"build": "tsc"` exited 2 with `TS2307: Cannot find module './user-card.html.js'`. When the step that type-checks first is a `package.json` script, `ts-dom doctor` reports it as `typecheck-before-gen` (a warning); state the order to the owner of that script (the build Skill or the framework's Skill) instead of rewriting it here. When the step is written directly in the CI configuration (`npx tsc --noEmit`), doctor does not see it: it reads `package.json` scripts only, and printed `the set-up looks right` next to a workflow file and a `.gitlab-ci.yml` that ran `tsc` first. Move or precede that step yourself; it is a Nativele step in the CI. `ts-dom check` runs the same `tsc` over the project after generating, so a separate `tsc --noEmit` step that only repeats it can go; keep it when it checks another tsconfig (`-p`) or extra flags. In a workspace, each package runs its own `ts-dom check` on its own folder, and a component package generates or builds before the apps that use it (`nativele-monorepo`).
   Do not use `ts-dom check --no-write` here: with nothing generated it reports every generated file as `stale-generated` (missing) plus the `TS2307` errors, and exits 1. Writing git-ignored files does not change what git tracks: after `ts-dom check`, `git status --porcelain` was empty.
6. **Generated files committed.** CI must find out whether they are current, not refresh them: run `ts-dom gen --check <dirs>` (only the generated files: missing, outdated, orphaned) and `ts-dom check --no-write <dirs>` (the template diagnostics, `tsc` and lint on the files as committed, plus the same staleness as errors). A plain `ts-dom check` here passes on a template edited without regenerating, because it regenerates first: it printed `ts-dom check: no issues`, exit 0, and left `src/user-card.html.ts` modified.
7. **Decide what fails the job**, and say it to the user rather than choosing silently:
   - `ts-dom check` exits 1 on any error; warnings (lint `data-flow`, `--a11y`) leave it at 0, and `--strict` makes them fail too. `tsc-not-found` is an error.
   - `ts-dom doctor` exits 1 only on an error (verified: `no-tsconfig`, `tsconfig-no-dom-lib`, `dir-not-found`); warnings (verified: `typecheck-before-gen`, `stale-generated`) and `info` lines (`skill-available`, `skill-outdated`) never fail it unless `--strict` is passed, which makes a warning exit 1 too. Run it after the step that generates: before it, every generated file is a `stale-generated` (missing) warning. To fail on doctor warnings, use `--strict` or read its `--json` (see Example).
   - A folder that does not exist is an error for `check` and `doctor` (`dir-not-found`), so a wrong path in CI fails instead of checking nothing.
8. **Machine-readable output.** `--json` on `check`, `doctor`, `lint` and `gen --check` prints one JSON document on stdout and nothing on stderr, with the same exit code as the text form: `{ "issues": [{ file, line, col, rule, severity, message }] }` (`doctor` issues may lack `file` and `line`), and `{ "stale": [{ file, reason }], "errors": [...] }` for `gen --check`. In text form, errors and warnings go to stderr as `file:line:col severity [rule-id] message Fix: ...`, and the success line (`ts-dom check: no issues`, `ts-dom gen --check: generated files are up to date`, `ts-dom doctor: the set-up looks right`) and doctor's `info` lines to stdout. No command prints color codes, prompts or reads stdin. `ts-dom gen` prints nothing when it succeeds.
9. **Caching.** Leave dependency caching as the project has it. Do not cache the generated files: `ts-dom check` rewrites outdated ones and deletes orphaned ones anyway, and with `--no-write` or `gen --check` a restored copy is what gets judged instead of the checkout. `ts-dom` keeps no cache of its own: after `ts-dom check` no file outside the generated ones was new or changed, and there was no `node_modules/.cache`.
10. **Real-browser tests.** CI needs a Chromium-based browser on the runner when the project has real-browser tests: Nativele moves kept list items with `moveBefore` where the browser has it, which a DOM shim does not have (the architecture guide's Testing lists what needs a real browser). Headless Chrome 148 has `Element.prototype.moveBefore` (it printed `function`). How the tests find and start the browser (`CHROME_BIN`, launch arguments, the test projects) belongs to the testing Skill (`nativele-testing`); this Skill only requires that the browser exists on the runner and that the generated files exist before the tests start (the Vite plugin writes them when Vitest starts with it; otherwise step 5).
11. **Run Verify** on a fresh clone, not in your working copy, where the generated files already exist.

## Example

The shell steps for one job, after the provider's checkout; put each command where the project's CI already runs its shell commands. Keep the project's own install command and its other steps; this shows only where the Nativele steps go. `src` stands for the project's folders and flags from Set-up step 3.

Generated files git-ignored:

```sh
set -e
npm ci                                   # the project's install, with dev dependencies
npx ts-dom check src                     # generates, then template diagnostics, tsc and lint; exit 1 on an error
npx ts-dom doctor src                    # the set-up; exit 1 only on an error
# ...the project's own build and test steps, unchanged
test -z "$(git status --porcelain)"      # optional: nothing tracked changed
```

Generated files committed:

```sh
set -e
npm ci
npx ts-dom gen --check src               # the committed generated files are current; writes nothing
npx ts-dom check --no-write src          # template diagnostics, tsc and lint on the committed files; writes nothing
npx ts-dom doctor src
# ...the project's own build and test steps, unchanged
```

Failing on doctor warnings too (optional, the project's choice), from its JSON:

```sh
npx ts-dom doctor src --json | node -e 'const { issues } = JSON.parse(require("fs").readFileSync(0, "utf8")); const bad = issues.filter((i) => i.severity !== "info"); for (const i of bad) console.error(i.severity, i.rule, i.message); process.exit(bad.length ? 1 : 0)'
```

What these gave on fresh clones of the test project:

| Case | Steps | Result |
|---|---|---|
| clean, git-ignored | first block | exit 0; `ts-dom check: no issues`; doctor printed the `typecheck-before-gen` warning of the project's `"build": "tsc"` and exited 0 |
| `{{ nope }}` committed in a template, git-ignored | first block | exit 1 at `ts-dom check`: `src/user-card.html:1:20 error [missing-binding] "nope" is used by {{ nope }} ...` |
| clean, committed | second block | exit 0; `generated files are up to date`, `no issues`, `the set-up looks right` |
| template changed and committed without regenerating, committed | second block | exit 1 at `gen --check`: `src/user-card.html.ts:1:1 error [stale-generated] The generated file is outdated. Fix: run ts-dom gen.` |
| the same, with the first block | first block | `ts-dom check` exit 0, then `test -z` failed on ` M src/user-card.html.ts` |

## Known limitations

1. **`ts-dom check --no-write` needs the generated files to exist.** It is for projects that commit them. With git-ignored files on a clean checkout it always fails (`stale-generated` for each file, `TS2307`), so use `ts-dom check`; the files it writes are ignored by git.
2. **Warnings never fail `check` without `--strict`.** Without `typescript` installed, `ts-dom check` reports `.:1:1 error [tsc-not-found]` and exits 1, because nothing was type-checked. Install dev dependencies in CI; `check --strict` also fails on lint warnings.
3. **A writing `ts-dom check` hides stale committed files.** It refreshes them and passes. In a project that commits them, run `gen --check` or `check --no-write`, or follow `check` with a `git status --porcelain` test.
4. **`ts-dom gen --check` checks only the generated files.** With a template that names nothing in its component, it printed `generated files are up to date` and exited 0; `ts-dom check` is what finds that. It does report codegen errors (`forbidden-tag` for a `<script>` in a template, exit 1).
5. **`ts-dom doctor` does not read CI configuration:** warnings and `info` exit 0 unless `--strict` is passed (warnings then exit 1), and a `tsc` step written into the CI file before generation is not reported. Use its `--json` (Example) and Set-up step 5.
6. **`ts-dom gen --watch` never exits** (it printed `[ts-dom] watching src` and ran until killed). Never use it, or a script that starts it, in CI.
7. **The whitespace mode comes from the files or the flag.** On a clean checkout, generation without `--whitespace` writes `preserve`; pass the project's flag in CI (Set-up step 3); the mode itself is chosen by `nativele-formatting`.
8. **`ts-dom check` type-checks what the tsconfig covers, not only the folders it is given**: `ts-dom check web` (a folder that does not exist) still reported a type error from `src`. The folders decide what is generated and linted; which config `tsc` reads belongs to the TypeScript Skill.

## Verify

On a fresh clone of the project (`git clone <repo> /tmp/ci-try && cd /tmp/ci-try`), with the project's install, run the CI's Nativele steps exactly as the CI configuration has them, without a terminal:

```sh
CI=true setsid -w sh -c '<the steps>' </dev/null; echo "exit=$?"   # expect: exit=0
npx ts-dom check <dirs>                 # git-ignored: expect "ts-dom check: no issues"
npx ts-dom gen --check <dirs>           # committed: expect "ts-dom gen --check: generated files are up to date"
npx ts-dom doctor <dirs>                # expect: no error lines; "the set-up looks right" when there is no warning either
git status --porcelain                  # expect: empty
```

Then prove the job fails when it should, and undo each change afterwards:

- Add `<p>{{ nope }}</p>` to a template of a component, commit it on a throwaway branch, run the steps on a fresh clone: expect exit 1 and `error [missing-binding] "nope" is used by {{ nope }}` at the template line. Code that uses the broken component may report its own `[tsc]` errors next to it (for example a `TS2345` where the element is appended); their messages say they follow from the contract error, and they go away with the template fix.
- Committed files only: change a template's text without running `ts-dom gen`, commit, run the steps: expect exit 1 and `error [stale-generated] The generated file is outdated.`
- Run the steps with the dev dependencies left out: expect `check` to exit 1 with `error [tsc-not-found]`; that is Known limitations 2, and the CI install must not do it.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TS2307: Cannot find module './x.html.js' or its corresponding type declarations` in CI only | a type check, build or test step runs before anything generates; locally the files already exist | Set-up step 5: `ts-dom check <dirs>` first, or a script that starts with `ts-dom gen <dirs> &&` (owned by the build or framework Skill) |
| `error [stale-generated] The generated file is missing` from `check --no-write` on every file | `--no-write` on a clean checkout of a project that does not commit the generated files | `ts-dom check` without `--no-write` (Known limitations 1) |
| `error [stale-generated] The generated file is outdated` from `gen --check` | a template or `define()` changed and the committed generated files were not regenerated | run `ts-dom gen <dirs>` with the project's flags and commit the result |
| `stale-generated` (outdated) for every file although the developer regenerated | CI generates or checks with another `--whitespace` (or other folders, `--include`, `--exclude`) than the project | pass the project's flags (Set-up step 3) |
| CI passes, but a broken template reaches the main branch | `typescript` not installed (`tsc-not-found` is an error, so only a step that ignores its exit code lets it through), a writing `check` on committed files, or `gen --check` alone | Known limitations 2, 3, 4 |
| `[dir-not-found] The folder src does not exist` | the commands default to `src` in the folder they run in | pass the folders the project uses, from the folder with `package.json`; in a workspace, from each package's folder (`nativele-monorepo`) |
| `tsc-failed`: `tsc did not check the types` | no `tsconfig.json` where `ts-dom check` runs, or a config `tsc` rejects | run it from the project folder, or `--project=<path>`; the tsconfig belongs to the TypeScript Skill |
| the job never ends | a step runs `ts-dom gen --watch` (or a dev server) | use `ts-dom check` or `ts-dom gen` |
| real-browser tests fail to launch Chrome | no Chromium-based browser on the runner, or not where the tests look | install one on the runner; the testing Skill covers how the tests find it |

## See also

- What each tool checks, `ts-dom check`, `doctor`, `gen --check` and which command writes files: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#checks
- Generating before `tsc`, committing or ignoring the generated files, `--whitespace`: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#installation-and-setup
- The generated `x.html.ts`: https://github.com/Pixmi/nativele/blob/main/docs/templates.md#how-types-are-generated
- Moving list items with `moveBefore`: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#moving-items-connecting-and-subscriptions
- Which tests need a real browser: https://github.com/Pixmi/nativele/blob/main/docs/architecture.md#testing
- How Skills share a project, and who owns which configuration: https://github.com/Pixmi/nativele/blob/main/skills/README.md#how-skills-work-together
