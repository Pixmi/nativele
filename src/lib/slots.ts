interface Slot {
  name: string;
  end: Comment;
  fallback: Node[];
  assigned: Set<Node>;
}

const slotOf = (n: Node): string | null =>
  n instanceof Element ? (n.getAttribute("slot") ?? "") : n instanceof Text && !n.data.trim() ? null : "";

/**
 * <slot> for Light DOM: at creation time the user's child nodes are placed into the matching positions;
 * afterwards a MutationObserver handles new children added directly to the element and removal of assigned nodes.
 */
export class LightSlots {
  #slots: Slot[] = [];
  #own = new Set<Node>();
  #observer: MutationObserver;

  constructor(
    private readonly host: HTMLElement,
    private readonly onChange: (name: string) => void,
  ) {
    this.#observer = new MutationObserver((records) => this.#flush(records));
  }

  project(frag: DocumentFragment, given: Node[]): void {
    for (const n of frag.childNodes) this.#own.add(n);
    for (const el of frag.querySelectorAll("slot")) {
      const name = el.getAttribute("name") ?? "";
      const nodes = given.filter((n) => slotOf(n) === name);
      const start = document.createComment(`slot:${name}`);
      const end = document.createComment(`/slot:${name}`);
      this.#own.add(start).add(end);
      const fallback = [...el.childNodes];
      el.replaceWith(start, ...(nodes.length ? nodes : fallback), end);
      this.#slots.push({ name, end, fallback, assigned: new Set(nodes) });
    }
  }

  /** Like the native slot.assignedNodes(): the nodes currently assigned to the slot (fallback content excluded). */
  assigned(name: string): Node[] {
    const slot = this.#slots.find((x) => x.name === name);
    return slot ? [...slot.assigned] : [];
  }

  observe(): void {
    this.#observer.observe(this.host, { childList: true, subtree: true, attributes: true, attributeFilter: ["slot"] });
  }

  disconnect(): void {
    this.#flush(this.#observer.takeRecords());
    this.#observer.disconnect();
  }

  /** Put a node into its slot; with no matching slot it is not rendered, like the native behavior. */
  #assign(n: Node, changed: Set<Slot>): void {
    const target = this.#slots.find((s) => s.name === slotOf(n));
    if (!target) {
      if (slotOf(n) !== null) n.parentNode?.removeChild(n);
      return;
    }
    if (target.assigned.size === 0) for (const f of target.fallback) f.parentNode?.removeChild(f);
    target.assigned.add(n);
    target.end.before(n);
    changed.add(target);
  }

  #unassign(n: Node, slot: Slot, changed: Set<Slot>): void {
    slot.assigned.delete(n);
    changed.add(slot);
    if (slot.assigned.size === 0) for (const f of slot.fallback) slot.end.before(f);
  }

  #flush(records: MutationRecord[]): void {
    const changed = new Set<Slot>();
    for (const r of records) {
      if (r.type === "attributes") {
        // An assigned node got a different slot attribute: reassign it immediately, like the native behavior
        const n = r.target;
        const current = this.#slots.find((s) => s.assigned.has(n));
        if (!current || current.name === slotOf(n)) continue;
        this.#unassign(n, current, changed);
        this.#assign(n, changed);
        continue;
      }
      for (const n of r.removedNodes) {
        if (n.parentNode) continue; // it was only moved, not really removed
        for (const s of this.#slots) if (s.assigned.has(n)) this.#unassign(n, s, changed);
      }
      if (r.target !== this.host) continue;
      for (const n of r.addedNodes) {
        if (this.#own.has(n) || this.#slots.some((s) => s.assigned.has(n))) continue;
        this.#assign(n, changed);
      }
    }
    for (const s of changed) this.onChange(s.name);
  }
}
