import { mountConds } from "./cond.ts";
import { mountHoles } from "./text.ts";
import type { TextValue } from "./text.ts";

export interface ListSchema {
  refs: Record<string, Element>;
  text: string;
  ifs: string;
}
export type TextOf<N extends string> = { [K in N]: TextValue };

interface Entry<L extends ListSchema> extends ItemContext<L> {
  item: unknown;
  /** Just created and update() has not been called yet */
  fresh: boolean;
}

/** The per-item context passed to update(). */
export interface ItemContext<L extends ListSchema> {
  readonly el: Element;
  readonly refs: L["refs"];
  readonly text: TextOf<L["text"]>;
  /** Maps to a data-if inside the item */
  show(name: L["ifs"], on: boolean): void;
}
export type Update<L extends ListSchema, T> = (item: T, ctx: ItemContext<L>) => void;

export interface ReplaceOptions {
  /**
   * Skip update() when the item is the same reference as last time. Default: false.
   * Only safe when you use immutable updates (a new object for every change); if you mutate objects in place the view keeps showing the old values.
   */
  skipUnchanged?: boolean;
}

/**
 * A one-dimensional keyed list. Reordering uses `moveBefore` where the browser has it, so a moved item (a component, a playing video, a focused input) is not disconnected. It only compares keys, never subtrees;
 * the content of an item is written explicitly by the user's update callback.
 */
export class List<L extends ListSchema = ListSchema> {
  #items = new Map<PropertyKey, Entry<L>>();
  #byEl = new WeakMap<Element, { key: PropertyKey; item: unknown }>();
  constructor(
    private readonly anchor: Comment,
    private readonly proto: Element,
    /** Called when a new item is created (the component uses it to register data-on-* inside the item) */
    private readonly onCreate?: (el: Element) => void,
  ) {}

  /** From any node inside an item, find the key and data of the item it belongs to (used by event handlers). */
  itemOf(node: Node | null): { key: PropertyKey; item: unknown } | undefined {
    for (let n = node; n; n = n.parentNode) {
      const hit = n instanceof Element ? this.#byEl.get(n) : undefined;
      if (hit) return hit;
    }
    return undefined;
  }

  get size(): number {
    return this.#items.size;
  }
  has(key: PropertyKey): boolean {
    return this.#items.has(key);
  }
  get(key: PropertyKey): ItemContext<L> | undefined {
    return this.#items.get(key);
  }

  #create(key: PropertyKey): Entry<L> {
    const el = this.proto.cloneNode(true) as Element;
    const holder = document.createDocumentFragment();
    holder.append(el);
    const conds = mountConds(holder);
    const text = mountHoles(holder) as TextOf<L["text"]>;
    conds.hideAll();
    const show = conds.show as ItemContext<L>["show"];
    el.remove();
    const refs: Record<string, Element> = {};
    for (const n of [el, ...el.querySelectorAll("[data-ref]")]) {
      const name = n.getAttribute("data-ref");
      if (name) refs[name] = n;
    }
    this.onCreate?.(el);
    const entry: Entry<L> = { el, refs: refs as L["refs"], text, show, item: undefined, fresh: true };
    this.#byEl.set(el, { key, item: undefined });
    return entry;
  }

  /** Add or update a single item; a new item is appended at the end. */
  upsert<T>(key: PropertyKey, item: T, update: Update<L, T>): void {
    let entry = this.#items.get(key);
    if (!entry) {
      entry = this.#create(key);
      this.#items.set(key, entry);
      this.anchor.parentNode?.insertBefore(entry.el, this.anchor);
    }
    this.#run(entry, key, item, update);
  }

  #run<T>(entry: Entry<L>, key: PropertyKey, item: T, update: Update<L, T>, skip = false): void {
    if (skip && !entry.fresh && Object.is(entry.item, item)) return;
    entry.item = item;
    entry.fresh = false;
    this.#byEl.set(entry.el, { key, item });
    update(item, entry);
  }

  remove(key: PropertyKey): boolean {
    const entry = this.#items.get(key);
    if (!entry) return false;
    entry.el.remove();
    this.#items.delete(key);
    return true;
  }

  clear(): void {
    for (const { el } of this.#items.values()) el.remove();
    this.#items.clear();
  }

  /** Keyed reconciliation: remove extra items, create missing ones, reorder, and call update() for every item. */
  replace<T>(items: readonly T[], key: (item: T) => PropertyKey, update: Update<L, T>, opts: ReplaceOptions = {}): void {
    const next = new Set<PropertyKey>();
    for (const it of items) {
      const k = key(it);
      if (next.has(k)) throw new Error(`[duplicate-key] replace() received two items with the key ${String(k)}, so one element cannot show both. Fix: make key() return a unique value for each item.`);
      next.add(k);
    }
    for (const k of this.#items.keys()) if (!next.has(k)) this.remove(k);

    const parent = this.anchor.parentNode;
    let after: Node = this.anchor;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i] as T;
      const k = key(it);
      let entry = this.#items.get(k);
      if (!entry) {
        entry = this.#create(k);
        this.#items.set(k, entry);
      }
      if (entry.el.nextSibling !== after || entry.el.parentNode !== parent) {
        if (entry.el.parentNode === parent && parent?.moveBefore) parent.moveBefore(entry.el, after);
        else parent?.insertBefore(entry.el, after);
      }
      after = entry.el;
      this.#run(entry, k, it, update, opts.skipUnchanged);
    }
  }
}
