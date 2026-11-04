import { Component, define } from "nativele";
import type { EmitEvent, EventHit } from "nativele";
import type { ShadowLeaf } from "./leaf.js";
import tpl from "./panel.html.js";

interface Row {
  id: number;
}

/** A Shadow DOM parent that contains Shadow DOM children, a Light DOM child and list items with children. */
export class ShadowPanel extends Component(tpl, {
  shadow: true,
  state: { total: 0, rows: [{ id: 1 }, { id: 2 }] as Row[] },
}) {
  log: string[] = [];
  onBumped(e: Event): void {
    this.log.push(`leaf:${(e as EmitEvent<ShadowLeaf, "bumped">).detail.clicks}`);
    this.set((s) => ({ total: s.total + 1 }));
  }
  onLightBumped(): void {
    this.log.push("light");
    this.set((s) => ({ total: s.total + 1 }));
  }
  onRow(_e: Event, hit: EventHit): void {
    this.log.push(`row:${String(hit.key)}`);
    this.set((s) => ({ total: s.total + 1 }));
  }
  override render(v: { rows: Row[] }, changed: ReadonlySet<string>): void {
    if (!changed.has("rows")) return;
    this.lists.rows.replace(v.rows, (r) => r.id, (r, { refs }) => {
      refs.row.label = `row ${r.id}`;
    });
  }
}
define("sh-panel", ShadowPanel);
