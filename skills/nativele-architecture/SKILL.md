---
name: nativele-architecture
description: "Lay out an app built with Nativele that has several pages: feature folders with their components, stores and tests, shared components and app-wide stores, pages as custom elements that a router mounts (the Navigation API with URLPattern, or universal-router), lazy-loaded page modules, one scanned folder for the generated files, and which behavior goes to unit, real-browser and end-to-end tests. Use when starting such an app or restructuring one, or when a project depends on @nativele/ts-dom and universal-router."
metadata:
  tier: official
  nativele: ">=0.7.0 <0.8.0"
  verified: "2026-11-07"
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

`npx ts-dom skills` lists this Skill with "This project depends on universal-router." when the project has that dependency. The recommended router needs no dependency, so nothing else in `package.json` tells a multi-page app from a single widget.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.7.0 (the last agent trial) |
| vite | 8.3.6 |
| typescript | 7.0.2 |
| create-vite (`vanilla-ts` template, the starting point) | 9.3.4 |
| vitest | 5.1.0 |
| happy-dom | 21.0.4 |
| @vitest/browser-playwright | 5.1.0 |
| playwright | 1.64.1 (drives the installed Chrome; no browser is downloaded) |
| @playwright/test | 1.64.1 |
| universal-router | 10.0.3 (checked by hand with the same tests as the Navigation API router, see step 5) |

Verified on 2026-11-07 with Node 24 and Google Chrome 157. The router relies on the Navigation API and `URLPattern`, verified in Chrome only. With another major version of any tool above, treat every step as unverified.

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

   When restructuring an existing app:

   - Move each page component, and the components only it uses, into its feature folder.
   - Move each component used by two features into `src/shared/`, and the header or navigation into `src/app/`.
   - Fix the relative `import` paths in the `.ts` files. Templates need no change, because the import of a child component is generated. `ts-dom check src` (step 2) reports a path you missed as `TS2307`.
   - A feature never imports another feature: move what both need to `src/shared/`.

2. **Scan one folder, `src`, everywhere**: `tsDom({ dirs: ["src"] })` in `vite.config.ts`, and `ts-dom check src` and `ts-dom doctor src` in every script and command.

   - One folder gives one `ts-dom-tags.ts` and one argument for every command (limitation 1).
   - When the app scanned another folder before (`src/nv` from `nativele-vite`), delete the `ts-dom-tags.ts` left in it, and the folder itself once its components have moved (Troubleshooting).

3. **Make the tsconfig cover `src` and `e2e`** (`"include": ["src", "e2e"]` in the trial), with the TypeScript Skill (`npx ts-dom skills nativele-typescript`). `ts-dom check src` then type-checks the app, the tests next to the code, `ts-dom-tags.ts` and the end-to-end specs.

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

5. **Add the router**: `src/app/router.ts` from the Example, with one `page(path, tag, () => import(module), params => props)` per route.

   - Keep three things from it: the page module is imported before `document.createElement(tag)`, the route params are set as props, and `if (signal?.aborted) return;` comes after the import (limitation 3).
   - If the app already has a router, keep it and call the same `mount()` from its route handler.
   - With `universal-router` 10 (`npm i universal-router@10.0.3`) and the History API, keep the imports, `Tag`, `Params` and `mount()`, and replace `Route`, `page()`, `routes`, `loaded()`, `show()` and `startRouter()` with the code below.

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

   `router.resolve()` returns `undefined` when an action returns nothing, so test the match with `!= null`.

   With this router, the same unit and end-to-end tests pass, with these exceptions:

   - The end-to-end test for a browser without the Navigation API does not apply: the click handler always handles links.
   - The end-to-end test that calls `navigation.navigate()` passes when it clicks a link instead.
   - The browser router tests use the Navigation API and do not apply.

6. **Write each page as a component** in its feature folder.

   - Route params arrive as string props (`props: { projectId: "" }`), and the page shows what an unknown id means.
   - The page binds its stores in `connected()`.
   - Everything a page must keep after the user leaves goes into a store: leaving removes the page and ends its `bind` subscriptions, and coming back creates a new element (limitation 5).

7. **Put state at the lowest level that holds it.** The levels, their lifetimes and the reasons are in the guide: https://github.com/Pixmi/nativele/blob/main/docs/architecture.md#where-state-lives

   - What one component shows goes in its `state`.
   - What a feature's pages share goes in a feature store, `src/features/<feature>/<feature>-store.ts`. It exports the `createStore`, its actions as functions, and a `seed...()` function that returns fresh initial data for tests.
   - What the shell or several features read goes in an app-wide store in `src/shared/stores/`.
   - For an existing Zustand, Redux or nanostores store, follow `nativele-state-management`.

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

    - The build script is the one `nativele-vite` sets up, with `src` as the folder. A framework project keeps its own build script from the framework's Skill.
    - Add `test-results` and `playwright-report` to `.gitignore`, next to `*.html.ts` and `ts-dom-tags.ts`.
    - CI runs these scripts from a clean checkout. What its job needs beyond them, such as a Chromium-based browser for the browser and end-to-end tests, is in `npx ts-dom skills nativele-ci`.

## Example

A project tracker: a projects list (`/`), a project page with its tasks (`/projects/:id`) and a settings page (`/settings`). Everything below is enough to build the same layout.

```
index.html  package.json  tsconfig.json  vite.config.ts  playwright.config.ts
src/main.ts
src/app/router.ts  src/app/current-path.ts  src/app/app-nav.*  src/app/route-message.*  src/app/*.test.ts  src/app/router.browser.test.ts
src/shared/text-entry.*  src/shared/progress-meter.*  src/shared/text-entry.test.ts  src/shared/stores/preferences.ts
src/features/projects/projects-store.ts  projects-page.*  project-page.*  project-card.*  task-row.*  *.test.ts  project-page.browser.test.ts
src/features/settings/settings-page.*  settings-page.test.ts
e2e/app.spec.ts
```

The small components the code below uses, by their interface (write them like any component, with the core Skill):

| Component | Folder | Props | Events |
|---|---|---|---|
| `text-entry` | `src/shared/` | `label`, `action` (strings) | `entry-submit` with `{ value: string }` |
| `progress-meter` | `src/shared/` | `done`, `total` (numbers) | none |
| `task-row` | `src/features/projects/` | `task` (a `Task`) | `task-toggle`, no data |
| `route-message` | `src/app/` | `heading`, `detail` (strings) | none |
| `app-nav` | `src/app/` | none; it binds `currentPath` and `preferences` to mark the current link and show the user name | none |

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
// src/features/projects/projects-store.ts
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

  onAdd(e: EmitEvent<TextEntry, "entry-submit">): void {
    addTask(this.props.projectId, e.detail.value);
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

`preferences` is the app-wide store in `src/shared/stores/preferences.ts`: `createStore<Preferences>({ userName: "", showDone: true })`. The settings page writes it; the shell and this page read it.

`text-entry` and `progress-meter` come from `src/shared/`, and `task-row` is this feature's own item component. The page's template uses their tags, and the generated `project-page.html.ts` imports all three.

The configuration is the one in `nativele-testing` (`npx ts-dom skills nativele-testing`, steps 2, 5 and 6), with these differences:

| Setting | In `nativele-testing` | In this app |
|---|---|---|
| `tsDom({ dirs })` | `["src/nv"]` | `["src"]` |
| `include` of the `unit` project | `test/**/*.test.ts` | `src/**/*.test.ts` |
| `exclude` of the `unit` project | `test/**/*.browser.test.ts` | `src/**/*.browser.test.ts` |
| `include` of the `browser` project | `test/**/*.browser.test.ts` | `src/**/*.browser.test.ts` |
| `api.port` of the `browser` project | `63432` | `63481` |
| Ports in `vite.config.ts` | none | `server: { port: 5481, strictPort: true }`, `preview: { port: 4481, strictPort: true }` |
| Playwright `baseURL` and `webServer.url` | `http://localhost:4432` | `http://localhost:4481` |
| Playwright `webServer.command` | `npm run build && npx vite preview --port 4432 --strictPort` | `npx vite preview`, because `verify` runs `npm run build` first |

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

1. **Scan one folder.** Keep `src` as the only folder in `tsDom({ dirs })`, `ts-dom check`, `ts-dom doctor` and the tsconfig `include`. Why several folders are fragile: https://github.com/Pixmi/nativele/blob/main/docs/architecture.md#generated-files-checks-and-tsconfig
   - A component outside every scanned folder is not imported automatically: import its module where it is used.
   - A component from another package of a workspace is imported from that package, not scanned (`npx ts-dom skills nativele-monorepo`).
2. **Browser support.** Check your target browsers: the router needs `URLPattern`, and uses the Navigation API when the browser has it. It was verified in Chrome only. For other browsers, use a History API router (step 5). What happens without each API: https://github.com/Pixmi/nativele/blob/main/docs/architecture.md#pages-and-routing
3. **Keep the abort check.** Keep `if (signal?.aborted) return;` after the import in `show()`; why: https://github.com/Pixmi/nativele/blob/main/docs/architecture.md#pages-and-routing. To prove it in a test, delay one page's chunk and navigate twice: the second page must stay.
4. **Every app path must return `index.html`.** Set the production server up to answer every app path with `index.html`, as `vite dev` and `vite preview` do. A production server was not verified here.
5. **A page is a new element on every navigation.** Keep what must survive a navigation in a store. This also holds for back and forward, and between `/projects/p1` and `/projects/p2`.
6. **Feature stores live as long as the document.** A store created in a lazily loaded module is created on the first visit to the feature and kept until a reload; reset it in tests with `store.set(seed())` in `beforeEach`.
7. **happy-dom has no Navigation API and no `moveBefore`.** Put tests that use `navigation`, or that move list items and check focus, in `*.browser.test.ts`. Test the route table in happy-dom through `show()`. What a DOM shim lacks is in `nativele-testing` (limitation 1).
8. Not verified:
   - routers other than the two in step 5, nested routes and layouts, and route guards;
   - query strings and hashes as props (the `URLPattern` here matches the path only);
   - scroll restoration and focus after a navigation, and server-side rendering;
   - browsers other than Chrome, and production servers;
   - a linter with tests next to the components. The `ts-dom/unused-markup` rule counts only the component's own class; test files in the linter are covered by `nativele-linting`.

## Verify

Run in the project:

```sh
npm run build              # expect: ts-dom check: no issues, then ✓ built, with one chunk per page module
npx ts-dom doctor src      # expect: ts-dom doctor: the set-up looks right
npm test                   # expect: every src/**/*.test.ts passes in happy-dom
npm run test:browser       # expect: every src/**/*.browser.test.ts passes in headless Chrome
npm run test:e2e           # expect: every e2e spec passes against vite preview on the built app
```

They pass the same way from a clean checkout with nothing generated, as CI runs them (`nativele-ci`).

The end-to-end tests cover: a deep link, links without a new document and a store keeping data across pages, the app-wide store reaching the shell and another feature, page chunks loaded on demand, a superseded navigation, a page chunk that fails to load, an unknown path, and a browser without the Navigation API.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| A shared component's tag stays empty on a page, with no error from `check`, `doctor`, `lint` or the build | the component is defined outside every scanned folder, so the generated module does not import it | scan the folder that holds it, or import its module yourself (limitation 1) |
| `TS2307: Cannot find module './x.js'` in `src/nv/ts-dom-tags.ts` after moving components | a `ts-dom-tags.ts` left in the folder that was scanned before | delete it, and the old folder once it is empty |
| `[duplicate-define] The tag <x> is defined more than once in the scanned folders` after merging folders into one scan | two features define the same tag with different classes | rename one; tags share one registry |
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
- The tsconfig: https://github.com/Pixmi/nativele/blob/main/skills/nativele-typescript/SKILL.md
- CI: https://github.com/Pixmi/nativele/blob/main/skills/nativele-ci/SKILL.md
- Components shared between packages of a workspace: https://github.com/Pixmi/nativele/blob/main/skills/nativele-monorepo/SKILL.md
