# Developing Nativele

Part of the [Nativele](../README.md) documentation.

## Project Structure

```
src/lib/
  component.ts      Component base class, define
  list.ts           keyed lists
  cond.ts           data-if
  text.ts           {{ }} holes
  slots.ts          slots for Light DOM
  style.ts          style injection for Light mode, scoped
  store.ts          createStore
  template.ts       Template / Schema types
  codegen.ts        parse5 parsing, diagnostics, generating .html.ts
  vite-plugin.ts    optional Vite plugin (@nativele/ts-dom/vite)
  lint.ts           unused markup and data flow checks
  reserved.ts       reserved names (collisions with DOM and ts-dom members)
  a11y.ts           ARIA / accessibility checks
  oxlint-plugin.ts  oxlint JS plugin (@nativele/ts-dom/oxlint)
  check.ts          ts-dom check
  doctor.ts         ts-dom doctor
  skills.ts         ts-dom skills: listing, stale checks, copying
src/cli.ts          the ts-dom command
skills/             Skills shipped with the package, one SKILL.md each
examples/           user-card, todo, signup, readme and recipes examples, demo entry
test/               unit tests (happy-dom)
browser/            real Chrome tests and fixtures
```

## Developing This Project

| Command | Description |
|---|---|
| `npm run dev` | Start the demo (`vp dev`) |
| `npm run build` | Build the demo into `demo-dist/` |
| `npm run build:lib` | Build the library into `dist/` |
| `npm run smoke` | After packing, verify `gen → tsc → lint → build` in a fresh project with Vite installed |
| `npm run smoke:no-bundler` | After packing, verify `gen → tsc → running in a browser` in a fresh project with **only typescript installed** |
| `npm run verify:pack` | Build and check the publishing configuration with `publint` and `attw` (runs automatically before `npm pack`) |
| `npm run gen` | Generate the `.html.ts` files for examples and tests |
| `npm run check` | Run `tsc` after `gen` |
| `npm test` | Unit tests (happy-dom) |
| `npm run test:browser` | Tests that run in real Chrome (see below) |
| `npm run lint` | `vp lint`, including `ts-dom/unused-markup` |
| `npm run lint:html` | The CLI version of the same checks |
| `npm run bench:check` | Measure the lint and Vite hosts and tsc on synthetic projects against the budgets in `scripts/bench/budgets.json` (see below) |

Examples in the repo point directly to `src/lib` through an alias in `vite.config.ts`, so no packing is needed first.

### Browser tests

`npm run test:browser` starts `vp dev` and drives the system-installed Chrome with `playwright-core` (no browser is downloaded), verifying behavior that happy-dom cannot cover: native `@scope`, slot assignment for parser-created elements, dynamic slots through `MutationObserver`, and native slots and style isolation in Shadow DOM.

| Environment variable | Description |
|---|---|
| `CHROME_BIN` | Path to Chrome, default `/usr/bin/google-chrome` |
| `TSDOM_CHROME_HOME` | HOME used by Chrome, default `/tmp/chome` (avoids crashpad write failures under WSL or a read-only home directory) |

The tests always use `--no-sandbox --no-zygote`, which suits WSL and container environments; they can also run on an ordinary desktop.

By default only Chromium is run, and CI also runs only Chromium: this library is a TS tool that relies on standard DOM APIs, not on CSS rendering, where browsers differ a lot. To try it on Firefox, use `BROWSER=firefox PLAYWRIGHT_BROWSERS_PATH=<path> npm run test:browser` (run `npx playwright-core install firefox` first; Firefox 157 has been verified to pass everything). WebKit is not verified.

## CI

A pull request runs only the jobs its changed files need, and a push to `main` does the same for the pushed commits. The jobs that are not needed still report as skipped, so the required checks pass.

| Changed files | Jobs that run |
|---|---|
| `src/`, `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `.github/workflows/ci.yml` | all of `ci.yml`, and the `SKILL.md` format check |
| `test/`, `scripts/bench.ts`, `index.html` | types, unit tests and lint |
| `browser/`, `examples/` | types, unit tests and lint, and the browser tests |
| `scripts/consumer-smoke.sh`, `scripts/no-bundler-smoke.sh` | types, unit tests and lint, and that smoke test |
| `scripts/bench/` | types, unit tests and lint, and the performance budgets |
| `skills/`, `docs/`, the READMEs, `llms.txt` | the `SKILL.md` format check, which also checks their links (`skills.yml`) |
| Other Markdown, `LICENSE`, `.gitignore`, other workflows | nothing |

Every job reports on every pull request, skipped when not needed, so all of them are required checks for `main`.

### Performance budgets

`npm run bench:check` generates a 1000-component project, a three-package monorepo and a few small type projects, then measures what the hosts do: templates parsed, files read and folders listed by `ts-dom lint`, by the Vite plugin at build start and on each `.html` or `.ts` save, and by the oxlint plugin for a whole-project lint and a one-file re-lint; the memo entries a long editing session adds; and the type instantiations tsc reports (`--extendedDiagnostics`) for a chain of components, components whose state holds DOM objects, and a template with many custom elements of another library, with no tsc errors allowed. These counts do not depend on the machine, so their budgets sit at or just above the measured values. Wall-clock time is not budgeted, because it varies too much between shared runners. The script prints every value next to its budget and fails when one is over. When a change raises a value on purpose, update its number in `scripts/bench/budgets.json` in the same commit and say in the commit message why; lower a budget when a change brings its value down, so the gain is kept.
