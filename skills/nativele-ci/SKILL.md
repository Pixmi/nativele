---
name: nativele-ci
description: "Make a project's existing CI check the Nativele parts reliably (@nativele/ts-dom): generate before any type check, which ts-dom commands and flags give a trustworthy pass or fail, machine-readable output, committed or git-ignored generated files, keeping a check-only job from writing, caching, and what real-browser tests need. Use when CI is added or changed in a project that depends on @nativele/ts-dom, or when CI fails with TS2307 on ./x.html.js or passes although the templates are wrong."
metadata:
  tier: official
  nativele: ">=0.7.0 <0.8.0"
  verified: "2026-11-08"
  tools: "typescript@7.0.2 npm@11.19.1 pnpm@12.16.1"
  author: "Nativele maintainers"
  detects: "typescript"
---

# Nativele in CI

## When to use

- The project depends on `@nativele/ts-dom` and you add, review or change its CI (any provider: GitHub Actions, GitLab CI, Jenkins, a shell script on a build machine), or a pre-merge hook that runs the same checks.
- CI fails on a clean checkout with `TS2307: Cannot find module './x.html.js'`, fails with `stale-generated`, or passes although a template is wrong.
- This Skill owns the Nativele steps inside the project's CI: which `ts-dom` commands run, with which flags, in which order relative to the other steps, and how their result is read. It keeps the CI provider, the job layout, the install step and the package manager as they are.
- It does not own the test framework and its browser set-up (`nativele-testing`), the build and its scripts (`nativele-vite`, or the framework's Skill), the tsconfig (`nativele-typescript`), lint configuration (`nativele-linting`) or formatter configuration and the whitespace mode (`nativele-formatting`). It states what CI needs from them.

`detects` is `typescript`, because no package in `package.json` shows that a project has CI. What this Skill keeps reliable is the type check of the templates, which needs `typescript` installed, so `npx ts-dom skills` names it for the Nativele projects that type-check.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.7.4 (the last agent trial) |
| typescript | 7.0.2 |
| Node.js | 24.22.2 |
| npm | 11.19.1 (`npm ci`) |
| pnpm | 12.16.1 (`pnpm install`, `pnpm exec ts-dom`) |
| Google Chrome | 148.0.7778.178 (headless; only the `moveBefore` check) |

Verified on 2026-11-06 on Linux with fresh `git clone`s of a project built from the packed library (generated files git-ignored, and a variant with them committed), running every command below with `CI=true`, no terminal (`setsid -w`, stdin from `/dev/null`), and with deliberate errors.

No CI provider was run: the steps are shell commands, which every provider runs as they are. With another major version of `@nativele/ts-dom`, treat every exit code below as unverified.

## Set-up

Check first, then change only the Nativele steps. Never replace the CI provider, merge or split jobs, change the install command beyond what step 4 names, or rewrite steps that are not about Nativele.

1. **Read the CI that exists.**
   - Find its configuration: `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `azure-pipelines.yml`, `.circleci/config.yml`, or a script the build machine calls.
   - List, per job, the steps in order: checkout, install, and every step that type-checks, builds or tests. Include the ones hidden in a `package.json` script (`npm run build` that starts with `tsc -b`).
   - Note the package manager from the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`), and run `ts-dom` through it: `npx ts-dom`, `pnpm exec ts-dom`, or the project's own script. Both `npx` and `pnpm exec` gave the same output and exit codes.
2. **Find out whether the generated files are committed.** `git ls-files | grep -E '(\.html\.ts|ts-dom-tags\.ts)$'` prints nothing (and exits 1) when they are not.
   - Not committed, with `*.html.ts` and `ts-dom-tags.ts` in `.gitignore`, is the usual set-up: continue with step 5.
   - Committed: continue with step 6.
   - Do not change whether they are committed: that is the project's choice.
3. **Find the folders and flags the project generates with, and pass exactly the same in CI.** Calling the project's own script (`npm run check`, say) keeps them in step.
   - The folders are the ones passed to `ts-dom gen` and `ts-dom check` in its scripts, and the `dirs` of `tsDom()` in the Vite config.
   - The flags are `--whitespace=`, `--include=` and `--exclude=`. `ts-dom doctor` takes only the folders.
   - Without `--whitespace`, a `ts-dom check` on a clean checkout writes the files with whitespace kept as written. When the project generates with `--whitespace=collapse`, CI then checks other generated files than the developers have: `ts-dom gen --check --whitespace=collapse` reported them as `outdated`.
   - Which mode the project uses belongs to `nativele-formatting`.
4. **Check that the CI install includes dev dependencies**, or at least `typescript` (and `vue-tsc` in a Vue project). With dev dependencies left out (`npm ci --omit=dev`), `ts-dom check` reports `error [tsc-not-found]` and exits 1.

   This makes the job fail instead of passing with the types unchecked; keep it that way rather than relaxing the step.
5. **Generated files not committed (the usual case): put `ts-dom check <dirs>`, with the flags from step 3, after the install and before every step that type-checks, builds or tests.**
   - Or make sure the step that comes first generates: a script that starts with `ts-dom gen <dirs> &&` or `ts-dom check <dirs> &&`. Which of the two a build script uses is in the Vite Skill's Set-up step 5 (See also).
   - A type check that runs first fails on the clean checkout CI starts from. `npm run build` with `"build": "tsc"` exited 2 with `TS2307: Cannot find module './user-card.html.js'`.
   - When that type check is a `package.json` script, `ts-dom doctor` reports it as `typecheck-before-gen` (a warning). State the order to the owner of that script (the build Skill or the framework's Skill) instead of rewriting it here.
   - When it is written directly in the CI configuration (`npx tsc --noEmit`), move or precede that step yourself: it is a Nativele step in the CI. Doctor reads `package.json` scripts only, and printed `the set-up looks right` next to a workflow file and a `.gitlab-ci.yml` that ran `tsc` first.
   - `ts-dom check` runs the same `tsc` over the project after generating, so a separate `tsc --noEmit` step that only repeats it can go. Keep it when it checks another tsconfig (`-p`) or adds flags.
   - In a workspace, each package runs its own `ts-dom check` on its own folder, and a component package generates or builds before the apps that use it (`nativele-monorepo`).
   - Do not use `ts-dom check --no-write` here. With nothing generated it reports every generated file as `stale-generated` (missing) plus the `TS2307` errors, and exits 1.
   - Writing git-ignored files does not change what git tracks: after `ts-dom check`, `git status --porcelain` was empty.
6. **Generated files committed: check that they are current instead of refreshing them.** Run both:
   - `ts-dom gen --check <dirs>`: only the generated files (missing, outdated, orphaned).
   - `ts-dom check --no-write <dirs>`: the template diagnostics, `tsc` and lint on the files as committed, plus the same staleness as errors.
   - Not a plain `ts-dom check`: it regenerates first, so it passes on a template edited without regenerating. It printed `ts-dom check: no issues`, exit 0, and left `src/user-card.html.ts` modified; only a `git status --porcelain` test after it catches that.
7. **Decide what fails the job**, and say it to the user rather than choosing silently:
   - `ts-dom check` exits 1 on any error, `tsc-not-found` among them. Warnings (lint `data-flow`, `--a11y`) leave it at 0, and `--strict` makes them fail too.
   - `ts-dom doctor` exits 1 only on an error (verified: `no-tsconfig`, `tsconfig-no-dom-lib`, `dir-not-found`). Its warnings (verified: `typecheck-before-gen`) exit 0, and `--strict` makes them fail too.
   - A folder that does not exist is an error for `check` and `doctor` (`dir-not-found`), so a wrong path in CI fails instead of checking nothing.
8. **Read machine-readable output with `--json`** on `check`, `doctor`, `lint` and `gen --check`. It prints one JSON document on stdout and nothing on stderr, with the same exit code as the text form.

   | Command | JSON |
   |---|---|
   | `check`, `doctor`, `lint` | `{ "issues": [{ file, line, col, rule, severity, message }] }` |
   | `gen --check` | `{ "stale": [{ file, reason }], "errors": [...] }` |

   - In text form, errors and warnings go to stderr as `file:line:col severity [rule-id] message Fix: ...`.
   - The success line goes to stdout: `ts-dom check: no issues`, `ts-dom gen --check: generated files are up to date`, `ts-dom doctor: the set-up looks right`. `ts-dom gen` prints nothing when it succeeds.
   - No command prints color codes, prompts or reads stdin.
9. **Leave dependency caching as the project has it, and do not cache the generated files.**
   - `ts-dom check` rewrites outdated generated files and deletes orphaned ones anyway.
   - With `--no-write` or `gen --check`, a restored copy is what gets judged instead of the checkout.
   - `ts-dom` keeps no cache of its own: after `ts-dom check` no file outside the generated ones was new or changed, and there was no `node_modules/.cache`.
10. **Provide a Chromium-based browser on the runner when the project has real-browser tests.** Nativele moves kept list items with `moveBefore` where the browser has it, which a DOM shim does not have. Headless Chrome 148 has `Element.prototype.moveBefore` (it printed `function`).
    - The architecture guide's Testing lists what needs a real browser.
    - How the tests find and start the browser (`CHROME_BIN`, launch arguments, the test projects) belongs to `nativele-testing`.
    - The generated files must exist before the tests start: the Vite plugin writes them when Vitest starts with it; otherwise step 5 does.
11. **Run Verify** on a fresh clone, not in your working copy, where the generated files already exist.

## Example

The shell steps for one job, after the provider's checkout; put each command where the project's CI already runs its shell commands. Keep the project's own install command and its other steps; this shows only where the Nativele steps go. `src` stands for the project's folders, and `check` and `gen --check` also take its flags from Set-up step 3.

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

To fail on doctor warnings too (optional, the project's choice), run `npx ts-dom doctor src --strict`.

What these gave on fresh clones of the test project:

| Case | Steps | Result |
|---|---|---|
| clean, git-ignored | first block | exit 0; `ts-dom check: no issues`; doctor printed the `typecheck-before-gen` warning of the project's `"build": "tsc"` and exited 0 |
| `{{ nope }}` committed in a template, git-ignored | first block | exit 1 at `ts-dom check`: `src/user-card.html:1:20 error [missing-binding] "nope" is used by {{ nope }} ...` |
| clean, committed | second block | exit 0; `generated files are up to date`, `no issues`, `the set-up looks right` |
| template changed and committed without regenerating, committed | second block | exit 1 at `gen --check`: `src/user-card.html.ts:1:1 error [stale-generated] The generated file is outdated, ...` |
| the same, with the first block | first block | `ts-dom check` exit 0, then `test -z` failed on ` M src/user-card.html.ts` |

## Known limitations

1. **`ts-dom gen --check` checks only the generated files.** With a template that names nothing in its component, it printed `generated files are up to date` and exited 0; `ts-dom check` is what finds that. It does report codegen errors (`forbidden-tag` for a `<script>` in a template, exit 1).
2. **`ts-dom gen --watch` never exits** (it printed `[ts-dom] watching src` and ran until killed). Never use it, or a script that starts it, in CI.
3. **`ts-dom check` type-checks what the tsconfig covers, not only the folders it is given**: `ts-dom check web` (a folder that does not exist) still reported a type error from `src`. The folders decide what is generated and linted; which config `tsc` reads belongs to the TypeScript Skill.

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

- Add `<p>{{ nope }}</p>` to a template of a component, commit it on a throwaway branch, run the steps on a fresh clone: expect exit 1 and `error [missing-binding] "nope" is used by {{ nope }}` at the template line.
  - Code that uses the broken component may report its own `[tsc]` errors next to it (for example a `TS2345` where the element is appended). Their messages say they follow from the contract error, and they go away with the template fix.
- Committed files only: change a template's text without running `ts-dom gen`, commit, run the steps: expect exit 1 and `error [stale-generated] The generated file is outdated, so tsc may check the components against old templates.`
- Run the steps with the dev dependencies left out: expect `check` to exit 1 with `error [tsc-not-found]` (Set-up step 4); the CI install must not do it.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `TS2307: Cannot find module './x.html.js' or its corresponding type declarations` in CI only | a type check, build or test step runs before anything generates; locally the files already exist | Set-up step 5: `ts-dom check <dirs>` first, or a script that starts with `ts-dom gen <dirs> &&` (owned by the build or framework Skill) |
| `error [stale-generated] The generated file is missing` from `check --no-write` on every file | `--no-write` on a clean checkout of a project that does not commit the generated files | `ts-dom check` without `--no-write` (Set-up step 5) |
| `error [stale-generated] The generated file is outdated` from `gen --check` | a template or `define()` changed and the committed generated files were not regenerated | run `ts-dom gen <dirs>` with the project's flags and commit the result |
| `stale-generated` (outdated) for every file although the developer regenerated | CI generates or checks with another `--whitespace` (or other folders, `--include`, `--exclude`) than the project | pass the project's flags (Set-up step 3) |
| CI passes, but a broken template reaches the main branch | a step ignores the exit code of `check`, for example its `tsc-not-found` | install dev dependencies and keep the exit code (Set-up steps 4 and 7) |
| the same, in a project that commits the generated files | a writing `ts-dom check`, or `gen --check` alone | run `gen --check` and `check --no-write` (Set-up step 6) |
| `[dir-not-found] The folder src does not exist` | the commands default to `src` in the folder they run in | pass the folders the project uses, from the folder with `package.json`; in a workspace, from each package's folder (`nativele-monorepo`) |
| `tsc-failed`: `tsc did not check the types` | no `tsconfig.json` where `ts-dom check` runs, or a config `tsc` rejects | run it from the project folder, or `--project=<path>`; the tsconfig belongs to the TypeScript Skill |
| the job never ends | a step runs `ts-dom gen --watch` (or a dev server) | use `ts-dom check` or `ts-dom gen` |
| real-browser tests fail to launch Chrome | no Chromium-based browser on the runner, or not where the tests look | install one on the runner; the testing Skill covers how the tests find it |

## See also

- What each tool checks, `ts-dom check`, `doctor`, `gen --check` and which command writes files: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#checks
- Generating before `tsc`, committing or ignoring the generated files, `--whitespace`: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#installation-and-setup
- The build script for plain `tsc` and for a framework's type check (its Set-up step 5): https://github.com/Pixmi/nativele/blob/main/skills/nativele-vite/SKILL.md#set-up
- The generated `x.html.ts`: https://github.com/Pixmi/nativele/blob/main/docs/templates.md#how-types-are-generated
- Moving list items with `moveBefore`: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#moving-items-connecting-and-subscriptions
- Which tests need a real browser: https://github.com/Pixmi/nativele/blob/main/docs/architecture.md#testing
- How Skills share a project, and who owns which configuration: https://github.com/Pixmi/nativele/blob/main/skills/README.md#how-skills-work-together
