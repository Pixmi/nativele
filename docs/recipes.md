# Recipes

Patterns for common screens, built only from the library's own pieces. Every snippet comes from [examples/recipes](../examples/recipes), a contacts screen that `npm run check` type-checks and a real Chrome test drives.

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

A store's `set` replaces the whole value, unlike a component's `this.set`, which merges; spread the rest yourself as above.

## Showing data from a store

When a component has `state`, `props` or `derive`, every `{{ hole }}` and `data-if` in its template must be one of them, and tsc reports any other name as `missing-binding`. To show a value from a store, `bind` the store and copy what the template shows into state:

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

The state holds only what this component shows; `bind` keeps it current and unsubscribes when the element leaves the page. A component with no options at all can write `this.text.total = ...` in the `bind` callback instead.

## A filtered list

Derive the visible items and assign them in `render`, guarded by the derived name: `changed` lists the derived values that changed as well as state and props. When two derived values need the same calculation, put it in a plain function, because a derived value cannot read another one.

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

Annotate `changed` with the names you check, not `ReadonlySet<string>`: a misspelled name, or one that is not state, a prop or a derived value, is then a tsc error.

## Events from list items

Name the item type and its key field in the handler's `EventHit`, and `hit.key` and `hit.item` are typed without a cast:

```ts
removeRow(_e: Event, hit: EventHit<Contact, "id">): void {
  removeContact(hit.key); // number
}
```

Use this form only for handlers on elements inside list items; elsewhere `hit.key` and `hit.item` are `undefined`.

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

Keep each message in state, show it with `data-if`, and clear the messages as the user types. `novalidate` leaves validation to this code, and `role="alert"` announces the messages. The fields sit in the `<form data-ref="form">` of the dialog above, so `this.refs.form.elements.name` reads each one by its `name`, typed by its tag (`HTMLInputElement` here; a `<select>` is an `HTMLSelectElement` with `selectedOptions`, a radio group a `RadioNodeList` whose `value` is the checked one, a checkbox is read with `.checked`), and no field needs a `data-ref` of its own. Which controls are typed is in [Reading a form](components.md#reading-a-form).

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

For larger forms, a schema library can produce the messages; the component still keeps them in state and shows them the same way. The `nativele-zod` Skill (`npx ts-dom skills nativele-zod`) does it with Zod or Valibot, including nested and array fields. Two details hold for any form: `aria-invalid` must be `"true"` (an empty `aria-invalid=""` counts as not invalid), and validating on blur needs `data-on-focusout` on the form, because `blur` does not bubble.
