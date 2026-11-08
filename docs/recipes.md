# Recipes

Patterns for common screens, built only from the library's own pieces. Every snippet is code that `npm run check` type-checks and a real Chrome test drives.

The contacts screen comes from [examples/recipes](../examples/recipes) ([browser/recipes.test.ts](../browser/recipes.test.ts)). The request cancellation, the table, the form control and the language switch come from [browser/fixtures](../browser/fixtures).

Their tests: [abort](../browser/abort.test.ts), [table](../browser/table.test.ts), [form control](../browser/form-control.test.ts), [locale](../browser/locale.test.ts).

## Loading and error states

Keep the request status as a union, derive one boolean per state you show, and let `data-if` show the matching block. `set` renders synchronously, so each step of the request shows at once.

```ts
// contacts.ts: a shared store, so several components can show the same data
export type Status = "idle" | "loading" | "error" | "ready";
export const contacts = createStore({ status: "idle" as Status, error: "", items: [] as readonly Contact[], nextId: 1 });

export async function loadContacts(): Promise<void> {
  contacts.set((s) => ({ ...s, status: "loading", error: "" }));
  try {
    const res = await fetch("/api/contacts");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = (await res.json()) as Contact[];
    contacts.set((s) => ({ ...s, status: "ready", items }));
  } catch (e) {
    contacts.set((s) => ({ ...s, status: "error", error: e instanceof Error ? e.message : String(e) }));
  }
}
```

```html
<!-- contact-app.html -->
<p data-if="loading">Loading...</p>
<p role="alert" data-if="failed">Could not load: {{ error }} <button type="button" data-on-click="retry">Retry</button></p>
```

```ts
// contact-app.ts
export class ContactApp extends Component(tpl, {
  state: { status: "idle", error: "", contacts: [], query: "" } as State,
  derive: {
    loading: (s) => s.status === "loading",
    failed: (s) => s.status === "error",
    // ...
  },
}) {
  override connected(): void {
    this.bind(contacts, (c) => this.set({ status: c.status, error: c.error, contacts: c.items }));
    if (contacts.get().status === "idle") void loadContacts();
  }
  retry(): void {
    void loadContacts();
  }
}
```

A store's `set` replaces the whole value, so spread the rest as above ([stores](components.md#state-store-when-not-using-state)).

## Cancelling a request when the component is removed

A request that one component makes for itself is cancelled when the element leaves the page: create an `AbortController` in `connected()`, abort it from `onCleanup`, and pass its signal to `fetch`.

```ts
// abort-load.ts
export class AbortLoad extends Component(tpl, { state: { status: "idle" } }) {
  override connected(): void {
    const ac = new AbortController();
    this.onCleanup(() => ac.abort());
    void this.#load(ac.signal);
  }
  async #load(signal: AbortSignal): Promise<void> {
    this.set({ status: "loading" });
    try {
      const res = await fetch("/api/slow", { signal });
      this.set({ status: res.ok ? await res.text() : "error" });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      this.set({ status: "error" });
    }
  }
}
```

- When the element is removed, every function registered with `onCleanup` runs once and is dropped, so the request is aborted and its promise rejects with an `AbortError`, which the `catch` ignores: nothing is set on the removed element and no error shows.
- `connected()` runs on every insertion, so each connection makes its own controller and request; an `onCleanup` registered in the constructor would run only at the first removal.
- A list item moved without `moveBefore` is disconnected and connected again ([moving items](lists.md#moving-items-connecting-and-subscriptions)), so its request is aborted and started again, the same as a `bind`; with `moveBefore` it stays connected and the request goes on.
- Data that several components share, or that must outlive the element, is loaded through a store instead, as in [Loading and error states](#loading-and-error-states).

## Showing data from a store

A component with `state`, `props` or `derive` shows only the names it declares ([state](components.md#data-and-view-state-optional)); any other name is `missing-binding`. To show a value from a store, `bind` the store in `connected()` and copy what the template shows into state:

```html
<!-- contact-stats.html -->
<p>{{ total }} contacts</p>
```

```ts
export class ContactStats extends Component(tpl, { state: { total: 0 } }) {
  override connected(): void {
    this.bind(contacts, (c) => this.set({ total: c.items.length }));
  }
}
```

The state holds only what this component shows; `bind` keeps it current ([stores](components.md#state-store-when-not-using-state)). A component with no options at all can write `this.text.total = ...` in the `bind` callback instead.

## Switching the language

Nativele has no i18n ([translations](templates.md#trusted-types-translations-and-icons)): the current locale is a store, each component that shows text binds it, and the text comes from a plain messages object. Text that needs a value is a function, so the HTML still names one hole.

```ts
// locale.ts
export const messages = {
  en: { hello: "Hello", items: (n: number) => (n === 1 ? "1 item" : `${n} items`) },
  fr: { hello: "Bonjour", items: (n: number) => (n <= 1 ? `${n} article` : `${n} articles`) },
};
export type Locale = keyof typeof messages;

export const locale = createStore<Locale>("en");

export function setLocale(next: Locale): void {
  document.documentElement.lang = next;
  locale.set(next);
}
```

```ts
// locale-greeting.ts: no options, so the callback writes the hole
export class LocaleGreeting extends Component(tpl) {
  override connected(): void {
    this.bind(locale, (l) => (this.text.hello = messages[l].hello));
  }
}
```

```ts
// locale-cart.ts: with state, copy the locale into state and derive the text
export class LocaleCart extends Component(tpl, {
  props: { count: 0 },
  state: { locale: "en" as Locale },
  derive: { summary: (s) => messages[s.locale].items(s.count) },
}) {
  override connected(): void {
    this.bind(locale, (l) => this.set({ locale: l }));
  }
}
```

- `setLocale` is the only code that changes the locale, so the document's `lang` always matches the text on the page.
- A component removed from the page is unsubscribed and stops updating; inserted again, it binds again and gets the current locale at once ([stores](components.md#state-store-when-not-using-state)).
- Attributes such as `aria-label` or `placeholder` are set in the same callback, or in `render` from the derived value.

## A filtered list

Derive the visible items and assign them in `render`, guarded by the derived name (`changed` also holds derived names: [state](components.md#data-and-view-state-optional)). When two derived values need the same calculation, put it in a plain function, because a derived value cannot read another one.

```ts
const matching = (s: DeepReadonly<State>) => s.contacts.filter((c) => c.name.toLowerCase().includes(s.query.toLowerCase()));

export class ContactApp extends Component(tpl, {
  state: { status: "idle", error: "", contacts: [], query: "" } as State,
  derive: {
    visible: (s) => matching(s),
    empty: (s) => s.status === "ready" && matching(s).length === 0,
  },
}) {
  search(): void {
    this.set({ query: this.refs.search.value });
  }
  override render(view: { visible: readonly Contact[] }, changed: ReadonlySet<"visible">): void {
    if (changed.has("visible")) this.lists.visible.items = view.visible;
  }
}
```

## Events from list items

Name the item type and its key field in the handler's `EventHit`, and `hit.key` and `hit.item` are typed without a cast:

```ts
removeRow(_e: Event, hit: EventHit<Contact, "id">): void {
  removeContact(hit.key); // number
}
```

Use this form only for handlers inside list items ([events](components.md#events-data-on-)).

## A table with configurable columns

The columns are a config array: a header, a function that builds a row's cell, and an optional comparator. `data-each` cannot be nested ([lists](lists.md#items-as-plain-elements-replace)), so each row is an item component that builds its cells in `render` with DOM calls.

```ts
// users.ts
export interface Column {
  id: string;
  header: string;
  cell: (user: User) => Node | string;
  sort?: (a: User, b: User) => number;
}
```

```ts
// user-columns.ts
import "./status-badge.js";
import type { Column } from "./users.js";

export const userColumns: readonly Column[] = [
  { id: "name", header: "Name", cell: (u) => u.name, sort: (a, b) => a.name.localeCompare(b.name) },
  { id: "email", header: "Email", cell: (u) => u.email },
  {
    id: "status",
    header: "Status",
    cell: (u) => {
      const badge = document.createElement("status-badge");
      badge.status = u.status;
      return badge;
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: (u) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = "remove";
      button.ariaLabel = `Remove ${u.name}`;
      button.textContent = "Remove";
      return button;
    },
  },
];
```

```html
<!-- user-row.html -->
<style scoped>
  :scope {
    display: contents;
  }
</style>
<tr data-ref="tr"></tr>
```

```ts
// user-row.ts
export class UserRow extends Component(tpl, {
  props: { user: null as User | null, columns: [] as readonly Column[] },
}) {
  override render(view: { user: User | null; columns: readonly Column[] }): void {
    const { user } = view;
    if (!user) return;
    this.refs.tr.replaceChildren(
      ...view.columns.map((c) => {
        const td = document.createElement("td");
        td.append(c.cell(user));
        return td;
      }),
    );
  }
}
```

```html
<!-- user-table.html -->
<table>
  <thead>
    <tr>
      <template data-each="headers">
        <th scope="col">
          <button type="button" data-ref="sort" data-on-click="sortBy">{{ header }}</button>
          <span data-ref="label">{{ header }}</span>
        </th>
      </template>
    </tr>
  </thead>
  <tbody data-ref="body">
    <template data-each="rows" data-key="id" data-prop="user">
      <user-row></user-row>
    </template>
  </tbody>
</table>
```

```ts
// user-table.ts
function sortRows(list: readonly User[], sort: Column["sort"], desc: boolean): readonly User[] {
  if (!sort) return list;
  const sorted = [...list].sort(sort);
  return desc ? sorted.reverse() : sorted;
}

export class UserTable extends Component(tpl, {
  props: { columns: [] as readonly Column[] },
  state: { users: [] as readonly User[], sortId: "", desc: false },
  derive: { rows: (s) => sortRows(s.users, s.columns.find((c) => c.id === s.sortId)?.sort, s.desc) },
}) {
  override connected(): void {
    this.bind(users, (list) => this.set({ users: list }));
    this.on(this.refs.body, "click", (e) => {
      const button = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-action]") : null;
      const user = button?.closest("user-row")?.user;
      if (user && button?.dataset.action === "remove") removeUser(user.id);
    });
  }
  sortBy(_e: MouseEvent, hit: EventHit<Column, "id">): void {
    this.set((s) => ({ sortId: hit.key, desc: s.sortId === hit.key && !s.desc }));
  }
  override render(
    view: { columns: readonly Column[]; rows: readonly User[]; sortId: string; desc: boolean },
    changed: ReadonlySet<"columns" | "rows" | "sortId" | "desc">,
  ): void {
    if (changed.has("columns") || changed.has("sortId") || changed.has("desc")) {
      this.lists.headers.replace(
        view.columns,
        (c) => c.id,
        (c, { text, refs, el }) => {
          text.header = c.header;
          refs.sort.hidden = c.sort === undefined;
          refs.label.hidden = c.sort !== undefined;
          el.ariaSort = c.id === view.sortId ? (view.desc ? "descending" : "ascending") : null;
        },
      );
    }
    if (changed.has("rows")) this.lists.rows.items = view.rows;
    if (changed.has("rows") || changed.has("columns")) {
      for (const u of view.rows) {
        const row = this.lists.rows.get(u.id);
        if (row) row.el.columns = view.columns;
      }
    }
  }
}
```

The page gives the table its columns (`table.columns = userColumns`) and fills the `users` store, as in [Loading and error states](#loading-and-error-states).

- The cells go into the row template's `<tr>`, never into the host itself: in Light DOM a node added to the host is slot content, and with no matching slot it is not rendered ([slot rules](components.md#light-default-and-shadow)). `display: contents` on `<user-row>` makes its `<tr>` a row of the table, for layout and for assistive technology.
- The columns are a per-row prop set through `get(key).el`, as in [Per-row state](lists.md#per-row-state-selected-rank), so a row renders again only when its `user` or `columns` changes.
- A cell can hold a component: create it with `document.createElement`, set its props, and return it. Import its module yourself, because `ts-dom gen` imports only the tags written in a template ([composition](components.md#composition-using-multiple-components-together)).
- A `data-on-*` attribute on an element created in code does nothing, because only elements of the component's own template are wired ([events](components.md#events-data-on-)). The table listens on its `<tbody>` instead, and `closest("user-row")` is typed as `UserRow`, so `.user` is the row's data.

What it costs: sorting and removing move or drop rows without rebuilding any cell, but a column change gives every row new `columns` and rebuilds all of its cells.

When the columns are fixed, a plain list is simpler: write the cells in the item template (`<template data-each="rows"><tr><td>{{ name }}</td><td>{{ email }}</td></tr></template>`) and fill it with `replace()` ([plain items](lists.md#items-as-plain-elements-replace)), so codegen knows every cell and no row component is needed.

## A modal dialog

Put a native `<dialog>` in the child's template and give the child a public method that opens it. The parent calls the method through its typed ref: a command (open, focus, reset) goes down as a method call, data goes down as props, and results come up as events.

```html
<!-- contact-form.html -->
<dialog data-ref="dialog" aria-labelledby="contact-form-title">
  <form data-ref="form" data-on-submit="submit" novalidate>
    <h2 id="contact-form-title">New contact</h2>
    ...
    <button type="submit">Add</button>
    <button type="button" data-on-click="cancel">Cancel</button>
  </form>
</dialog>
```

```ts
// contact-form.ts
export class ContactForm extends Component(tpl, {
  state: { nameError: "", emailError: "" },
  emits: { "contact-add": event<{ name: string; email: string }>() },
}) {
  open(): void {
    this.refs.form.reset();
    this.clearErrors();
    this.refs.dialog.showModal();
  }
  cancel(): void {
    this.refs.dialog.close();
  }
}
```

```html
<!-- contact-app.html -->
<button type="button" data-on-click="openForm">Add contact</button>
<contact-form data-ref="form" data-on-contact-add="addRow"></contact-form>
```

```ts
// contact-app.ts
openForm(): void {
  this.refs.form.open(); // refs.form is typed as ContactForm
}
addRow(e: EmitEvent<ContactForm, "contact-add">): void {
  const { name, email } = e.detail;
  addContact(name, email);
}
```

## Form validation

Keep each message in state, show it with `data-if`, and clear the messages as the user types. `novalidate` leaves validation to this code, and `role="alert"` announces the messages.

The fields sit in the `<form data-ref="form">` of the dialog above, so `this.refs.form.elements.name` reads each one by its `name`, typed by its tag, and no field needs a `data-ref` of its own ([Reading a form](components.md#reading-a-form)).

```html
<label>Name <input name="name" data-on-input="clearErrors" /></label>
<p role="alert" data-if="nameError">{{ nameError }}</p>
<label>Email <input name="email" type="email" data-on-input="clearErrors" /></label>
<p role="alert" data-if="emailError">{{ emailError }}</p>
```

```ts
clearErrors(): void {
  this.set({ nameError: "", emailError: "" });
}
submit(e: Event): void {
  e.preventDefault();
  const { elements } = this.refs.form;
  const name = elements.name.value.trim();
  const email = elements.email.value.trim();
  const nameError = name ? "" : "Name is required";
  const emailError = /^\S+@\S+\.\S+$/.test(email) ? "" : "Enter a valid email";
  this.set({ nameError, emailError });
  if (nameError || emailError) return;
  this.emit("contact-add", { name, email });
  this.refs.dialog.close();
}
```

For larger forms, a schema library can produce the messages; the component still keeps them in state and shows them the same way. The `nativele-zod` Skill (`npx ts-dom skills nativele-zod`) does it with Zod or Valibot, including nested and array fields.

Two details hold for any form:

- `aria-invalid` must be `"true"`; an empty `aria-invalid=""` counts as not invalid.
- Validating on blur needs `data-on-focusout` on the form, because `blur` does not bubble.

## A form control of your own

A component takes part in a native `<form>` as one control through the browser's form-associated custom elements: `static formAssociated = true`, `ElementInternals` and the form callbacks. None of these names is a Nativele member, so the class declares them as it would on any custom element.

```html
<!-- rating-input.html -->
<template data-each="stars">
  <button type="button" data-on-click="pick">{{ n }}</button>
</template>
```

```ts
// rating-input.ts
const stars = [1, 2, 3, 4, 5].map((n) => ({ n }));

export class RatingInput extends Component(tpl, {
  props: { required: false },
  state: { value: 0, disabled: false },
}) {
  static formAssociated = true;
  #internals = this.attachInternals();

  pick(_e: MouseEvent, hit: EventHit<{ n: number }, "n">): void {
    this.set({ value: hit.key });
  }
  formResetCallback(): void {
    this.set({ value: 0 });
  }
  formDisabledCallback(disabled: boolean): void {
    this.set({ disabled });
  }
  override render(view: { value: number; disabled: boolean; required: boolean }, changed: ReadonlySet<"value" | "disabled" | "required">): void {
    this.lists.stars.replace(
      stars,
      (s) => s.n,
      (s, { text, el }) => {
        text.n = String(s.n);
        el.ariaPressed = String(s.n <= view.value);
        el.disabled = view.disabled;
      },
    );
    if (changed.has("value") || changed.has("required")) {
      this.#internals.setFormValue(view.value ? String(view.value) : null);
      const missing = view.required && !view.value;
      this.#internals.setValidity({ valueMissing: missing }, missing ? "Choose a rating." : "", this.lists.stars.get(1)?.el);
    }
  }
}
```

```html
<form>
  <fieldset>
    <rating-input name="rating" required></rating-input>
  </fieldset>
</form>
```

- `attachInternals()` runs once, in a field initializer, so in the constructor.
- The browser reads the `name` attribute itself: `new FormData(form).get("rating")` is the value given to `setFormValue`, and `null` leaves the control out of the data.
- `setValidity` drives the native validation: while a flag is set, the element and its form match `:invalid`, `form.checkValidity()` and `form.reportValidity()` return `false`, and `reportValidity()` focuses the anchor (the first button), where the browser shows the message. A flag needs a message; `{}` or every flag `false` makes the control valid.
- `form.reset()` calls `formResetCallback`, and disabling an ancestor `<fieldset>` calls `formDisabledCallback(true)` and makes the element match `:disabled`; each sets state, and `render` updates the buttons and the form value.
- In Light DOM the inner buttons sit inside the form too; with `type="button"` and no `name` they neither submit it nor add data.
- The component is not one of the typed controls of `this.refs.form.elements` ([reading a form](components.md#reading-a-form)): give it a `data-ref`, or read the form with `FormData`.
