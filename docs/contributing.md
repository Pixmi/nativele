# Developing Nativele

Part of the [Nativele](../README.md) documentation.

## Project Structure

```
src/lib/            the runtime the package exports, the template and code analysis behind each command, and the Vite and oxlint plugins
src/cli.ts          the ts-dom command
skills/             Skills shipped with the package, one SKILL.md each
trials/             Skill trial fixtures and accepted trial records (not shipped)
scripts/            smoke tests, benchmarks and the Skill trial runner
docs/               the guides
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
| `npm run gen` | Generate the `.html.ts` files for the examples, the unit tests and the browser tests |
| `npm run check` | Run `tsc` after `gen` |
| `npm test` | Unit tests (happy-dom) |
| `npm run test:browser` | Tests that run in real Chrome (see below) |
| `npm run lint` | `vp lint`, including `ts-dom/unused-markup` |
| `npm run lint:html` | The CLI version of the same checks, on `examples/` |
| `npm run bench` | Run the large list benchmark in real Chrome; run by hand, as its timings depend on the machine |
| `npm run trial` | Run a Skill trial: `run`, `prepare`, `agent`, `check`, `accept`, `comment` and `replay` (see the Skills guide) |
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

`npm run bench:check` generates synthetic projects and measures what the hosts do: a 1000-component project, a three-package monorepo and a few small type projects. It prints every value next to its budget in `scripts/bench/budgets.json` and fails when one is over.

It counts:

- the templates parsed, files read and folders listed by `ts-dom lint`;
- the same for the Vite plugin, at build start and on each `.html` or `.ts` save;
- the same for the oxlint plugin, for a whole-project lint and a one-file re-lint;
- the memo entries a long editing session adds;
- the type instantiations tsc reports (`--extendedDiagnostics`) for a chain of components, components whose state holds DOM objects, and a template with many custom elements of another library, with no tsc errors allowed.

These counts do not depend on the machine, so their budgets sit at or just above the measured values.

Wall-clock time is not budgeted, because it varies too much between shared runners. One ratio is checked instead: the script times `ts-dom lint --a11y` and an `.html` save in the Vite plugin on a 200-component and a 2000-component project (median of 3 and 9 runs), and fails when the large run takes more than 35 times the small one.

Ten times the components should cost about 10 times as much, and quadratic growth about 100 times. Locally the ratios are about 3 for the command and 11 for the save, so only a super-linear regression reaches 35, whatever the runner's speed.

When a change raises a value on purpose, update its number in `scripts/bench/budgets.json` in the same commit and say in the commit message why. Lower a budget when a change brings its value down, so the gain is kept.

## Writing docs and Skills

These rules apply to the guides, the READMEs, `llms.txt`, `AGENTS.md` and every `SKILL.md`. The [Skills guide](../skills/README.md#writing-rules) adds the rules that only apply to a Skill.

### Where a fact lives

- Subtract first: delete what is duplicated, unnecessary or wrong, rewrite only what must stay, and add only what the reader needs and nothing says yet.
- Each fact has one place. Facts about the library's API live in `docs/`; the README holds the getting-started content and links to the guides; `llms.txt` holds one line per rule with a link to its guide section; `AGENTS.md` points to `llms.txt`.
- A rule's details live in `ts-dom rules --explain=<id>` and in the docs table that owns the rule. Other places name the rule id and link there.
- Each tool owns one layer, and its docs describe only that layer: formatting is the formatter's, template rules are `ts-dom gen`'s, names and types are `tsc`'s (mapped by `ts-dom check`), usage and data flow are lint's, and project set-up is `ts-dom doctor`'s.
- Describe the current state only. Words such as "now", "no longer", "used to" or "since 0.6" belong in `CHANGELOG.md`.
- Public content is in English. `README.zh-TW.md` is the Traditional Chinese twin of `README.md`, so a change to one is made to the other.
- Keep heading text unchanged, since other files link to the anchors; adding a sub-heading is fine. When a section must go, fix every link to its anchor.

### Paragraphs, lists and tables

- A paragraph or list item states one fact or one instruction, plus at most one reason. Aim for under 300 characters, and split anything over 400.
- Lead with the instruction or the main fact. Conditions, exceptions and reasons follow as their own sentences or sub-items, never in the middle of the main sentence.
- A parenthesis holds only a short example, a rule id or a value, right after the word it explains. Never put a parenthesis inside a parenthesis, or a second sentence inside one.
- Three or more checks, causes or conditions are a bulleted list, not a chain of semicolons. Steps in order are a numbered list. Cases that differ in two or more attributes (case, result, fix) are a table.
- A table cell holds one phrase or one short sentence. When a cell needs conditions, keep a one-line summary in the cell and put the conditions in a list under the table.
- A section longer than three short paragraphs gets a real sub-heading, not a bold lead-in sentence.
- Rationale gets its own short paragraph after the facts.
- Never hard-wrap: a paragraph, list item or table row is one line, however long. Shorten by splitting it into paragraphs, list items or a table, not by line breaks.

`AGENTS.md`, `docs/performance.md` and the `nativele-react` and `nativele-vite` Skills follow these rules and serve as models. `npx vitest run test/skills.test.ts test/rule-docs.test.ts` checks the Skill format and that every link in the READMEs, `llms.txt`, the guides and the Skills resolves.
