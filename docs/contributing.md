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
src/cli.ts          ts-dom gen / lint
examples/           user-card and todo list (todo) examples, demo entry
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

Examples in the repo point directly to `src/lib` through an alias in `vite.config.ts`, so no packing is needed first.

### Browser tests

`npm run test:browser` starts `vp dev` and drives the system-installed Chrome with `playwright-core` (no browser is downloaded), verifying behavior that happy-dom cannot cover: native `@scope`, slot assignment for parser-created elements, dynamic slots through `MutationObserver`, and native slots and style isolation in Shadow DOM.

| Environment variable | Description |
|---|---|
| `CHROME_BIN` | Path to Chrome, default `/usr/bin/google-chrome` |
| `TSDOM_CHROME_HOME` | HOME used by Chrome, default `/tmp/chome` (avoids crashpad write failures under WSL or a read-only home directory) |

The tests always use `--no-sandbox --no-zygote`, which suits WSL and container environments; they can also run on an ordinary desktop.

By default only Chromium is run, and CI also runs only Chromium: this library is a TS tool that relies on standard DOM APIs, not on CSS rendering, where browsers differ a lot. To try it on Firefox, use `BROWSER=firefox PLAYWRIGHT_BROWSERS_PATH=<path> npm run test:browser` (run `npx playwright-core install firefox` first; Firefox 157 has been verified to pass everything). WebKit is not verified.
