import { Component, define } from "@nativele/ts-dom";
import { contacts } from "./contacts.ts";
import tpl from "./contact-stats.html.js";

export class ContactStats extends Component(tpl, { state: { total: 0 } }) {
  override connected(): void {
    this.bind(contacts, (c) => this.set({ total: c.items.length }));
  }
}
define("contact-stats", ContactStats);
