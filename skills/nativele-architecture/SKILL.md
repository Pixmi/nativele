---
name: nativele-architecture
description: "Lay out an app built with Nativele that has several pages: feature folders with their components, stores and tests, shared components and app-wide stores, pages as custom elements that a router mounts (the Navigation API with URLPattern, or universal-router), lazy-loaded page modules, one scanned folder for the generated files, and which behavior goes to unit, real-browser and end-to-end tests. Use when starting such an app or restructuring one, or when a project depends on @nativele/ts-dom and universal-router."
metadata:
  tier: official
  nativele: ">=0.5.3 <0.6.0"
  verified: "2026-11-05"
  tools: "vite@8.3.6 typescript@7.0.2 vitest@5.1.0 happy-dom@21.0.4 @vitest/browser-playwright@5.1.0 playwright@1.64.1 @playwright/test@1.64.1 create-vite@9.3.4 universal-router@10.0.3"
  author: "Nativele maintainers"
  detects: "universal-router"
---

# Nativele app architecture

## When to use

- A Vite app that already uses Nativele (`@nativele/ts-dom`), set up as in `nativele-vite` (started with `npm create vite@latest -- --template vanilla-ts`), that has or will have several pages: you are starting its structure, or restructuring a flat `src/nv/` folder into features.
- Signals: more than one page or URL, a component folder that has grown past a screen of files, the same component or store wanted by two parts of the app, a router dependency such as `universal-router`.
- The reasoning behind every step (why features, where state lives, why one scanned folder) is in the architecture guide: https://github.com/Pixmi/nativele/blob/main/docs/architecture.md. This Skill is the procedure.
- Not for writing components (`nativele-core`), setting up Vite (`nativele-vite`), choosing or connecting a state library (`nativele-state-management`), or writing the tests themselves (`nativele-testing`); this Skill uses all four and links to them.
- Not for an app whose pages are rendered by a UI framework (React, Vue): there the framework's router mounts the pages; see that framework's Skill.

`ts-dom doctor` suggests this Skill when `universal-router` is a dependency. The recommended router needs no dependency, so there is nothing else in `package.json` that tells a multi-page app from a single widget; detecting `@nativele/ts-dom` itself would suggest it to every project, which `nativele-core` already covers.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.5.3 |
| vite | 8.3.6 |
| typescript | 7.0.2 |
| create-vite (`vanilla-ts` template, the starting point) | 9.3.4 |
| vitest | 5.1.0 |
| happy-dom | 21.0.4 |
| @vitest/browser-playwright | 5.1.0 |
| playwright | 1.64.1 (drives the installed Chrome; no browser is downloaded) |
| @playwright/test | 1.64.1 |
| universal-router | 10.0.3 (checked by hand with the example's tests, see step 5; the example project does not run it) |

Verified on 2026-11-05 with Node 24 and Google Chrome 148, with the example project in the Nativele repository (`skills/nativele-architecture/example`), which CI runs again when the example or the library changes and once a month. The router relies on the Navigation API and `URLPattern`, verified in Chrome only. With another major version of any tool above, treat every step as unverified.

## Set-up

1. **Make the folders** under `src/`:

   ```
   src/main.ts                 # imports the shell, starts the router
   src/app/                    # the router, the shell, stores of the app itself
   src/shared/                 # components and stores used by more than one feature
   src/shared/stores/
   src/features/<feature>/     # each feature's pages, components, store and tests
   e2e/                        # tests of the built app
   ```

   Restructuring: move each page component and the components only it uses into its feature folder, each component used by two features into `src/shared/`, and the header or navigation into `src/app/`. Templates need no change (the import of a child component is generated); fix the relative `import` paths in the `.ts` files, and `ts-dom check src` (step 2) reports the ones you missed as `TS2307`. A feature never imports another feature: move what both need to `src/shared/`.

2. **Scan one folder, `src`, everywhere.** In `vite.config.ts`, `tsDom({ dirs: ["src"] })`; in every script and command, `ts-dom check src` and `ts-dom doctor src`. One folder gives one `ts-dom-tags.ts` and one argument for every command (limitation 1). When the app used another folder before (`src/nv` from `nativele-vite`), delete the `ts-dom-tags.ts` left in it (Troubleshooting).

3. **Set `tsconfig.json`'s `include`** to `["src", "e2e"]`: `src` covers the app, the tests next to the code and `ts-dom-tags.ts`, and `e2e` the end-to-end specs, so `ts-dom check src` type-checks all of them. Keep `"strict": true` from `nativele-vite`.

4. **Put the shell and the outlet in `index.html`**, and start the router from `src/main.ts`:

   ```html
   <app-nav></app-nav>
   <main id="outlet"></main>
   <script type="module" src="/src/main.ts"></script>
   ```

   ```ts
   // src/main.ts
   import "./app/app-nav.ts";
   import { startRouter } from "./app/router.ts";

   void startRouter(document.querySelector("#outlet")!);
   ```

5. **Add the router**, `src/app/router.ts` from the Example, with one `page(path, tag, () => import(module), params => props)` per route. Keep three things from it: the page module is imported before `document.createElement(tag)`, the route params are set as props, and `if (signal?.aborted) return;` comes after the import (limitation 3). If the app already has a router, keep it and call the same `mount()` from its route handler. With `universal-router` 10 (`npm i universal-router@10.0.3`) and the History API, keep the imports, `Tag`, `Params` and `mount()`, and replace `Route`, `page()`, `routes`, `loaded()`, `show()` and `startRouter()` with:

   ```ts
   import UniversalRouter from "universal-router";

   interface Match {
     tag: Tag;
     load: () => Promise<unknown>;
     props: object;
   }

   function page<K extends Tag>(path: string, tag: K, load: () => Promise<unknown>, props: (params: Params) => Partial<HTMLElementTagNameMap[K]> = () => ({})) {
     return { path, action: ({ params }: { params: Record<string, unknown> }): Match => ({ tag, load, props: props(params as Params) }) };
   }

   const router = new UniversalRouter<Match | null>(
     [
       page("/", "projects-page", () => import("../features/projects/projects-page.ts")),
       page("/projects/:id", "project-page", () => import("../features/projects/project-page.ts"), (p) => ({ projectId: p.id ?? "" })),
       page("/settings", "settings-page", () => import("../features/settings/settings-page.ts")),
     ],
     { errorHandler: () => null },
   );

   async function loaded(match: Match): Promise<boolean> {
     try {
       await match.load();
       return true;
     } catch {
       return false;
     }
   }

   export async function show(outlet: Element, url: string, signal?: AbortSignal): Promise<void> {
     const path = new URL(url).pathname;
     const match = await router.resolve(path);
     const ok = match != null && (await loaded(match));
     if (signal?.aborted) return;
     if (match && ok) mount(outlet, match.tag, match.props);
     else if (match) mount(outlet, "route-message", { heading: "This page could not be loaded", detail: "Check the connection and reload the page." });
     else mount(outlet, "route-message", { heading: "Page not found", detail: `Nothing lives at ${path}.` });
     currentPath.set(path);
   }

   let pending: AbortController | undefined;

   export function startRouter(outlet: Element): Promise<void> {
     const go = () => {
       pending?.abort();
       pending = new AbortController();
       return show(outlet, location.href, pending.signal);
     };
     document.addEventListener("click", (e) => {
       if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
       const a = e.target instanceof Element ? e.target.closest("a") : null;
       if (!a || a.target || a.hasAttribute("download") || a.origin !== location.origin) return;
       e.preventDefault();
       history.pushState(null, "", a.href);
       void go();
     });
     addEventListener("popstate", () => void go());
     return go();
   }
   ```

   `router.resolve()` returns `undefined` when an action returns nothing, so test the match with `!= null`. With this router, the example's unit tests and its end-to-end tests pass except the one for a browser without the Navigation API (links are always handled by the click handler) and the one that calls `navigation.navigate()`, which passes when it clicks a link instead; its browser router tests use the Navigation API and do not apply.

6. **Write each page as a component** in its feature folder: route params arrive as string props (`props: { projectId: "" }`), the page shows what an unknown id means, and it binds its stores in `connected()`. Everything a page must keep after the user leaves goes into a store: leaving removes the page, which ends its `bind` subscriptions, and coming back creates a new element.

7. **Put state at the lowest level that holds it** (the table in the guide): a component's `state` for what one component shows; a feature store (`src/features/<feature>/<feature>-store.ts`: `createStore` plus its actions as exported functions and a `seed...()` function that returns fresh initial data, for tests) for what a feature's pages share; an app-wide store in `src/shared/stores/` for what the shell or several features read. For an existing Zustand, Redux or nanostores store, follow `nativele-state-management`.

8. **Make shared components take props and emit events** only; they never import a feature or a feature store. The feature decides what an event means (`text-entry` emits `entry-submit`; the projects page adds a project, the project page a task).

9. **Add the tests** as in `nativele-testing`, with the patterns for tests next to the code:

   ```sh
   npm i -D vitest@5.1.0 happy-dom@21.0.4 @vitest/browser-playwright@5.1.0 playwright@1.64.1 @playwright/test@1.64.1
   ```

   - `src/**/*.test.ts` in happy-dom: store actions, components with props, events and stores, pages given their params as props, and the route table through `show()`.
   - `src/**/*.browser.test.ts` in Chrome: the router with the Navigation API, and moves and focus in reordered lists.
   - `e2e/*.spec.ts` with Playwright Test against `vite preview` of the build: deep links, navigation, back and forward, lazy chunks, data across pages.

10. **Set the scripts**:

    ```sh
    npm pkg set scripts.build="ts-dom check src && vite build"
    npm pkg set scripts.test="vitest run --project unit"
    npm pkg set scripts.test:browser="vitest run --project browser"
    npm pkg set scripts.test:e2e="playwright test"
    npm pkg set scripts.verify="npm run build && ts-dom doctor src && npm test && npm run test:browser && npm run test:e2e"
    ```

    Add `test-results` and `playwright-report` to `.gitignore`, next to `*.html.ts` and `ts-dom-tags.ts`.

## Example

The example project is a project tracker: a projects list (`/`), a project page with its tasks (`/projects/:id`) and a settings page (`/settings`).

```
index.html  package.json  tsconfig.json  vite.config.ts  playwright.config.ts
src/main.ts
src/app/router.ts  src/app/current-path.ts  src/app/app-nav.*  src/app/route-message.*  src/app/*.test.ts  src/app/router.browser.test.ts
src/shared/text-entry.*  src/shared/progress-meter.*  src/shared/text-entry.test.ts  src/shared/stores/preferences.ts
src/features/projects/projects-store.ts  projects-page.*  project-page.*  project-card.*  task-row.*  *.test.ts  project-page.browser.test.ts
src/features/settings/settings-page.*  settings-page.test.ts
e2e/app.spec.ts
```

The router (Navigation API and `URLPattern`, no dependency):

```ts
// src/app/router.ts
import { currentPath } from "./current-path.ts";
import "./route-message.ts";

type Tag = keyof HTMLElementTagNameMap;
type Params = Record<string, string | undefined>;

interface Route {
  pattern: URLPattern;
  tag: Tag;
  load: () => Promise<unknown>;
  props: (params: Params) => object;
}

function page<K extends Tag>(
  pathname: string,
  tag: K,
  load: () => Promise<unknown>,
  props: (params: Params) => Partial<HTMLElementTagNameMap[K]> = () => ({}),
): Route {
  return { pattern: new URLPattern({ pathname }), tag, load, props };
}

const routes: Route[] = [
  page("/", "projects-page", () => import("../features/projects/projects-page.ts")),
  page("/projects/:id", "project-page", () => import("../features/projects/project-page.ts"), (p) => ({ projectId: p.id ?? "" })),
  page("/settings", "settings-page", () => import("../features/settings/settings-page.ts")),
];

function mount<K extends Tag>(outlet: Element, tag: K, props: Partial<HTMLElementTagNameMap[K]>): void {
  const el = document.createElement(tag);
  Object.assign(el, props);
  outlet.replaceChildren(el);
}

async function loaded(route: Route): Promise<boolean> {
  try {
    await route.load();
    return true;
  } catch {
    return false;
  }
}

export async function show(outlet: Element, url: string, signal?: AbortSignal): Promise<void> {
  const route = routes.find((r) => r.pattern.test(url));
  const ok = route !== undefined && (await loaded(route));
  if (signal?.aborted) return;
  const path = new URL(url).pathname;
  if (route && ok) mount(outlet, route.tag, route.props(route.pattern.exec(url)?.pathname.groups ?? {}));
  else if (route) mount(outlet, "route-message", { heading: "This page could not be loaded", detail: "Check the connection and reload the page." });
  else mount(outlet, "route-message", { heading: "Page not found", detail: `Nothing lives at ${path}.` });
  currentPath.set(path);
}

export function startRouter(outlet: Element): Promise<void> {
  if ("navigation" in window) {
    navigation.addEventListener("navigate", (e) => {
      if (!e.canIntercept || e.hashChange || e.downloadRequest !== null || e.formData !== null) return;
      e.intercept({ handler: () => show(outlet, e.destination.url, e.signal) });
    });
  }
  return show(outlet, location.href);
}
```

```ts
// src/app/current-path.ts: an app store the router sets and the shell binds to mark the current link
import { createStore } from "@nativele/ts-dom";

export const currentPath = createStore(location.pathname);
```

`route-message` is a component with the props `heading` and `detail`. A wrong tag or prop in the route table is a `tsc` error, because the types come from `ts-dom-tags.ts`: `TS2345: Argument of type '"projects-pag"' is not assignable to parameter of type 'keyof HTMLElementTagNameMap'`, or `Type 'number' is not assignable to type 'string'` for `projectId`.

A feature store and a page of that feature:

```ts
// src/features/projects/projects-store.ts (abridged: the example adds addProject and more seed data)
import { createStore } from "@nativele/ts-dom";

export interface Project { id: string; name: string }
export interface Task { id: string; projectId: string; title: string; done: boolean }
export interface ProjectsState { projects: readonly Project[]; tasks: readonly Task[]; nextId: number }

export function seedProjects(): ProjectsState {
  return { projects: [{ id: "p1", name: "Website" }], tasks: [{ id: "t1", projectId: "p1", title: "Publish", done: false }], nextId: 2 };
}

export const projects = createStore<ProjectsState>(seedProjects());

export function addTask(projectId: string, title: string): void {
  projects.set((s) => ({ ...s, tasks: [...s.tasks, { id: `t${s.nextId}`, projectId, title, done: false }], nextId: s.nextId + 1 }));
}

export function toggleTask(id: string): void {
  projects.set((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }));
}

export function tasksOf(s: ProjectsState, projectId: string): readonly Task[] {
  return s.tasks.filter((t) => t.projectId === projectId);
}
```

```html
<!-- src/features/projects/project-page.html -->
<p><a href="/">All projects</a></p>
<section data-if="found">
  <h1>{{ name }}</h1>
  <progress-meter data-ref="meter"></progress-meter>
  <text-entry label="New task" action="Add task" data-on-entry-submit="onAdd"></text-entry>
  <ul>
    <template data-each="tasks" data-key="id" data-prop="task">
      <task-row role="listitem" data-on-task-toggle="onToggle"></task-row>
    </template>
  </ul>
  <p data-if="someHidden">{{ hiddenCount }} done tasks are hidden.</p>
</section>
<p data-if="missing">There is no project with this id.</p>
```

```ts
// src/features/projects/project-page.ts
import { Component, define } from "@nativele/ts-dom";
import type { DeepReadonly, EmitEvent, EventHit } from "@nativele/ts-dom";
import { preferences } from "../../shared/stores/preferences.ts";
import type { TextEntry } from "../../shared/text-entry.ts";
import { addTask, projects, tasksOf, toggleTask, type ProjectsState, type Task } from "./projects-store.ts";
import tpl from "./project-page.html.js";

type View = DeepReadonly<{ projectId: string; data: ProjectsState; showDone: boolean }>;

const project = (v: View) => v.data.projects.find((p) => p.id === v.projectId);
const all = (v: View) => tasksOf(v.data, v.projectId);
const visible = (v: View) => all(v).filter((t) => v.showDone || !t.done);

export class ProjectPage extends Component(tpl, {
  props: { projectId: "" },
  state: { data: { projects: [], tasks: [], nextId: 0 } as ProjectsState, showDone: true },
  derive: {
    found: (v) => project(v) !== undefined,
    missing: (v) => project(v) === undefined,
    name: (v) => project(v)?.name ?? "",
    tasks: (v) => [...visible(v)].sort((a, b) => Number(a.done) - Number(b.done)),
    doneCount: (v) => all(v).filter((t) => t.done).length,
    totalCount: (v) => all(v).length,
    hiddenCount: (v) => all(v).length - visible(v).length,
    someHidden: (v) => all(v).length > visible(v).length,
  },
}) {
  override connected(): void {
    this.bind(projects, (data) => this.set({ data }));
    this.bind(preferences, (p) => this.set({ showDone: p.showDone }));
  }

  onAdd(e: Event): void {
    addTask(this.props.projectId, (e as EmitEvent<TextEntry, "entry-submit">).detail.value);
  }

  onToggle(_e: Event, hit: EventHit<Task, "id">): void {
    toggleTask(hit.key);
  }

  override render(
    view: { tasks: readonly Task[]; doneCount: number; totalCount: number },
    changed: ReadonlySet<"tasks" | "doneCount" | "totalCount">,
  ): void {
    if (changed.has("tasks")) this.lists.tasks.items = view.tasks;
    if (changed.has("doneCount")) this.refs.meter.done = view.doneCount;
    if (changed.has("totalCount")) this.refs.meter.total = view.totalCount;
  }
}
define("project-page", ProjectPage);
```

`preferences` is the app-wide store (`createStore<Preferences>({ userName: "", showDone: true })` in `src/shared/stores/preferences.ts`), written by the settings page and read by the shell and this page. `text-entry` and `progress-meter` come from `src/shared/`; `task-row` is this feature's own item component. The page's template uses their tags, and the generated `project-page.html.ts` imports all three.

The configuration (the browser project and the Playwright config follow `nativele-testing`, with this project's ports):

```ts
// vite.config.ts
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { tsDom } from "@nativele/ts-dom/vite";

const chrome = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";

export default defineConfig({
  plugins: [tsDom({ dirs: ["src"] })],
  server: { port: 5481, strictPort: true },
  preview: { port: 4481, strictPort: true },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts"], exclude: ["src/**/*.browser.test.ts"], environment: "happy-dom" },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          api: { port: 63481, strictPort: true },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { executablePath: chrome, args: ["--no-sandbox", "--no-zygote", "--disable-gpu", "--disable-dev-shm-usage"] } }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
```

```ts
// playwright.config.ts: the build comes from npm run build, which verify runs first
import { defineConfig } from "@playwright/test";

const chrome = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:4481",
    launchOptions: { executablePath: chrome, args: ["--no-sandbox", "--no-zygote", "--disable-gpu", "--disable-dev-shm-usage"] },
  },
  webServer: { command: "npx vite preview", url: "http://localhost:4481" },
});
```

One test of each kind:

```ts
// src/features/projects/project-page.test.ts (happy-dom)
beforeEach(() => {
  projects.set(seedProjects());
  preferences.set(defaultPreferences);
});
afterEach(() => document.body.replaceChildren());

test("leaving the page ends its subscriptions: a removed page no longer renders on store changes", () => {
  const el = document.createElement("project-page");
  el.projectId = "p1";
  document.body.append(el);
  const render = vi.spyOn(ProjectPage.prototype, "render");
  preferences.set({ ...preferences.get(), showDone: false });
  expect(render).toHaveBeenCalledTimes(1);
  render.mockClear();
  el.remove();
  projects.set(seedProjects());
  preferences.set({ ...preferences.get(), showDone: true });
  expect(render).not.toHaveBeenCalled();
});
```

```ts
// src/app/router.browser.test.ts (Chrome)
const start = location.href;
const outlet = document.createElement("main");
document.body.append(outlet);
const ready = startRouter(outlet);

afterAll(() => navigation.navigate(start, { history: "replace" }).finished);

test("the Navigation API carries same-document navigations to the router", async () => {
  await ready;
  await navigation.navigate("/settings").finished;
  expect(outlet.firstElementChild?.localName).toBe("settings-page");
});
```

```ts
// e2e/app.spec.ts (Playwright Test, built app)
test("each page module is loaded only when its route is first shown", async ({ page }) => {
  const scripts: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.push(new URL(r.url()).pathname.replace(/-[\w-]{8}\.js$/, ".js"));
  });
  await page.goto("/settings");
  await expect(page.locator("#outlet h1")).toHaveText("Settings");
  expect(scripts.sort()).toEqual(["/assets/index.js", "/assets/settings-page.js"]);
});
```

## Known limitations

1. **Scan one folder.** Several folders work too (`dirs: ["src/shared", "src/features"]`): a template imports a child defined in any scanned folder, and a tag defined in two of them is `duplicate-define`. But every folder then needs to be named in `tsDom({ dirs })`, `ts-dom check`, `ts-dom doctor` and the tsconfig `include` alike, and a folder left out of one of them is silently not generated or not checked there. One folder, `src`, avoids that. A component outside every scanned folder is not imported automatically: import its module where it is used.
2. **Browser support.** The router needs `URLPattern`: without it the app stops at start-up with `URLPattern is not defined`. Without the Navigation API, `startRouter` attaches nothing, every link loads a new document, and the router renders the route at start-up (verified in Chrome with `navigation` removed). Only Chrome 148 was verified; check your target browsers, or use a History API router (step 5).
3. **Keep the abort check.** Without `if (signal?.aborted) return;` after the import, a page module that loads slowly mounts over the page of a later navigation, and the address bar and the page disagree. The example's end-to-end test delays a chunk to prove the check, for both routers.
4. **Every app path must return `index.html`.** Deep links and reloads (and every link, without the Navigation API) ask the server for the page's path. `vite dev` and `vite preview` answer with `index.html`; a production server must be set up the same way (not verified here).
5. **A page is a new element on every navigation.** Its `state` starts over, also on back and forward, and also between `/projects/p1` and `/projects/p2`. Keep what must survive in a store.
6. **Feature stores live as long as the document.** A store created in a lazily loaded module is created on the first visit to the feature and kept until a reload; reset it in tests with `store.set(seed())` in `beforeEach`.
7. **happy-dom has no Navigation API and no `moveBefore`.** A test that uses `navigation` fails there with `ReferenceError: navigation is not defined`, and a reordered list item runs `disconnected()` and loses focus where Chrome keeps both. Put them in `*.browser.test.ts`; the route table can still be tested in happy-dom through `show()`.
8. Not verified: routers other than the two in step 5, nested routes and layouts, route guards, query strings and hashes as props (the `URLPattern` here matches the path only), scroll restoration and focus after a navigation, server-side rendering, browsers other than Chrome, production servers, and oxlint with tests next to the components (the `ts-dom/unused-markup` rule counts only the component's own class, see `nativele-testing`).

## Verify

Run in the project:

```sh
npm run build              # expect: ts-dom check: no issues, then ✓ built, with one chunk per page module
npx ts-dom doctor src      # expect: ts-dom doctor: the set-up looks right (info lines are suggestions)
npm test                   # expect: every src/**/*.test.ts passes in happy-dom
npm run test:browser       # expect: every src/**/*.browser.test.ts passes in headless Chrome
npm run test:e2e           # expect: every e2e spec passes against vite preview on the built app
```

The example project's `npm run verify` runs exactly these, from a clean checkout with nothing generated; its output (the `info` lines left out):

```
ts-dom check: no issues
dist/index.html                         0.49 kB
dist/assets/settings-page-CdmdUBHw.js   0.72 kB
dist/assets/projects-page-C9cYN-pF.js   1.20 kB
dist/assets/text-entry-C1mgKfH1.js      1.54 kB
dist/assets/project-page-CqUTMG_P.js    1.98 kB
dist/assets/index-B8nptlG1.js          21.00 kB
✓ built in 100ms
ts-dom doctor: the set-up looks right
 Test Files  7 passed (7)
      Tests  19 passed (19)
 Test Files  2 passed (2)
      Tests  4 passed (4)
  8 passed (3.9s)
```

The end-to-end tests cover: a deep link, links without a new document and a store keeping data across pages, the app-wide store reaching the shell and another feature, page chunks loaded on demand, a superseded navigation, a page chunk that fails to load, an unknown path, and a browser without the Navigation API.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A shared component's tag stays empty on a page, with no error from `check`, `doctor`, `lint` or the build | the component is defined outside every scanned folder, so the generated module does not import it | scan the folder that holds it (`tsDom({ dirs: ["src"] })`, `ts-dom check src`), or import the component's module yourself |
| `TS2307: Cannot find module './x.js'` in `src/nv/ts-dom-tags.ts` after moving components | a `ts-dom-tags.ts` left in the folder that was scanned before | delete it; only `src/ts-dom-tags.ts` is generated now |
| `[duplicate-define] the tag <x> is defined more than once` after merging folders into one scan | two features define the same tag | rename one; tags share one registry |
| The page of an earlier link appears after a later one, and the address bar shows the later URL | the abort check after the import is missing | `if (signal?.aborted) return;` after `await` in `show()` |
| `URLPattern is not defined` at start-up | the browser has no `URLPattern` | use a History API router (step 5) for those browsers |
| `ReferenceError: navigation is not defined` in a Vitest test | the test runs in happy-dom | rename it `*.browser.test.ts`, or test `show()` instead |
| 404 on a reload or a deep link in production | the server does not answer app paths with `index.html` | configure the server's fallback to `index.html` |
| `TS2345: ... is not assignable to parameter of type 'keyof HTMLElementTagNameMap'` in the route table | the tag is misspelled | use the tag the page module passes to `define()` |
| `TS2345: ... has no properties in common with type 'Partial<...>'` in the route table | the props function names a prop the page does not declare | use the page's prop name |

## See also

- Why the layout, the routing contract and the state levels: https://github.com/Pixmi/nativele/blob/main/docs/architecture.md
- `bind`, `createStore`, props and events: https://github.com/Pixmi/nativele/blob/main/docs/components.md
- Lists of item components (`data-key`, `data-prop`) and moving items: https://github.com/Pixmi/nativele/blob/main/docs/lists.md
- What `ts-dom check`, `doctor` and `gen` check and write: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#checks
- Setting up Vite: `npx ts-dom skills nativele-vite`
- State libraries through `bind`: `npx ts-dom skills nativele-state-management`
- Writing the tests: `npx ts-dom skills nativele-testing`
