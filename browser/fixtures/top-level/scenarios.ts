import { Component, define } from "@nativele/ts-dom";
import noslotTpl from "./noslot.html.js";
import firstTpl from "./first.html.js";
import defaultTpl from "./default.html.js";
import namedTpl from "./named.html.js";
import itemTpl from "./item.html.js";
import keyedTpl from "./keyed.html.js";
import ifTpl from "./if.html.js";
import ifListTpl from "./if-list.html.js";
import holeTpl from "./hole.html.js";
import fallbackTpl from "./fallback.html.js";
import type { ScenarioName } from "./expected.ts";

interface Row {
  id: number;
  label: string;
}

const rows = (...ids: number[]): Row[] => ids.map((id) => ({ id, label: `r${id}` }));
const key = (r: Row) => r.id;
const update = (r: Row, { text }: { text: { n: unknown } }) => {
  text.n = r.label;
};

class NoSlot extends Component(noslotTpl, { state: { rows: [] as readonly Row[] } }) {
  override render(v: { rows: readonly Row[] }): void {
    this.lists.rows.replace(v.rows, key, update);
  }
}
define("tl-noslot", NoSlot);

class First extends Component(firstTpl, { state: { rows: [] as readonly Row[] } }) {
  override render(v: { rows: readonly Row[] }): void {
    this.lists.rows.replace(v.rows, key, update);
  }
}
define("tl-first", First);

class Stateless extends Component(noslotTpl) {}
define("tl-stateless", Stateless);

class Default extends Component(defaultTpl, { state: { rows: [] as readonly Row[] } }) {
  changes: string[] = [];
  override render(v: { rows: readonly Row[] }): void {
    this.lists.rows.replace(v.rows, key, update);
  }
  override slotchange(name: ""): void {
    this.changes.push(name);
  }
}
define("tl-default", Default);

class Named extends Component(namedTpl, { state: { rows: [] as readonly Row[] } }) {
  changes: string[] = [];
  override render(v: { rows: readonly Row[] }): void {
    this.lists.rows.replace(v.rows, key, update);
  }
  override slotchange(name: "x"): void {
    this.changes.push(name);
  }
}
define("tl-named", Named);

export class Item extends Component(itemTpl, { props: { item: null as Row | null }, derive: { label: (s) => s.item?.label ?? "" } }) {}
define("tl-item", Item);

class Keyed extends Component(keyedTpl, { state: { items: [] as readonly Row[] } }) {
  override render(v: { items: readonly Row[] }): void {
    this.lists.items.items = v.items;
  }
}
define("tl-keyed", Keyed);

class If extends Component(ifTpl, { state: { msg: false } }) {}
define("tl-if", If);

class IfList extends Component(ifListTpl, { state: { box: false, rows: [] as readonly Row[] } }) {
  override render(v: { rows: readonly Row[] }): void {
    this.lists.rows.replace(v.rows, key, update);
  }
}
define("tl-if-list", IfList);

class Hole extends Component(holeTpl, { state: { title: "" } }) {}
define("tl-hole", Hole);

class Fallback extends Component(fallbackTpl) {
  changes: string[] = [];
  override slotchange(name: ""): void {
    this.changes.push(name);
  }
}
define("tl-fallback", Fallback);

const tick = () => new Promise((r) => setTimeout(r, 0));
const items = (el: Element) => [...el.querySelectorAll(".it")].map((n) => n.textContent?.trim());
const texts = (nodes: Node[]) => nodes.map((n) => n.textContent);
/** The host's child nodes in order: elements by tag and text, comments by data, blank text skipped. */
const layout = (el: Element) =>
  [...el.childNodes]
    .map((n) => (n instanceof Comment ? `<!--${n.data}-->` : n instanceof Element ? `${n.localName}:${n.textContent}` : (n.textContent ?? "").trim()))
    .filter(Boolean);

async function mount<T extends HTMLElement>(tag: string, init?: (el: T) => void): Promise<T> {
  const el = document.createElement(tag) as T;
  init?.(el);
  document.body.append(el);
  await tick();
  return el;
}

async function added(tag: "tl-noslot" | "tl-first"): Promise<unknown> {
  const el = await mount<NoSlot>(tag, (e) => e.set({ rows: rows(1, 2) }));
  el.set({ rows: rows(1, 2, 3) });
  await tick();
  return items(el);
}

export const scenarios: Record<ScenarioName, () => Promise<unknown>> = {
  "no slot: an item added after the first render stays": () => added("tl-noslot"),
  "list first in the template: an item added after the first render stays": () => added("tl-first"),
  "empty first render, items added later": async () => {
    const el = await mount<NoSlot>("tl-noslot");
    el.set({ rows: rows(1, 2) });
    await tick();
    return items(el);
  },
  "no state: replace() and upsert() after connect": async () => {
    const el = await mount<Stateless>("tl-stateless");
    el.lists.rows.replace(rows(1, 2), key, update);
    await tick();
    el.lists.rows.upsert(9, { id: 9, label: "r9" }, update);
    await tick();
    return items(el);
  },
  "reorder after the first render keeps every item, the same nodes, in the new order": async () => {
    const el = await mount<NoSlot>("tl-noslot", (e) => e.set({ rows: rows(1, 2, 3) }));
    const before = [...el.querySelectorAll(".it")];
    el.set({ rows: rows(3, 2, 1) });
    await tick();
    const after = [...el.querySelectorAll(".it")];
    return { items: items(el), same: after.every((n) => before.includes(n)) };
  },
  "default slot: items stay at the list, only user nodes are assigned, no slotchange from items": async () => {
    const el = await mount<Default>("tl-default", (e) => e.set({ rows: rows(1, 2) }));
    const u = document.createElement("u");
    u.textContent = "U";
    el.append(u);
    await tick();
    el.changes = [];
    el.set({ rows: rows(1, 2, 3) });
    await tick();
    const layoutAfterAdd = layout(el);
    el.set({ rows: rows(3, 1) });
    await tick();
    return { layoutAfterAdd, layout: layout(el), assigned: texts(el.assignedNodes("")), changes: el.changes };
  },
  "named slot: items stay at the list and are not assigned": async () => {
    const el = await mount<Named>("tl-named", (e) => e.set({ rows: rows(1) }));
    el.set({ rows: rows(1, 2) });
    await tick();
    const x = document.createElement("b");
    x.slot = "x";
    x.textContent = "X";
    el.append(x);
    await tick();
    return { layout: layout(el), assigned: texts(el.assignedNodes("x")), changes: el.changes };
  },
  "keyed component list: items = after the first render": async () => {
    const el = await mount<Keyed>("tl-keyed", (e) => e.set({ items: rows(1, 2) }));
    el.set({ items: rows(2, 1, 3) });
    await tick();
    return items(el);
  },
  "added while disconnected, then reconnected, added and reordered": async () => {
    const el = await mount<NoSlot>("tl-noslot", (e) => e.set({ rows: rows(1) }));
    el.remove();
    el.set({ rows: rows(1, 2) });
    document.body.append(el);
    await tick();
    const reconnected = items(el);
    el.set({ rows: rows(3, 2, 1) });
    await tick();
    return { reconnected, after: items(el) };
  },
  "added, then the host removed in the same task": async () => {
    const el = await mount<NoSlot>("tl-noslot", (e) => e.set({ rows: rows(1) }));
    el.set({ rows: rows(1, 2) });
    el.remove();
    await tick();
    const detached = items(el);
    document.body.append(el);
    await tick();
    return { detached, reconnected: items(el) };
  },
  "top-level slot: fallback comes back unassigned and leaves again": async () => {
    const el = await mount<Fallback>("tl-fallback");
    const b = document.createElement("b");
    b.textContent = "U";
    el.append(b);
    await tick();
    el.changes = [];
    b.remove();
    await tick();
    await tick();
    const removed = { layout: layout(el), assigned: texts(el.assignedNodes("")), changes: [...el.changes] };
    const i = document.createElement("i");
    i.textContent = "V";
    el.append(i);
    await tick();
    return { removed, readded: { layout: layout(el), assigned: texts(el.assignedNodes("")) } };
  },
  "an assigned node moved to another parent is unassigned": async () => {
    const el = await mount<Default>("tl-default");
    const u = document.createElement("u");
    u.textContent = "U";
    el.append(u);
    await tick();
    el.changes = [];
    const box = document.createElement("div");
    document.body.append(box);
    box.append(u);
    await tick();
    return { assigned: texts(el.assignedNodes("")), changes: el.changes, layout: layout(el) };
  },
  "top-level data-if shown, hidden and shown again": async () => {
    const el = await mount<If>("tl-if");
    el.set({ msg: true });
    await tick();
    const shown = items(el);
    el.set({ msg: false });
    await tick();
    const hidden = items(el);
    el.set({ msg: true });
    await tick();
    return { shown, hidden, again: items(el) };
  },
  "top-level text hole": async () => {
    const el = await mount<Hole>("tl-hole");
    el.set({ title: "Hello" });
    await tick();
    el.set({ title: "" });
    await tick();
    el.set({ title: "World" });
    await tick();
    return layout(el);
  },
  "list inside a top-level data-if": async () => {
    const el = await mount<IfList>("tl-if-list");
    el.set({ box: true, rows: rows(1, 2) });
    await tick();
    el.set({ rows: rows(1, 2, 3) });
    await tick();
    return items(el);
  },
};
