---
name: nativele-tanstack-query
description: "Fetch server data with TanStack Query (@tanstack/query-core) and show it in Nativele components: an adapter from QueryObserver and MutationObserver to bind, loading, error and refetching states with data-if, lists with data-each, query keys from props, unsubscribing on removal, and mutations with invalidation. Use when a project depends on @tanstack/query-core and @nativele/ts-dom."
metadata:
  tier: experimental
  nativele: ">=0.5.2 <0.6.0"
  verified: "2026-11-05"
  tools: "@tanstack/query-core@5.106.1 vite@8.3.6 typescript@7.0.2 create-vite@9.3.4"
  author: "Nativele maintainers"
  detects: "@tanstack/query-core"
---

# Nativele + TanStack Query

## When to use

- An app that already uses Nativele (`@nativele/ts-dom`) and fetches server data with TanStack Query's framework-agnostic core, `@tanstack/query-core`: caching, deduplication, refetching and mutations, shown in Nativele components.
- Signals: `@tanstack/query-core` and `@nativele/ts-dom` in `package.json`, components that call `fetch` in `connected()` and keep their own loading flags.
- Not for the framework packages (`@tanstack/react-query`, `@tanstack/vue-query`, ...): their hooks belong to their framework; this Skill was verified only with `query-core`.
- Not a guide to TanStack Query itself (query keys, `staleTime`, cache design): use its own documentation. Not for writing the components themselves: use `nativele-core` (`npx ts-dom skills add nativele-core`).

`bind` accepts any object with `get()` and `subscribe(fn)` that returns an unsubscribe function. `QueryObserver` and `MutationObserver` have `getCurrentResult()` and `subscribe(fn)`, so a three-line adapter connects them; Nativele needs nothing else.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.5.2 (the last agent trial) |
| @tanstack/query-core | 5.106.1 |
| vite | 8.3.6 |
| typescript | 7.0.2 |
| create-vite (`vanilla-ts` template, the starting point) | 9.3.4 |

Verified on 2026-11-05 in Google Chrome 148 against the Vite dev server, in an app made with `npm create vite@latest -- --template vanilla-ts` and set up with the `nativele-vite` Skill, with a local mock API and Playwright 1.64 holding, failing and counting requests. With a different major version of TanStack Query, treat every step as unverified.

## Set-up

Starting from a Vite app with Nativele already set up (`npx ts-dom skills nativele-vite`: `strict`, the `tsDom({ dirs: ["src/nv"] })` plugin, `"build": "ts-dom check src/nv && vite build"`):

1. `npm i @tanstack/query-core`.
2. Create one `QueryClient` for the whole app in its own module, call `mount()` once, and add the adapter next to it:

   ```ts
   // src/query.ts
   import { QueryClient } from "@tanstack/query-core";
   import type { ReadableStore } from "@nativele/ts-dom";

   export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
   queryClient.mount();

   export function observe<R>(observer: { getCurrentResult(): R; subscribe(fn: (result: R) => void): () => void }): ReadableStore<R> {
     return { get: () => observer.getCurrentResult(), subscribe: (fn) => observer.subscribe(fn) };
   }
   ```

   The app owns the client; components import it and never create their own. One client is one cache, so two components that ask for the same key share one request. Without `mount()`, the client does not refetch when the window regains focus or the network comes back (limitation 5). `retry: false` is a choice for this example, not a requirement (limitation 6).

3. In each component that shows a query, create the observer as a private field, `bind` it in `connected()`, and copy what the template shows into `state` (Example). `bind` calls the callback once with the current result, then on every change, and unsubscribes when the element is removed.
4. When the query depends on a prop, build the options from the prop in a function and call `setOptions` in `render` when the prop changed (the `user-detail` component in Example).
5. For a write, create a `MutationObserver` as a field the same way, call `mutate` from a `data-on-*` handler, invalidate the affected keys in `onSuccess`, and `bind` the mutation observer for its pending and error state.

## Example

Request helpers (your API; the paths are the app's own):

```ts
// src/api.ts
export interface User {
  id: number;
  name: string;
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}
```

A list with a fixed key, and a mutation that invalidates it:

```html
<!-- src/nv/user-list.html -->
<p data-if="loading">Loading users...</p>
<p role="alert" data-if="failed">Could not load: {{ error }}</p>
<p data-if="refetching">Refreshing...</p>
<ul>
  <template data-each="users">
    <li>{{ name }}</li>
  </template>
</ul>
<input data-ref="newName" aria-label="New user" />
<button type="button" data-on-click="add">Add</button>
<span data-if="saving">Saving...</span>
<p role="alert" data-if="saveFailed">Could not save: {{ saveError }}</p>
```

```ts
// src/nv/user-list.ts
import { MutationObserver, QueryObserver } from "@tanstack/query-core";
import { Component, define } from "@nativele/ts-dom";
import { getJson, postJson, type User } from "../api.ts";
import { observe, queryClient } from "../query.ts";
import tpl from "./user-list.html.js";

export class UserList extends Component(tpl, {
  state: { status: "pending", fetching: false, error: "", users: [] as readonly User[], saving: false, saveError: "" },
  derive: {
    loading: (s) => s.status === "pending",
    failed: (s) => s.status === "error",
    refetching: (s) => s.status === "success" && s.fetching,
    saveFailed: (s) => s.saveError !== "",
  },
}) {
  #users = new QueryObserver(queryClient, {
    queryKey: ["users"],
    queryFn: ({ signal }) => getJson<User[]>("/api/users", signal),
  });
  #addUser = new MutationObserver(queryClient, {
    mutationFn: (name: string) => postJson<User>("/api/users", { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  override connected(): void {
    this.bind(observe(this.#users), (r) =>
      this.set({ status: r.status, fetching: r.isFetching, error: r.error?.message ?? "", users: r.data ?? [] }),
    );
    this.bind(observe(this.#addUser), (m) => this.set({ saving: m.isPending, saveError: m.error?.message ?? "" }));
  }

  add(): void {
    const name = this.refs.newName.value.trim();
    if (!name) return;
    this.#addUser.mutate(name).then(() => (this.refs.newName.value = ""), () => {});
  }

  override render(view: { users: readonly User[] }, changed: ReadonlySet<"users">): void {
    if (changed.has("users")) this.lists.users.replace(view.users, (u) => u.id, (u, { text }) => (text.name = u.name));
  }
}
define("user-list", UserList);
```

A detail whose query key comes from a prop:

```html
<!-- src/nv/user-detail.html -->
<p data-if="loading">Loading user {{ userId }}...</p>
<p role="alert" data-if="failed">Could not load user {{ userId }}: {{ error }}</p>
<h2 data-if="ready">{{ name }}</h2>
<small data-if="refetching">Refreshing...</small>
```

```ts
// src/nv/user-detail.ts
import { QueryObserver } from "@tanstack/query-core";
import { Component, define } from "@nativele/ts-dom";
import { getJson, type User } from "../api.ts";
import { observe, queryClient } from "../query.ts";
import tpl from "./user-detail.html.js";

const userQuery = (id: number) => ({
  queryKey: ["user", id],
  queryFn: ({ signal }: { signal: AbortSignal }) => getJson<User>(`/api/users/${id}`, signal),
  enabled: id > 0,
});

export class UserDetail extends Component(tpl, {
  props: { userId: 0 },
  state: { status: "pending", fetching: false, error: "", name: "" },
  derive: {
    loading: (s) => s.status === "pending",
    failed: (s) => s.status === "error",
    ready: (s) => s.status === "success",
    refetching: (s) => s.status === "success" && s.fetching,
  },
}) {
  #user = new QueryObserver(queryClient, userQuery(0));

  override connected(): void {
    this.bind(observe(this.#user), (r) =>
      this.set({ status: r.status, fetching: r.isFetching, error: r.error?.message ?? "", name: r.data?.name ?? "" }),
    );
  }

  override render(view: { userId: number }, changed: ReadonlySet<"userId">): void {
    if (changed.has("userId")) this.#user.setOptions(userQuery(view.userId));
  }
}
define("user-detail", UserDetail);
```

The parent passes the prop, can remove the detail, and refreshes everything:

```html
<!-- src/nv/app-shell.html -->
<button type="button" data-on-click="refreshAll">Refresh all</button>
<user-list></user-list>
<select data-ref="pick" data-on-change="pickUser" aria-label="User">
  <option value="1">1</option>
  <option value="2">2</option>
</select>
<button type="button" data-on-click="toggle">Toggle detail</button>
<div data-if="showDetail">
  <user-detail data-ref="detail"></user-detail>
</div>
```

```ts
// src/nv/app-shell.ts
import { Component, define } from "@nativele/ts-dom";
import { queryClient } from "../query.ts";
import "./user-list.ts";
import "./user-detail.ts";
import tpl from "./app-shell.html.js";

export class AppShell extends Component(tpl, { state: { userId: 1, showDetail: true } }) {
  pickUser(): void {
    this.set({ userId: Number(this.refs.pick.value) });
  }
  toggle(): void {
    this.set((s) => ({ showDetail: !s.showDetail }));
  }
  refreshAll(): void {
    void queryClient.invalidateQueries();
  }
  override render(view: { userId: number }, changed: ReadonlySet<"userId">): void {
    if (changed.has("userId")) this.refs.detail.userId = view.userId;
  }
}
define("app-shell", AppShell);
```

`src/main.ts` imports `./nv/app-shell.ts`, and `index.html` has `<app-shell></app-shell>`. What the example does, as verified:

- On load, each component shows its loading block, then the data; the list is filled with `replace()`. One request per query.
- A refetch (invalidation, focus, a remount of stale data) keeps the data on screen and shows the `refetching` block until it ends.
- Changing `userId` switches the query: a key never loaded shows the loading block, not the previous user's data; a key already in the cache shows its data at once and refetches it.
- A failed request shows the error block (`Could not load user 99: HTTP 404`).
- Clicking Add shows `Saving...`, then the list is refetched once and shows the new user; a failed save shows its error, keeps the input and refetches nothing.

## Known limitations

1. **One observer per component instance; one client per app.** Create the observer as a field and `bind` it in `connected()`, not in the constructor: `bind` releases the subscription on removal and subscribes again when the element comes back (see the lists guide on connecting and subscriptions). A module-level observer shared by several components also works (each `bind` adds a listener; when the last one is removed the observer stops, and it starts again when one comes back), but only when its options do not depend on any one component: `setOptions` from one component would switch the query for all of them. Two components with their own observers on the same key share one request through the client's cache.
2. **Removing the element stops everything for it.** After the element leaves the page, invalidation and window focus do not refetch its query, and a request that finishes later does not reach the element. Pass `signal` from the query function's context to `fetch`: then removing the last component that observes a query while it is fetching aborts the request. Without `signal`, the request runs to the end and fills the cache, but the removed element still gets no update. Putting the element back (the same element, as `data-if` does) shows the cached data at once and refetches it (with the default `staleTime` of 0, cached data is always stale).
3. **Keys from props go through `setOptions` in `render`.** Guard it with `changed.has("userId")`. A prop change while the element is removed sends no request. When a parent shows the element again with `data-if` and gives it a new prop in the same update, the element connects first, with its old prop, and fetches that key before `render` switches to the new one; so when hiding it, also reset the prop to a value whose query is disabled (`productId: 0` with `enabled: id > 0`), and only the new key is fetched. Use `enabled` for values that must not be fetched (here `id > 0`); a disabled query stays `status: "pending"`, so the loading block shows until a real id arrives. Show it differently if that matters (for example derive `loading` from `userId > 0` as well).
4. **Map `status` and `isFetching`, not `isLoading`.** Before the first subscription the result is `status: "pending"` with `fetchStatus: "idle"` (`isLoading` is `false`), and `bind` calls the callback with that result first; subscribing starts the fetch and calls it again at once with `fetchStatus: "fetching"`. Deriving `loading` from `status === "pending"` shows the loading block from the first render on. Copy only what the template shows into state.
5. **Call `queryClient.mount()` once.** Without it, a `visibilitychange` on the window (focus) does not refetch active stale queries; with it, it does.
6. **Errors wait for retries by default.** With the default `retry`, a failing query showed its error after about 7 seconds (`failureCount` 4: the first attempt and three retries), and the loading block stays until then. Set `retry` in the client's `defaultOptions` or per query to what the app needs; tests that check error states need it low or off.
7. **Handle the promise of `mutate`.** `mutate()` returns a promise that rejects when the mutation fails; without a rejection handler the page reports an uncaught `Error: HTTP 500`. The `MutationObserver` result (bound above) already carries the error for the view, so the handler can be empty.
8. **Arrays from `data` are read-only in state.** Declare list state as `readonly T[]` (`[] as readonly User[]`) and pass `r.data ?? []` as it is; the view and `render` receive it read-only (see the state guide).
9. Not verified: infinite queries, `placeholderData` and keeping previous data while switching keys, `refetchInterval`, persistence, hydration and server rendering, offline and paused mutations, optimistic updates, the TanStack devtools, the framework packages, and versions of `@tanstack/query-core` other than 5.106.

## Verify

Run in the project:

```sh
npx ts-dom check src/nv      # expect: ts-dom check: no issues
npx ts-dom doctor src/nv     # expect: ts-dom doctor: the set-up looks right (info lines are suggestions)
npm run build                # expect: ts-dom check: no issues, then ✓ built
```

Then check in a browser against the dev server, without external network: point the queries at a local mock API (for example a Vite plugin with `configureServer` middleware, or the app's own backend in development), and make the states deterministic by holding requests in the test instead of adding delays. With Playwright, `page.route("**/api/**", ...)` can record every request, keep a matching one waiting until the test releases it with `route.continue()`, or answer it with `route.fulfill({ status: 500 })`. Check:

- while a request is held, the loading block shows; after release, the data and the list items show, with one request per query;
- with data on screen, invalidating holds a refetch: the `refetching` block shows and the data stays;
- changing the prop sends a request for the new key and shows its loading block, not the previous data;
- after the component is removed, invalidation and a `visibilitychange` event on `window` send no request for its query, and a held request released after removal does not change the removed element (keep a reference to it); with `signal` passed to `fetch`, a request held when the component is removed fails with `requestfailed`, as long as no other component still observes the same key (another observer keeps the query, and its request, alive);
- after putting the element back, it shows the cached data and its query refetches;
- a held mutation shows its pending block; after release the list is refetched once and shows the new item; a failed mutation shows its error;
- no console errors or warnings, apart from the browser's `Failed to load resource` line for a status you return on purpose.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Queries never refetch when the window regains focus | `queryClient.mount()` was not called | call it once where the client is created |
| The error block shows only after several seconds | the default `retry` (three retries with growing delays) | set `retry` in `defaultOptions` or per query |
| Console: uncaught `Error: HTTP 500` after a failed mutation | the promise from `mutate()` has no rejection handler | add one: `.then(onDone, () => {})` |
| A component with no id shows its loading block forever and sends no request | `enabled` is false for that value, so the query stays `pending` | set the prop, or derive the view from the prop as well |
| The prop is set but the loading block stays and no request is sent | `setOptions` is not called in `render`, so the observer keeps its initial (disabled) options | call `this.#user.setOptions(userQuery(view.userId))` when `changed.has("userId")` |
| After the element is removed and put back, it never refetches or updates | the observer was subscribed in a field or the constructor and unsubscribed in `disconnected()`, so nothing subscribes again | subscribe with `this.bind(observe(observer), ...)` in `connected()` |
| `ts-dom check`: `[missing-binding] "isFetching" is used by {{ isFetching }} ...`, followed by `TS7006: Parameter 'r' implicitly has an 'any' type` in the `bind` callback | the template names a result field that is not in `state` or `derive`; the second error follows from the first | copy the field into state in the `bind` callback, or derive it |

## See also

- `bind`, stores and read-only sources: https://github.com/Pixmi/nativele/blob/main/docs/components.md#state-store-when-not-using-state
- `state`, `derive`, `render` and `changed`: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-and-view-state-optional
- Props from the parent: https://github.com/Pixmi/nativele/blob/main/docs/components.md#data-flow-props-down-events-up
- Loading and error states without a library: https://github.com/Pixmi/nativele/blob/main/docs/recipes.md#loading-and-error-states
- Copying store data into state: https://github.com/Pixmi/nativele/blob/main/docs/recipes.md#showing-data-from-a-store
- Lists with `replace()`: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#items-as-plain-elements-replace
- Lists of item components (`items = ...`): https://github.com/Pixmi/nativele/blob/main/docs/lists.md#items-as-components-items--
- Why subscriptions belong in `connected()`: https://github.com/Pixmi/nativele/blob/main/docs/lists.md#moving-items-connecting-and-subscriptions
- Setting up Vite: `npx ts-dom skills nativele-vite`
