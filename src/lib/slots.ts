interface Slot {
  name: string;
  start: Comment;
  end: Comment;
  /** Holds the fallback while the slot has assigned nodes, so `data-if` and lists inside it keep working on it; null while it is shown. */
  parked: DocumentFragment | null;
  assigned: Node[];
}

/** The slot a host child goes to: an element's slot attribute, "" for text; null for whitespace-only text and for comments, which a slot does not take, as natively. */
const slotOf = (n: Node): string | null => (n instanceof Element ? (n.getAttribute("slot") ?? "") : n instanceof Text && n.data.trim() ? "" : null);

/** Put `n` before `end`, with `moveBefore` where the browser has it, so a component moved into another slot stays connected (its `connected()` does not run again). */
function move(n: Node, end: Node): void {
  const parent = end.parentNode;
  if (parent?.moveBefore && n.isConnected && parent.isConnected) {
    try {
      parent.moveBefore(n, end);
      return;
    } catch {
      // moveBefore refuses some moves (another root, a node type it cannot move); a plain insert still works.
    }
  }
  parent?.insertBefore(n, end);
}

/** The nodes a Nativele list or data-if put in after a component was built: content written in HTML, which the slots of a Light DOM element around it take, as they take the element's children when it is built. */
export const fromTemplate = new WeakSet<Node>();

/** The slot each anchor of a Nativele list or data-if serves: the slot its elements go to. A Light DOM element puts the anchor in that slot's range, so the list and data-if insert their elements straight into the slot. */
export const anchorSlot = new WeakMap<Comment, string>();

/** The tags `unplaced-child` was logged for. */
const warnedForeign = new Set<string>();

/** The tags and slot names `unslotted-node` was logged for, so a page logs each once. */
const warned = new Set<string>();

/**
 * <slot> for Light DOM: each slot is the range between two comments. Placement is decided from where the nodes are, never from the order of mutation records:
 * after every change in the element, each user node at the element's top level or in a slot range is put into the range of its slot.
 */
export class LightSlots {
  #slots: Slot[] = [];
  #own = new WeakSet<Node>();
  /** The children the element had when it was built. */
  #given = new WeakSet<Node>();
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
    for (const n of given) this.#given.add(n);
    for (const el of frag.querySelectorAll("slot")) {
      const name = el.getAttribute("name") ?? "";
      const placed = given.filter((n) => slotOf(n) === name || (n instanceof Comment && anchorSlot.get(n) === name));
      const nodes = placed.filter((n) => slotOf(n) === name);
      const start = document.createComment(`slot:${name}`);
      const end = document.createComment(`/slot:${name}`);
      const fallback = [...el.childNodes];
      for (const n of [start, end, ...fallback]) this.own(n);
      let parked: DocumentFragment | null = null;
      if (nodes.length) {
        parked = document.createDocumentFragment();
        parked.append(...fallback);
      }
      el.replaceWith(start, ...(nodes.length ? placed : [...placed, ...fallback]), end);
      this.#slots.push({ name, start, end, parked, assigned: nodes });
    }
    for (const n of frag.childNodes) if (!user.has(n)) this.own(n);
    for (const n of given) if (slotOf(n) !== null && !this.#slots.some((s) => s.name === slotOf(n))) this.#drop(n);
    // A comment is no slot's content but stays a child of the host, as natively: a framework may keep an anchor there.
    frag.append(...given.filter((n) => n instanceof Comment && !this.#slots.some((s) => s.name === anchorSlot.get(n))));
  }

  /** A child that other code (a framework, appendChild) added after the element was built stays where it was put; Light DOM slots take only content written in HTML. Said once per tag. */
  #foreign(): void {
    const tag = this.host.localName;
    if (warnedForeign.has(tag)) return;
    warnedForeign.add(tag);
    console.warn(`<${tag}>: [unplaced-child] a child was added by code after the element was built, and Light DOM slots place only content written in HTML, so it stays where it was put. Fix: use shadow: true for children a framework or code adds, or put the content into an element of the template that the component exposes through a ref.`);
  }

  /** A Light DOM element cannot keep a child it does not render, as a shadow host does, so the node is removed; that is said once per slot name. */
  #drop(n: Node): void {
    n.parentNode?.removeChild(n);
    const name = slotOf(n) as string;
    const key = `${this.host.localName}\0${name}`;
    if (warned.has(key)) return;
    warned.add(key);
    const which = name ? `slot="${name}"` : "no slot attribute";
    const slot = name ? `<slot name="${name}">` : "<slot>";
    console.warn(`<${this.host.localName}>: [unslotted-node] a child node with ${which} has no matching slot in the template, so it was removed from the element. Fix: add ${slot} to the template, or give the node the slot attribute of a slot the template has.`);
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
  /** Content written in HTML: a child the element had when it was built, or a node a Nativele list or data-if put in. Only it is placed in slots. */
  #placed = (n: Node): boolean => this.#user(n) && (this.#given.has(n) || fromTemplate.has(n));

  #place(): void {
    const at = new Map<Node, Slot | null>();
    for (const n of this.host.childNodes) at.set(n, null);
    for (const s of this.#slots) for (const n of this.#range(s)) at.set(n, s);
    for (const [n, here] of at) {
      if (!this.#user(n)) continue;
      if (!this.#placed(n)) {
        this.#foreign();
        continue;
      }
      const target = this.#slots.find((s) => s.name === slotOf(n));
      if (!target) this.#drop(n);
      else if (here !== target) move(n, target.end);
    }
    const changed: string[] = [];
    for (const s of this.#slots) {
      const range = this.#range(s);
      const nodes = range.filter(this.#placed);
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
