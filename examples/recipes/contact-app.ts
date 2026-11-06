import { Component, define } from "@nativele/ts-dom";
import type { DeepReadonly, EmitEvent, EventHit } from "@nativele/ts-dom";
import { addContact, contacts, loadContacts, removeContact } from "./contacts.ts";
import type { Contact, Status } from "./contacts.ts";
import type { ContactForm } from "./contact-form.ts";
import tpl from "./contact-app.html.js";

interface State {
  status: Status;
  error: string;
  contacts: readonly Contact[];
  query: string;
}

const matching = (s: DeepReadonly<State>) => s.contacts.filter((c) => c.name.toLowerCase().includes(s.query.toLowerCase()));

export class ContactApp extends Component(tpl, {
  state: { status: "idle", error: "", contacts: [], query: "" } as State,
  derive: {
    loading: (s) => s.status === "loading",
    failed: (s) => s.status === "error",
    visible: (s) => matching(s),
    empty: (s) => s.status === "ready" && matching(s).length === 0,
  },
}) {
  override connected(): void {
    this.bind(contacts, (c) => this.set({ status: c.status, error: c.error, contacts: c.items }));
    if (contacts.get().status === "idle") void loadContacts();
  }
  retry(): void {
    void loadContacts();
  }
  search(): void {
    this.set({ query: this.refs.search.value });
  }
  openForm(): void {
    this.refs.form.open();
  }
  addRow(e: EmitEvent<ContactForm, "contact-add">): void {
    const { name, email } = e.detail;
    addContact(name, email);
  }
  removeRow(_e: Event, hit: EventHit<Contact, "id">): void {
    removeContact(hit.key);
  }
  override render(view: { visible: readonly Contact[] }, changed: ReadonlySet<"visible">): void {
    if (changed.has("visible")) this.lists.visible.items = view.visible;
  }
}
define("contact-app", ContactApp);
