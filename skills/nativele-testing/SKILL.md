---
name: nativele-testing
description: "Test Nativele components in an app: component tests with Vitest and happy-dom (or jsdom), real-browser tests with Vitest browser mode in headless Chrome, and page tests with Playwright. Covers generating the templates before tests, creating elements, props, events, lists, data-if, stores, slots, test isolation, and what a DOM shim cannot show. Use when a project depends on @nativele/ts-dom and on vitest, @playwright/test or playwright."
metadata:
  tier: official
  nativele: ">=0.7.0 <0.8.0"
  verified: "2026-11-08"
  tools: "vitest@5.1.0 happy-dom@21.0.4 jsdom@30.1.3 @vitest/browser-playwright@5.1.0 playwright@1.64.1 @playwright/test@1.64.1 vite@8.3.6 typescript@7.0.2"
  author: "Nativele maintainers"
  detects: "vitest @playwright/test playwright"
---

# Testing Nativele components

## When to use

- An app that already uses Nativele (`@nativele/ts-dom`) and needs tests for its components: rendering, props, events, lists, `data-if`, stores and slots.
- Signals: `@nativele/ts-dom` together with `vitest`, `@playwright/test` or `playwright` in `package.json`, or a request to add tests to a project with `.html` templates and `define()` calls.
- The starting point is a Vite app with Nativele set up as in the `nativele-vite` Skill (`npm create vite@latest -- --template vanilla-ts`, the `tsDom()` plugin in `vite.config.ts`, components in `src/nv/`). This Skill adds only what testing Nativele needs; it does not teach Vitest or Playwright.
- Not for writing the components (`npx ts-dom skills add nativele-core`), and not for testing the library itself.

The recommended path is Vitest: component tests in happy-dom, and the few behaviors a DOM shim gets wrong in Vitest browser mode on headless Chrome. The alternative is Playwright Test for tests of whole built pages.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.7.4 (the last agent trial) |
| vitest | 5.1.0 |
| happy-dom | 21.0.4 |
| jsdom | 30.1.3 (the same component tests pass; not the recommended environment) |
| @vitest/browser-playwright | 5.1.0 |
| playwright | 1.64.1 (used only to drive the installed Chrome; no browser is downloaded) |
| @playwright/test | 1.64.1 |
| vite | 8.3.6 |
| typescript | 7.0.2 |

Verified on 2026-11-07 with Node 24 and Google Chrome 157, starting from `create-vite` 9.3.4 with the `vanilla-ts` template. Vitest 5 changed its configuration (`test.api`, `test.projects`, providers as separate packages); with Vitest 4 or older, or another major version of any tool above, treat every step as unverified.

## Set-up

1. Install the test tools:

   ```sh
   npm i -D vitest@5.1.0 happy-dom@21.0.4
   ```

2. Put the test configuration in the same `vite.config.ts` that has `tsDom()`, so Vitest loads the plugin.

   - The plugin writes the generated `x.html.ts` files and `ts-dom-tags.ts` when Vitest starts, so `vitest run` works on a clean checkout.
   - A separate `vitest.config.ts` replaces `vite.config.ts` for Vitest. If the project has one, add `tsDom({ dirs: ["src/nv"] })` to its `plugins` too (Troubleshooting).

   ```ts
   // vite.config.ts
   import { defineConfig } from "vitest/config";
   import { tsDom } from "@nativele/ts-dom/vite";

   export default defineConfig({
     plugins: [tsDom({ dirs: ["src/nv"] })],
     test: {
       projects: [
         { extends: true, test: { name: "unit", include: ["test/**/*.test.ts"], exclude: ["test/**/*.browser.test.ts"], environment: "happy-dom" } },
       ],
     },
   });
   ```

3. Keep the tests in `test/`, and make the tsconfig cover that folder too (`"include": ["src", "test"]` in the trial) with the TypeScript Skill (`npx ts-dom skills nativele-typescript`).

   - Vitest does not type-check. `ts-dom check src/nv` runs the project's `tsc`, which then checks the tests too.
   - `ts-dom-tags.ts` types `document.createElement("counter-card")` as the component class, with its props.
4. Add the scripts:

   ```sh
   npm pkg set scripts.test="vitest run --project unit"
   ```

   `ts-dom check src/nv` reports the type errors in the tests and the templates.

   - The build script that `nativele-vite` sets up runs it.
   - In a framework project, whose build keeps the framework's own type check, run `ts-dom check src/nv` before or after the tests.
   - Where these steps go in CI is covered by `npx ts-dom skills nativele-ci`.

5. For the real-browser tests, install the Vitest provider and Playwright, and add a second project. It drives a Chromium-based browser already installed on the machine (`CHROME_BIN`, or `/usr/bin/google-chrome`), so `npx playwright install` is not needed. A CI runner needs such a browser too (`nativele-ci`).

   ```sh
   npm i -D @vitest/browser-playwright@5.1.0 playwright@1.64.1
   npm pkg set scripts.test:browser="vitest run --project browser"
   ```

   ```ts
   // vite.config.ts: the browser project, next to "unit" in test.projects
   import { playwright } from "@vitest/browser-playwright";

   const chrome = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";

   {
     extends: true,
     test: {
       name: "browser",
       include: ["test/**/*.browser.test.ts"],
       api: { port: 63432, strictPort: true },
       browser: {
         enabled: true,
         headless: true,
         provider: playwright({ launchOptions: { executablePath: chrome, args: ["--no-sandbox", "--no-zygote", "--disable-gpu", "--disable-dev-shm-usage"] } }),
         instances: [{ browser: "chromium" }],
       },
     },
   },
   ```

   - `headless: true` keeps the run the same locally and in CI. The launch arguments suit containers, WSL and CI runners.
   - Name only the tests that need a real browser `*.browser.test.ts` (limitation 1). Everything else stays in happy-dom, which starts in a fraction of the time.

6. Alternative, for tests of whole pages (the built app, every component on it, navigation): Playwright Test against `vite preview`, with the same Chrome:

   ```sh
   npm i -D @playwright/test@1.64.1
   npm pkg set scripts.test:e2e="playwright test"
   ```

   ```ts
   // playwright.config.ts
   import { defineConfig } from "@playwright/test";

   const chrome = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";

   export default defineConfig({
     testDir: "e2e",
     use: {
       baseURL: "http://localhost:4432",
       launchOptions: { executablePath: chrome, args: ["--no-sandbox", "--no-zygote", "--disable-gpu", "--disable-dev-shm-usage"] },
     },
     webServer: { command: "npm run build && npx vite preview --port 4432 --strictPort", url: "http://localhost:4432" },
   });
   ```

   The tsconfig must cover `e2e` too, so `ts-dom check` type-checks the specs (`nativele-typescript`). Add `test-results` and `playwright-report` to `.gitignore`.

## Example

The component under test (`src/nv/counter-card.*`):

```html
<!-- src/nv/counter-card.html -->
<style scoped>
  b { color: rgb(200, 0, 0); }
</style>
<p>{{ label }}: <b>{{ count }}</b></p>
<button type="button" data-on-click="increment">+1</button>
<p data-if="many">That is a lot.</p>
```

```ts
// src/nv/counter-card.ts
import { Component, define, event } from "@nativele/ts-dom";
import tpl from "./counter-card.html.js";

export class CounterCard extends Component(tpl, {
  props: { label: "Count" },
  state: { count: 0 },
  derive: { many: (s) => s.count >= 3 },
  emits: { "count-change": event<{ count: number }>() },
}) {
  increment(): void {
    this.set({ count: this.state.count + 1 });
    this.emit("count-change", { count: this.state.count });
  }
}
define("counter-card", CounterCard);
```

Its tests, in happy-dom:

```ts
// test/counter-card.test.ts
import { afterEach, expect, test } from "vitest";
import type { EmitEvent } from "@nativele/ts-dom";
import "../src/nv/counter-card.ts";
import type { CounterCard } from "../src/nv/counter-card.ts";

afterEach(() => document.body.replaceChildren());

function mount(label?: string): CounterCard {
  const el = document.createElement("counter-card");
  if (label !== undefined) el.label = label;
  document.body.append(el);
  return el;
}

test("renders when it is appended, with props set as properties before", () => {
  const el = document.createElement("counter-card");
  el.label = "Clicks";
  expect(el.childNodes.length).toBe(0);
  document.body.append(el);
  expect(el.querySelector("p")?.textContent).toBe("Clicks: 0");
});

test("a prop changed later, as a property or an attribute, renders at once", () => {
  const el = mount();
  el.label = "Taps";
  expect(el.querySelector("p")?.textContent).toBe("Taps: 0");
  el.setAttribute("label", "Hits");
  expect(el.querySelector("p")?.textContent).toBe("Hits: 0");
});

test("emit: listen on the element, read detail; the event does not bubble", () => {
  const el = mount();
  const details: { count: number }[] = [];
  let heardByDocument = 0;
  el.addEventListener("count-change", (e) => details.push((e as EmitEvent<CounterCard, "count-change">).detail));
  document.addEventListener("count-change", () => heardByDocument++);
  el.querySelector("button")!.click();
  el.querySelector("button")!.click();
  expect(details).toEqual([{ count: 1 }, { count: 2 }]);
  expect(heardByDocument).toBe(0);
});

test("data-if: the block is absent until its value is truthy", () => {
  const el = mount();
  const lots = () => [...el.querySelectorAll("p")].some((p) => p.textContent === "That is a lot.");
  for (let i = 0; i < 2; i++) el.querySelector("button")!.click();
  expect(lots()).toBe(false);
  el.querySelector("button")!.click();
  expect(lots()).toBe(true);
});
```

The steps every test follows:

1. Import the component module for its side effect (`import "../src/nv/counter-card.ts"`): that runs `define()`. A type-only import registers nothing (limitation 2).
2. Create the element with `document.createElement(tag)`; set object, array and other props as properties (`el.todos = [...]`), before or after appending. String, number and boolean props can also be attributes.
3. Append it to `document.body`. A Light DOM component has no children until it is connected; a component renders when it is appended.
4. Assert at once. Rendering is synchronous: after `append`, a prop assignment, `setAttribute`, `el.click()` or `store.set()`, the DOM is already updated, and `emit` listeners have already run.
   - For a form, set the input's `value`, then call `click()` on its submit button or `form.requestSubmit()`. Both run the template's `data-on-submit` handler, in happy-dom too.
   - The only wait is for slot changes made after connection: one microtask (limitation 7).
5. Empty the document in `afterEach` (`document.body.replaceChildren()`): removing the elements runs `disconnected()` and ends their `bind`, `on` and `onCleanup` registrations.

These tests compare `textContent` exactly. When the project formats its templates, assert text by the whitespace mode the formatting Skill chose (`npx ts-dom skills nativele-formatting`):

- With `preserve`, `textContent` gains the formatter's newlines and indentation. Compare it with its whitespace normalized: `el.textContent.replace(/\s+/g, " ").trim()`.
- With `collapse`, reformatting does not change `textContent`, but the text of adjacent blocks runs together (`<h2>Hi</h2>` and `<p>there</p>` give `"Hithere"`). Assert on the element that holds the text, or on `innerText` in a real browser.

Other parts of the API:

```ts
// lists (test/todo-list.test.ts): items as components; an item's event reaches the parent with hit.key
const el = document.createElement("todo-list");
el.todos = todos;
document.body.append(el);
expect([...el.querySelectorAll("todo-row")].map((r) => r.textContent?.trim())).toEqual(["Write tests", "Run them"]);
expect(el.lists.todos.items).toEqual(todos);
el.querySelectorAll("todo-row")[1]!.querySelector("input")!.click();
expect(el.state.done).toEqual([2]);

// stores and bind (test/user-badge.test.ts): reset the shared store before each test
beforeEach(() => session.set({ user: "guest" }));
session.set({ user: "Ada" });
expect(el.textContent?.trim()).toBe("Signed in as Ada");

// Light DOM slots (test/panels.test.ts): children present at connection are placed at once;
// a child added later is placed by a MutationObserver, after one microtask
el.append(title);
await Promise.resolve();
expect(el.assignedNodes("title")).toEqual([title]);

// Shadow DOM slots: the template is in el.shadowRoot; the native slotchange event also fires after one microtask
el.shadowRoot!.querySelector("slot[name=title]")!.addEventListener("slotchange", onChange);
```

A real-browser test, for what happy-dom cannot show (limitation 1):

```ts
// test/move.browser.test.ts
import { afterEach, expect, test, vi } from "vitest";
import "../src/nv/todo-list.ts";
import { TodoRow, type Todo } from "../src/nv/todo-row.ts";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const todos: Todo[] = [
  { id: 1, title: "Write tests", done: false },
  { id: 2, title: "Run them", done: true },
];

test("Chrome moves a list item with moveBefore: it stays connected and keeps focus", () => {
  expect("moveBefore" in Element.prototype).toBe(true);
  const el = document.createElement("todo-list");
  el.todos = todos;
  document.body.append(el);
  const disconnected = vi.spyOn(TodoRow.prototype, "disconnected");
  const connected = vi.spyOn(TodoRow.prototype, "connected");
  const input = el.querySelector("todo-row input") as HTMLInputElement;
  input.focus();
  el.todos = [todos[1]!, todos[0]!];
  expect(el.querySelectorAll("todo-row input")[1]).toBe(input);
  expect(disconnected).not.toHaveBeenCalled();
  expect(connected).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(input);
});
```

Under happy-dom this test fails: there is no `moveBefore`, both callbacks run and the input loses focus. A unit test can assert the happy-dom behavior, so that a happy-dom release that adds `moveBefore` shows up as a failing test.

The Vitest API in browser mode is the same: happy-dom tests pass unchanged in the browser project, so moving a test there is a matter of renaming it.

A page test with Playwright (the alternative):

```ts
// e2e/app.spec.ts
// The page holds <light-panel><span slot="title">Light</span></light-panel> and the same in <shadow-panel> with "Shadow";
// each panel's template is <h2><slot name="title">Untitled</slot></h2>.
import { expect, test } from "@playwright/test";

test("the built page renders the components and they respond", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const counter = page.locator("counter-card");
  await expect(counter.locator("p").first()).toHaveText("Clicks: 0");
  await counter.getByRole("button", { name: "+1" }).click();
  await expect(counter.locator("b")).toHaveText("1");
  await expect(page.locator("todo-list todo-row")).toHaveText(["Write tests", "Run them in Chrome"]);
  await expect(page.locator("light-panel h2")).toHaveText("Light");
  await expect(page.locator("shadow-panel h2")).toHaveText("Untitled");
  await expect(page.getByRole("heading", { name: "Shadow" })).toBeVisible();
  expect(errors).toEqual([]);
});
```

Playwright locators reach into open shadow roots, so `page.locator("shadow-panel h2")` finds the heading inside a `shadow: true` component. Its text is the slot fallback, not what is shown (limitation 6).

When the slotted element is an `<h2>` too, the same locator matches both, the slotted one first. An assertion on one element then fails with a strict mode violation. Assert both (`toHaveText(["Shadow", "Untitled"])`), or find what is shown with `getByRole`.

## Known limitations

1. **What happy-dom does not have.** Test moves, focus, computed styles, layout and real input in a `*.browser.test.ts`.
   - happy-dom 21 and jsdom 30 have no `Element.prototype.moveBefore`. A list item that moves on reorder is taken out and put back: `disconnected()` and `connected()` run, `bind` subscriptions end and start again, and a focused input in it loses focus.
   - Chrome has `moveBefore`: the same move runs neither callback and keeps focus.
   - Computed styles are not reliable in a DOM shim: jsdom ignores the `@scope` rule that `<style scoped>` produces, while happy-dom applies it.
   - Everything else the example covers behaves the same in happy-dom, jsdom and Chrome: custom elements and attribute changes, `MutationObserver` (Light DOM slots), Shadow DOM, native slots and `slotchange`, events, lists, `data-if` and stores.
2. **Import the module, not only the type.** Add `import "../src/nv/counter-card.ts"`; importing the parent is enough, because its generated module imports the child components its template uses.
   - `import type { CounterCard }` (or `import { type CounterCard }`) is erased, so `define()` never runs. `document.createElement("counter-card")` returns a plain element that never renders, while `tsc` still types it as `CounterCard`.
   - The symptom is `expected undefined to be ...` or `Cannot read properties of null (reading 'click')`.
3. **One registry per test file.** Empty the document in `afterEach`: inside a file, all its tests share the document and the registry.
   - By default (`isolate: true`), Vitest runs each test file in a new environment, in happy-dom and in browser mode, so each file starts with an empty document and an empty `customElements`.
   - With `--no-isolate --no-file-parallelism`, files run one after another in the same worker and share both: the document keeps the previous file's elements, and a direct `customElements.define()` of a name already defined throws.
4. **A tag cannot be redefined.** Reset shared stores with `store.set(...)` in `beforeEach`, and give a component defined only for one test file a name no other module uses.
   - `define()` with a name that is already defined does nothing and keeps the first class. `customElements.define()` throws, in happy-dom, jsdom and Chrome.
   - `vi.resetModules()` followed by a new `import()` creates a new class and new module-level stores, but the tag keeps running the first class, bound to the first store.
5. **Do not add a `data-ref` only for a test.** Query the rendered DOM in the test instead (`el.querySelector("button")`, `el.shadowRoot.querySelector(...)`, `el.assignedNodes(name)`).
   - `ts-dom check` reports a ref that the component class never reads as `unused-ref`, and access from a test does not count.
   - The linter's `ts-dom/unused-markup` rule does the same. Turning it off for test folders silences only templates that test files import themselves (`npx ts-dom skills nativele-linting`).
6. **Text of a slotted heading in a Shadow DOM component.** Read the slot with `el.assignedNodes(name)`, or in Playwright use `getByRole("heading", { name: "Shadow" })`, which follows what is shown.
   - `textContent`, and Playwright's `toHaveText` on the element inside the shadow root, read the slot's fallback content: in the example, `shadow-panel h2` has the text `Untitled` while it shows `Shadow`.
   - A Light DOM component has the slotted nodes in place, so its text is what is shown.
7. **Slot changes after connection are asynchronous.** `await Promise.resolve()` once before asserting; that is enough in happy-dom, jsdom and Chrome.
   - Children added to a connected Light DOM component are placed by a `MutationObserver`, and `slotchange(name)` runs then. For a Shadow DOM component, the native `slotchange` event fires at the same point.
   - Children present when the element is appended are placed synchronously.
8. **Typing custom events.** `addEventListener` types an unknown event name as `Event`, so `e.detail` is a `tsc` error (`TS2339`); cast with `EmitEvent<CounterCard, "count-change">`.
9. Not verified: Vitest watch mode after a template change, Vitest 4 or older, browsers other than Chrome, Playwright's downloaded browsers (`npx playwright install`) instead of the installed Chrome, `@vitest/browser-webdriverio`, and testing components inside a UI framework (see that framework's Skill).

## Verify

Run in the project:

```sh
npx vitest run --project unit      # expect: every test file passes, on a clean checkout too
npx ts-dom check src/nv            # expect: ts-dom check: no issues (this type-checks the tests)
npx ts-dom doctor src/nv           # expect: ts-dom doctor: the set-up looks right
npx vitest run --project browser   # expect: the *.browser.test.ts files pass in headless Chrome
npx playwright test                # if you use the alternative: builds, serves on port 4432, passes
```

The same unit tests also pass under jsdom, as a third Vitest project with `"environment": "jsdom"`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Error: Failed to resolve import "./counter-card.html.js" from "src/nv/counter-card.ts". Does the file exist?` | Vitest runs without the `tsDom()` plugin (a `vitest.config.ts` without it replaces `vite.config.ts`), and nothing generated the files | add `tsDom({ dirs: ["src/nv"] })` to the config Vitest loads, or run `ts-dom gen src/nv` before the tests |
| `expected undefined to be '...'`, `Cannot read properties of null (reading 'click')` on a freshly appended element | the component module was imported only as a type, so the tag is not defined | `import "../src/nv/x.ts"` (limitation 2) |
| `TS2339: Property 'detail' does not exist on type 'Event'` from `ts-dom check` | the listener's event is a plain `Event` | cast with `EmitEvent<Component, "event-name">` |
| `TS2339: Property 'label' does not exist on type 'HTMLElement'` on `document.createElement("counter-card")` | `tsc` ran without `ts-dom-tags.ts` (nothing generated it), or the component class is not exported | run `ts-dom check src/nv` instead of plain `tsc`; export the class |
| `src/nv/x.html:1:1 error [unused-ref] data-ref="..." is never used by the component class` | a ref added for a test | query the DOM in the test and remove the ref (limitation 5) |
| A test passes alone and fails with others in the same file, or sees elements from another test | the document is shared within a file | `afterEach(() => document.body.replaceChildren())`; reset module-level stores in `beforeEach` |
| `Error: browserType.launch: Failed to launch chromium because executable doesn't exist at /usr/bin/google-chrome` | no Chrome at that path | set `CHROME_BIN` to a Chrome or Chromium binary; on a CI runner, install one first (`nativele-ci`) |
| `Error: browserType.launch: Executable doesn't exist at ~/.cache/ms-playwright/...` and `Looks like Playwright was just installed or updated` | `executablePath` is missing from `launchOptions`, so Playwright looks for its own downloaded browser | set `executablePath` as in step 5 |
| DEPRECATED: `test.browser.api` was deprecated in Vitest 5. Use `test.api` instead. | the port is set where Vitest 4 had it | move `api` from `test.browser` to `test` of the browser project |
| A test that moves list items passes in happy-dom and fails in Chrome (or the reverse) | happy-dom has no `moveBefore` | assert moves in a `*.browser.test.ts` (limitation 1) |

## See also

- Rendering is synchronous, `set` and `batch`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-and-view-state-optional
- Props as properties and attributes, `emit`, events that do not bubble: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-flow-props-down-events-up
- Light DOM and Shadow DOM slots, `assignedNodes`, `slotchange`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#light-default-and-shadow
- Stores and `bind`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#state-store-when-not-using-state
- Lists, and what moving an item does with and without `moveBefore`: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#moving-items-connecting-and-subscriptions
- The Vite plugin and `ts-dom check`: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md
- The tsconfig: https://github.com/Pixmi/nativele/blob/main/skills/nativele-typescript/SKILL.md
- The ts-dom rules and test folders in the project's linter: https://github.com/Pixmi/nativele/blob/main/skills/nativele-linting/SKILL.md
- Whitespace in `textContent` with a formatter: https://github.com/Pixmi/nativele/blob/main/skills/nativele-formatting/SKILL.md
- CI and the browser on the runner: https://github.com/Pixmi/nativele/blob/main/skills/nativele-ci/SKILL.md
- Setting up the Vite app first: `npx ts-dom skills nativele-vite`
