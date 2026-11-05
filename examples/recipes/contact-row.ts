import { Component, define, event } from "@nativele/ts-dom";
import type { Contact } from "./contacts.ts";
import tpl from "./contact-row.html.js";

export class ContactRow extends Component(tpl, {
  props: { contact: null as Contact | null },
  derive: { name: (s) => s.contact?.name ?? "", email: (s) => s.contact?.email ?? "" },
  emits: { "contact-remove": event() },
}) {
  drop(): void {
    this.emit("contact-remove");
  }
}
define("contact-row", ContactRow);
