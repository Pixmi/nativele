# Application architecture

Part of the [Nativele](../README.md) documentation.

Nativele provides components. An application also needs a router, shared data, data loading and tests, and those come from other tools or from a few lines of your own code. This guide shows how to lay out a medium to large app so that the pieces stay apart and the checks keep working as it grows. Everything here is taken from the example project of the [architecture Skill](../skills/nativele-architecture/SKILL.md) (`skills/nativele-architecture/example`), a small project tracker (a list of projects, a project page with its tasks, a settings page) built with Vite, whose layout, routing and stores are checked by tests in happy-dom, in Chrome and against the built app.

## Folders by feature

Group the code by feature, not by kind of file:

```
index.html                    # the shell's tags and the outlet the router fills
src/
  main.ts                     # imports the shell and starts the router
  app/                        # knows every feature: the router, the shell, app-level stores
    router.ts  current-path.ts  app-nav.html  app-nav.ts  route-message.html  route-message.ts
  shared/                     # knows no feature
    text-entry.html  text-entry.ts  progress-meter.html  progress-meter.ts
    stores/preferences.ts     # an app-wide store
  features/
    projects/                 # one feature: its pages, its components, its store, its tests
      projects-page.*  project-page.*  project-card.*  task-row.*
      projects-store.ts
      projects-store.test.ts  projects-page.test.ts  project-page.test.ts  project-page.browser.test.ts
    settings/
      settings-page.html  settings-page.ts  settings-page.test.ts
  ts-dom-tags.ts              # generated
e2e/
  app.spec.ts                 # tests of the built app
```

- **A feature folder** holds what changes together: its page components, the components only it uses (`project-card`, `task-row`), its store, and the tests of all of them, next to the code.
- **`shared/`** holds what several features use. A shared component's interface is its props and its events: `text-entry` takes `label` and `action` and emits `entry-submit` with the text, and the projects list and the project page each decide what that text becomes. It imports no feature and no feature store, so any feature can place it. App-wide stores live in `shared/stores/`.
- **`app/`** is the only code that knows every feature: the router's route table, the shell (`app-nav`), and stores that belong to the app itself, such as the current path.
- **Imports go one way**: `app` → `features` → `shared`. A feature does not import another feature; when two features need the same component or store, move it to `shared/`. Kept this way, a feature's page modules pull in only that feature and `shared/`: in the example, opening the settings page loads the main chunk and the settings page's chunk, nothing of the projects feature.
- **A template uses another component by its tag**, in any of these folders. `ts-dom gen` adds the import of the module that defines the tag to the generated `x.html.ts` (`import "../../shared/text-entry.js"` in `project-page.html.ts`), so a page module brings its components with it. This works across folders only inside one scanned folder (see [Generated files, checks and tsconfig](#generated-files-checks-and-tsconfig)).
- **One registry**: every tag in the app shares one custom element registry. `ts-dom check` reports a tag defined twice in the scanned folders as `duplicate-define`: the first `define()` to run wins and the other is skipped without an error. Names that say their feature (`project-card`, `task-row`) keep tags apart as the app grows.

## Pages and routing

Nativele has no router. A page is a component like any other, the router is code you choose, and the two meet at a small contract:

1. A route maps a URL pattern to a page tag and a function that imports the page's module.
2. On navigation, the router awaits that import, which runs the module's `define()`. It then creates the element with `document.createElement(tag)`, sets the route params as props, and replaces the content of the outlet with it.
3. If another navigation started while the import was still loading, it mounts nothing.

The example's router uses the browser's Navigation API and `URLPattern`, with no dependency:

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

```html
<!-- index.html (body) -->
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

What each part does, as the example's tests show:

- **Lazy pages**: each `import()` becomes its own chunk in the build, and a page's chunk is requested only when its route is first shown. The route table names pages by tag, and `Partial<HTMLElementTagNameMap[K]>` types their props through the generated `ts-dom-tags.ts`, which imports the page classes as types only: `tsc` checks `projectId` against the page's props, and the page module stays out of the main chunk.
- **Define before mounting**: the page module calls `define()` when it is imported, so once `load()` has resolved, `document.createElement(tag)` returns the page's class, and the props set on it are typed properties.
- **Route params are props**: URL params are strings, so the page declares them as string props (`props: { projectId: "" }`) and decides itself what an unknown id shows. Each navigation creates a new page element.
- **Leaving a page**: `replaceChildren` removes the old page, and removal ends every `bind`, `on` and `onCleanup` it registered: a removed page no longer renders when its stores change. A page bound in `connected()` that is shown again is a new element and starts from the stores' current values. Data that must outlive a page therefore belongs in a store, not in the page's `state`.
- **Superseded navigations**: without the `signal.aborted` check, a slow page module that finishes loading after the user has gone on mounts over the newer page while the address bar shows the newer URL.
- **A failed import** (a chunk that cannot be fetched) shows a message in the outlet instead of leaving the old page under the new URL.
- **What the Navigation API handles**: clicks on links, back and forward, and `navigation.navigate()` all arrive as `navigate` events, with no click handler of your own, and a modifier-click still opens a new tab.
- **Without the Navigation API**, `startRouter` attaches nothing: links load the next document, and the router renders the route at start-up. `URLPattern` has no such fallback: a browser without it stops at start-up with `URLPattern is not defined`. The example was verified in Chrome only.
- **The server** must answer every app path with `index.html` (deep links, reloads, and every link when the Navigation API is missing). `vite dev` and `vite preview` do this; configure the production server the same way.

The app shell shows the current section from a store that the router sets (`currentPath`), so the shell needs no props from the pages.

A router library works with the same contract: call `show()` from its route handler, or resolve the route with it and keep `mount()` and the abort check. A History API router does not intercept links, so it needs a click handler and a `popstate` listener of its own; the architecture Skill shows one with `universal-router`.

## Where state lives

| The data is | It lives in | Its lifetime | In the example |
|---|---|---|---|
| shown and changed by one component, or by it and the children it passes props to | the component's `state` (and `derive`) | the element: gone when the page is left | the settings page's "Saved." flag; the project page's sorted, filtered tasks (derived) |
| shared by the pages and components of one feature | a feature store: `createStore` in the feature folder, with its actions as functions | the module: created when the feature is first loaded, kept until the document is reloaded | `features/projects/projects-store.ts`: projects and tasks |
| read by the shell or by several features | an app-wide store in `shared/stores/` (or `app/` when only the app uses it) | the session | `preferences` (user name, show done tasks); `currentPath` |
| already kept in Zustand, Redux, nanostores or another library, shared with code that is not Nativele, or in need of a library's middleware, devtools or persistence | that library's store, connected through `bind` | the library's | see the [state management Skill](../skills/nativele-state-management/SKILL.md) |

- A store module exports the store and its actions (`addProject`, `addTask`, `toggleTask`) as plain functions. Components call the actions from their `data-on-*` handlers and `bind` the store in `connected()`; tests call the same actions with no element at all.
- Props cross one layer: the projects page gives each `project-card` its summary through `data-prop`. Data that a deeper component or another feature needs comes from a store, which is how the settings page's "show done tasks" reaches the project page without a prop on the way.
- Update stores immutably (`{ ...task, done: true }`): lists and child props compare items by reference ([Lists](lists.md#items-as-components-items--)).
- Data from a server enters through a store module too: [Loading and error states](recipes.md#loading-and-error-states) shows the status, the error and the retry; a data library such as TanStack Query has its own Skill (`npx ts-dom skills nativele-tanstack-query`).

The rules for `state`, `set`, `bind` and `createStore` are in [Components](components.md#data-and-view-state-optional) and [Shared stores](components.md#avoiding-layer-by-layer-passing-lint-ts-domdata-flow).

## Testing

Each kind of behavior goes to the cheapest test that can show it:

| Test | Tool | What goes there | In the example |
|---|---|---|---|
| Unit and component tests, next to the code (`*.test.ts`) | Vitest with happy-dom | store actions; components with their props, events and stores; a page given a route param as a prop; that a removed page no longer renders on store changes; the route table through `show()` (matching, props, not found, an aborted navigation) | 7 files, 19 tests, about half a second |
| Real-browser tests (`*.browser.test.ts`) | Vitest browser mode in headless Chrome | what a DOM shim does not have: the Navigation API (happy-dom has no `navigation`), `moveBefore` (a reordered list item stays connected and keeps focus), and styles, layout and real input | the router with `navigation.navigate()`, link clicks, back and forward; a task that moves to the end of the list keeps focus |
| End-to-end tests (`e2e/`) | Playwright Test against the built app on `vite preview` | what only the whole app shows: deep links, navigation without a new document, back and forward, page chunks loaded on demand, a store keeping data across pages, an app-wide store reaching another feature, a superseded or failed page load, the fallback without the Navigation API | 8 tests |

- Reset every store a test touches in `beforeEach` (`projects.set(seedProjects())`), and empty the document in `afterEach`: each test file shares one document, one registry and its module-level stores.
- Import a component's module for its side effect (`import "./project-page.ts"`) before creating its element; a page's own components come with it through its template.
- Test files next to the code need the test runner's patterns to match them: `include: ["src/**/*.test.ts"]` with `exclude: ["src/**/*.browser.test.ts"]` for happy-dom, and `include: ["src/**/*.browser.test.ts"]` for the browser project.

How to write each kind of test, the Vitest and Playwright configuration, and what happy-dom gets wrong are in the [testing Skill](../skills/nativele-testing/SKILL.md).

## Generated files, checks and tsconfig

- **Scan one folder that holds `app/`, `shared/` and `features/`**, and give the same folder to everything: `tsDom({ dirs: ["src"] })` in `vite.config.ts`, `ts-dom check src`, `ts-dom doctor src`. There is then one `src/ts-dom-tags.ts`, and an `x.html.ts` next to every template.
- **Why one folder**: several scanned folders work too (`dirs: ["src/shared", "src/features"]`): a template imports a child component defined in any of them, and a tag defined in two of them is reported as `duplicate-define`. But each folder must then be named the same way in `tsDom({ dirs })`, every `ts-dom check` and `ts-dom doctor` call and the tsconfig `include`, and a folder missing from one of them is silently not generated or not checked there. One folder that holds everything gives one `ts-dom-tags.ts` and one argument everywhere. A component outside every scanned folder (another package, for example) is not imported automatically: import its module where it is used.
- **Tests inside `src/`** are scanned too; that changes nothing, because they define no components.
- **`tsconfig.json`** includes `src` (the app, the colocated tests and `ts-dom-tags.ts`) and `e2e`, so `ts-dom check src`, which runs the project's `tsc` over the whole program, type-checks the tests and the end-to-end specs as well: `"include": ["src", "e2e"]`.
- **The generated files** (`*.html.ts`, `ts-dom-tags.ts`) are not committed. `ts-dom check src` writes them before it type-checks, removes an `x.html.ts` whose template is gone, and the Vite plugin writes them when Vite or Vitest starts, so a clean checkout builds and tests with nothing generated. When the scanned folder changes (from `src/nv` to `src`, for example), delete the `ts-dom-tags.ts` left in the old folder: nothing regenerates it, and once its components have moved, `tsc` reports its imports as `TS2307`.
- **Scripts**: `"build": "ts-dom check src && vite build"`, so a build type-checks first; neither `vite build` nor Vitest type-checks.

Setting up Vite and the plugin is in the [Vite Skill](../skills/nativele-vite/SKILL.md); what each check does is in [Setup, checks and lint](tooling.md#checks).
