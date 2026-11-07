interface Slot {
  name: string;
  start: Comment;
  end: Comment;
  /** Holds the fallback while the slot has assigned nodes, so `data-if` and lists inside it keep working on it; null while it is shown. */
  parked: DocumentFragment | null;
  assigned: Node[];
}

const slotOf = (n: Node): string | null =>
  n instanceof Element ? (n.getAttribute("slot") ?? "") : n instanceof Text && !n.data.trim() ? null : "";

/**
 * <slot> for Light DOM: each slot is the range between two comments. Placement is decided from where the nodes are, never from the order of mutation records:
 * after every change in the element, each user node at the element's top level or in a slot range is put into the range of its slot.
 */
export class LightSlots {
  #slots: Slot[] = [];
  #own = new WeakSet<Node>();
  #observer = new MutationObserver(() => this.#place());

  constructor(
    private readonly host: HTMLElement,
    private readonly onChange: (name: string) => void,
  ) {}

  own(n: Node): void {
    this.#own.add(n);
  }

  project(frag: DocumentFragment, given: Node[]): void {
    const user = new Set(given);
    for (const el of frag.querySelectorAll("slot")) {
      const name = el.getAttribute("name") ?? "";
      const nodes = given.filter((n) => slotOf(n) === name);
      const start = document.createComment(`slot:${name}`);
      const end = document.createComment(`/slot:${name}`);
      const fallback = [...el.childNodes];
      for (const n of [start, end, ...fallback]) this.own(n);
      let parked: DocumentFragment | null = null;
      if (nodes.length) {
        parked = document.createDocumentFragment();
        parked.append(...fallback);
      }
      el.replaceWith(start, ...(nodes.length ? nodes : fallback), end);
      this.#slots.push({ name, start, end, parked, assigned: nodes });
    }
    for (const n of frag.childNodes) if (!user.has(n)) this.own(n);
  }

  /** Like the native slot.assignedNodes(): the nodes currently assigned to the slot (fallback content excluded). */
  assigned(name: string): Node[] {
    return [...(this.#slots.find((x) => x.name === name)?.assigned ?? [])];
  }

  observe(): void {
    this.#place();
    this.#observer.observe(this.host, { childList: true, subtree: true, attributes: true, attributeFilter: ["slot"] });
  }

  disconnect(): void {
    if (this.#observer.takeRecords().length) this.#place();
    this.#observer.disconnect();
  }

  #range(s: Slot): Node[] {
    const nodes: Node[] = [];
    if (s.start.parentNode !== s.end.parentNode) return nodes;
    for (let n = s.start.nextSibling; n && n !== s.end; n = n.nextSibling) nodes.push(n);
    return nodes;
  }

  #user = (n: Node): boolean => !this.#own.has(n) && slotOf(n) !== null;

  #place(): void {
    const at = new Map<Node, Slot | null>();
    for (const n of this.host.childNodes) at.set(n, null);
    for (const s of this.#slots) for (const n of this.#range(s)) at.set(n, s);
    for (const [n, here] of at) {
      if (!this.#user(n)) continue;
      const target = this.#slots.find((s) => s.name === slotOf(n));
      // With no matching slot the node is not rendered, like the native behavior
      if (!target) n.parentNode?.removeChild(n);
      else if (here !== target) target.end.before(n);
    }
    const changed: string[] = [];
    for (const s of this.#slots) {
      const range = this.#range(s);
      const nodes = range.filter(this.#user);
      if (nodes.length && !s.parked) {
        s.parked = document.createDocumentFragment();
        s.parked.append(...range.filter((n) => this.#own.has(n)));
      } else if (!nodes.length && s.parked) {
        s.end.before(s.parked);
        s.parked = null;
      }
      if (nodes.length !== s.assigned.length || nodes.some((n, i) => n !== s.assigned[i])) {
        s.assigned = nodes;
        changed.push(s.name);
      }
    }
    for (const name of changed) this.onChange(name);
  }
}
