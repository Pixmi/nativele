import { Component, define } from "@nativele/ts-dom";
import type { EmitEvent, EventHit } from "@nativele/ts-dom";
import type { FieldChild } from "./child.js";
import tpl from "./parent.html.js";

interface Row {
  id: number;
  v: string;
}

export class ParentForm extends Component(tpl, {
  state: { name: "", email: "", rows: [{ id: 1, v: "a" }, { id: 2, v: "b" }] as Row[] },
  derive: {
    summary: (s) => `${s.name}/${s.email}`,
    hint: (s) => (s.name ? `Hello ${s.name}` : "Enter a name"),
  },
}) {
  wrapperHits = 0;
  onName(e: Event): void {
    this.set({ name: (e as EmitEvent<FieldChild, "value-change">).detail.value });
  }
  onEmail(e: Event): void {
    this.set({ email: (e as EmitEvent<FieldChild, "value-change">).detail.value });
  }
  onRow(e: Event, hit: EventHit): void {
    const v = (e as EmitEvent<FieldChild, "value-change">).detail.value;
    this.set((s) => ({ rows: s.rows.map((r) => (r.id === hit.key ? { ...r, v } : r)) }));
  }
  onWrapper(): void {
    this.wrapperHits++;
  }
  override render(v: { name: string; email: string; rows: Row[] }): void {
    // The child's props are fully typed: the assigned name and type are checked by tsc
    this.refs.name.value = v.name;
    this.refs.name.error = v.name.length > 3 ? "Too long" : "";
    this.refs.email.value = v.email;
    this.lists.rows.replace(v.rows, (r) => r.id, (r, { refs }) => {
      refs.row.value = r.v;
      refs.row.label = `Row ${r.id}`;
    });
  }
}
define("x-parent", ParentForm);
