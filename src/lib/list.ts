import { mountConds } from "./cond.ts";
import { anchorSlot, fromTemplate } from "./slots.ts";
import { mountHoles } from "./text.ts";
import type { IsAny } from "./template.ts";
import type { TextValue } from "./text.ts";

export interface ListSchema {
  // Not constrained to Element, like Schema's refs.
  refs: Record<string, object>;
  text: string;
  ifs: string;
  /**
   * Set for a list whose items are components (`data-key` and `data-prop`): the item tag, the property that receives the item, the field that identifies it,
   * and where codegen found the component: defined and exported in a scanned directory, defined there without export, or not found (a component from elsewhere).
   */
  item?: { tag: string; prop: string; key: string; source?: "local" | "unexported" | "external" };
  // Not constrained to Element: checking it would need the class of a component whose template lists itself before that class is complete.
  rootElement?: unknown;
}

type ItemElement<L> = L extends { rootElement: infer E extends Element } ? E : Element;

type Unchecked = { [field: string]: unknown };

type ItemOf<L> = L extends { item: { tag: infer T; prop: infer P } }
  ? T extends keyof HTMLElementTagNameMap
    ? IsAny<HTMLElementTagNameMap[T]> extends true
      ? Unchecked
      : P extends keyof HTMLElementTagNameMap[T]
        ? IsAny<HTMLElementTagNameMap[T][P]> extends true
          ? Unchecked
          : NonNullable<HTMLElementTagNameMap[T][P]>
        : { dataPropNotOnItemComponent: P }
    : L extends { item: { source: "local" } }
      ? { itemComponentMissingFromTagMap: T; fix: "run ts-dom gen so ts-dom-tags.ts lists it" }
      : L extends { item: { source: "unexported" } }
        ? { itemComponentClassNotExported: T; fix: "export the class passed to define() so its type can be read" }
        : Unchecked
  : never;
type KeyField<L> = L extends { item: { key: infer K extends string } } ? { [Q in K]: string | number } : unknown;

/** What `items` takes for a list: the type of the item component's `data-prop` property, with the `data-key` field. */
export type ListItem<L> = ItemOf<L> & KeyField<L>;
export type TextOf<N extends string> = { [K in N]: TextValue };

interface Entry<L extends ListSchema> extends ItemContext<L> {
  item: unknown;
  /** Just created and update() has not been called yet */
  fresh: boolean;
}

/** The per-item context passed to update(). */
export interface ItemContext<L extends ListSchema> {
  /** The item's root element, typed by its tag: for a list with `data-key` and `data-prop`, the item component with its props. */
  readonly el: ItemElement<L>;
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
    private readonly binding?: { readonly key: string; readonly prop: string },
  ) {
    anchorSlot.set(anchor, proto.getAttribute("slot") ?? "");
  }

  /**
   * The items shown, in order. Assigning shows them: an element is kept for each key that stays, created for a new key and removed for a key that is gone, and the `data-prop` property receives each item that is not the same object as last time.
   * @throws When the template has no `data-key` and `data-prop`, when the value is not an array of objects, when an item has no string or number `data-key` field, or when two items have the same key
   */
  get items(): readonly ListItem<L>[] {
    return [...this.#items.values()]
      .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map((entry) => entry.item as ListItem<L>);
  }

  set items(items: readonly ListItem<L>[]) {
    if (!this.binding) {
      throw new Error("[list-not-bound] this list has no data-key and data-prop, so its items cannot be assigned. Fix: add them to the <template data-each>, e.g. data-key=\"id\" data-prop=\"item\", or call replace().");
    }
    if (!Array.isArray(items)) {
      throw new Error(`[invalid-items] items must be an array of objects, but got ${items === null ? "null" : typeof items}. Fix: assign an array, for example items = view.todos ?? [].`);
    }
    if (items.length) this.#checkProp();
    this.#reconcile(items, this.#keyOf, this.#assign, true);
  }

  // Checked once, before the list changes, so a wrong data-prop leaves no half-built list behind.
  #checkProp(): void {
    const prop = this.binding?.prop as string;
    const tag = this.proto.localName;
    if (!customElements.get(tag)) return;
    const probe = this.#items.values().next().value?.el ?? document.importNode(this.proto, false);
    if (!(prop in probe)) {
      throw new Error(`[item-prop-missing] <${tag}> has no "${prop}" property (data-prop). Fix: declare ${prop} in the component's props, or change data-prop.`);
    }
  }

  readonly #keyOf = (item: unknown): PropertyKey => {
    const field = this.binding?.key as string;
    if (typeof item !== "object" || item === null) {
      throw new Error(`[invalid-item] an item is ${item === null ? "null" : typeof item}, but items must be objects with a "${field}" field (data-key). Fix: pass objects, or fill a list of plain values with replace().`);
    }
    const key = (item as Record<string, unknown>)[field];
    if (typeof key !== "string" && typeof key !== "number") {
      throw new Error(`[missing-key] an item has no usable "${field}" field (data-key): it is ${key === undefined ? "missing" : typeof key}. Fix: give every item a string or number ${field}, or change data-key.`);
    }
    return key;
  };

  readonly #assign = (item: unknown, { el }: ItemContext<L>): void => {
    (el as unknown as Record<string, unknown>)[this.binding?.prop as string] = item;
  };

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
    // The prototype is in the inert document of a <template>, whose clones are never upgraded: importing it creates the item in this document, so its custom elements are upgraded before update() or the list sets their props.
    const el = document.importNode(this.proto, true);
    const holder = document.createDocumentFragment();
    holder.append(el);
    const conds = mountConds(holder);
    const text = mountHoles(holder) as TextOf<L["text"]>;
    // Before hideAll(), which takes the data-if blocks out of the item, so their data-ref and data-on-* elements are still found.
    const refs: Record<string, Element> = {};
    for (const n of [el, ...el.querySelectorAll("[data-ref]")]) {
      const name = n.getAttribute("data-ref");
      if (name) refs[name] = n;
    }
    this.onCreate?.(el);
    conds.hideAll();
    const show = conds.show as ItemContext<L>["show"];
    el.remove();
    const entry: Entry<L> = { el: el as ItemElement<L>, refs: refs as L["refs"], text, show, item: undefined, fresh: true };
    this.#byEl.set(el, { key, item: undefined });
    return entry;
  }

  /** Add or update a single item; a new item is appended at the end. */
  upsert<T>(key: PropertyKey, item: T, update: Update<L, T>): void {
    let entry = this.#items.get(key);
    if (!entry) {
      entry = this.#create(key);
      this.#items.set(key, entry);
      try {
        this.#run(entry, key, item, update);
      } catch (e) {
        this.#items.delete(key);
        throw e;
      }
      fromTemplate.add(entry.el);
      this.anchor.parentNode?.insertBefore(entry.el, this.anchor);
      return;
    }
    this.#run(entry, key, item, update);
  }

  #run<T>(entry: Entry<L>, key: PropertyKey, item: T, update: Update<L, T>, skip = false): void {
    if (skip && !entry.fresh && Object.is(entry.item, item)) return;
    this.#byEl.set(entry.el, { key, item });
    update(item, entry);
    entry.item = item;
    entry.fresh = false;
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
    this.#reconcile(items, key, update, opts.skipUnchanged === true);
  }

  /** A new item is updated before it is inserted, so a component in it is connected with its properties already set. */
  #reconcile<T>(items: readonly T[], key: (item: T) => PropertyKey, update: Update<L, T>, skipUnchanged: boolean): void {
    const next = new Set<PropertyKey>();
    for (const it of items) {
      const k = key(it);
      if (next.has(k)) throw new Error(`[duplicate-key] two items have the key ${String(k)}, so one element cannot show both. Fix: make the key unique for each item (the key() you pass to replace(), or the data-key field).`);
      next.add(k);
    }
    for (const k of this.#items.keys()) if (!next.has(k)) this.remove(k);

    const parent = this.anchor.parentNode;
    let after: Node = this.anchor;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i] as T;
      const k = key(it);
      let entry = this.#items.get(k);
      const created = !entry;
      if (!entry) {
        entry = this.#create(k);
        this.#items.set(k, entry);
        this.#run(entry, k, it, update);
      }
      if (entry.el.nextSibling !== after || entry.el.parentNode !== parent) {
        fromTemplate.add(entry.el);
        if (entry.el.parentNode === parent && parent?.moveBefore) parent.moveBefore(entry.el, after);
        else parent?.insertBefore(entry.el, after);
      }
      after = entry.el;
      if (!created) this.#run(entry, k, it, update, skipUnchanged);
    }
  }
}
