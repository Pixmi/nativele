import type { List } from "./list.ts";
import type { TextOf } from "./list.ts";
import { LightSlots } from "./slots.ts";
import type { ReadableStore } from "./store.ts";
import { attrNameOf, RESERVED_NAMES } from "./reserved.ts";
import { createInjector, extractSheets } from "./style.ts";
import type { Schema, Template } from "./template.ts";
import { mountTemplate } from "./mount.ts";

export interface ComponentOptions {
  /**
   * Default false: render into the element itself (Light DOM); <slot> content is moved by the library at creation time.
   * true: use Shadow DOM: styles are isolated and <slot> is the browser's native behavior.
   */
  shadow?: boolean;
}

/** Event declaration: put `event<DetailType>()` in the `emits` option; the type is only used to check emit() and receivers. */
export interface EventDecl<T = void> {
  /** Default false: the event only reaches the child's own tag, so the handler is always written on `<child data-on-xxx>` in the parent's HTML. */
  readonly bubbles?: boolean;
  /** Type inference only; does not exist at runtime. */
  readonly "~detail"?: T;
}
export function event<T = void>(opts: { bubbles?: boolean } = {}): EventDecl<T> {
  return { bubbles: opts.bubbles };
}
type DetailOf<D> = D extends EventDecl<infer T> ? T : never;
type EmitArgs<D> = [DetailOf<D>] extends [void] ? [detail?: undefined] : [detail: DetailOf<D>];

/** The data passed to render(): state, props and derived values merged. */
export type View<D, R> = Readonly<D> & Readonly<R>;

export interface DataOptions<St extends object, P extends object, R, E extends Record<string, EventDecl<unknown>>> extends ComponentOptions {
  /** Data owned by the component and changed only through set(). Fields named like a {{ hole }} or data-if in the HTML bind automatically. */
  state?: St;
  /**
   * Data provided by the parent (read-only): the parent sets it with an HTML attribute (`user-name="Ada"`) or a JS property (`el.userName = "Ada"`).
   * The default value decides the type and how attributes are converted (string / number / boolean); arrays and objects can only be passed as JS properties.
   * A component must not modify its props; use emit() to notify the parent.
   */
  props?: P;
  /**
   * Derived values: computed from state and props, usable directly by {{ holes }}, data-if and render().
   * Recomputed after every data change (there is no dependency tracking).
   */
  derive?: { [K in keyof R]: (s: Readonly<St & P>) => R[K] };
  /** The events this component emits. */
  emits?: E;
}

type Keys<St, P, R> = (keyof St | keyof P | keyof R) & string;
type MissingBindings<S extends Schema, St, P, R> = Exclude<S["text"] | S["ifs"], Keys<St, P, R>>;
type Conflicts<St, P, R> = (keyof St & keyof P) | (keyof St & keyof R) | (keyof P & keyof R);
type ReservedProps<P> = Extract<keyof P, keyof HTMLElement | "refs" | "lists" | "text" | "root" | "state" | "props" | "set" | "batch" | "render" | "show" | "bind" | "on" | "emit">;
type NativeEmits<E> = Extract<keyof E, keyof HTMLElementEventMap>;
type Problems<S extends Schema, St, P, R, E> = ([keyof St | keyof P | keyof R] extends [never] ? unknown : [MissingBindings<S, St, P, R>] extends [never] ? unknown : { missingStateKeys: MissingBindings<S, St, P, R> }) &
  ([Conflicts<St, P, R>] extends [never] ? unknown : { conflictingKeys: Conflicts<St, P, R> }) &
  ([ReservedProps<P>] extends [never] ? unknown : { reservedPropNames: ReservedProps<P> }) &
  ([NativeEmits<E>] extends [never] ? unknown : { nativeEventNames: NativeEmits<E> });
type IsClean<T> = unknown extends T ? true : false;

type Lists<S extends Schema> = { [K in keyof S["lists"]]: List<S["lists"][K]> };

/** The second argument received by a data-on-* handler method. */
export interface EventHit<Item = unknown> {
  /** The element that carries the data-on-* attribute */
  readonly el: Element;
  /** When the event happened inside a list item: the key of that item */
  readonly key?: PropertyKey;
  /** When the event happened inside a list item: the data last passed to update() for that item. Annotate the handler, e.g. `hit: EventHit<Todo>`, to type it. */
  readonly item?: Item;
}

export interface ComponentInstance<S extends Schema> extends HTMLElement {
  /** Type inference only (define() uses it to check that data-on-* methods exist); does not exist at runtime. */
  readonly "~events"?: S["events"];
  readonly refs: S["refs"];
  readonly lists: Lists<S>;
  /** Maps to {{ name }}: assigning a value updates every place the hole appears. */
  readonly text: TextOf<S["text"]>;
  readonly root: ShadowRoot | HTMLElement;
  /** Maps to data-if: hidden by default (removed from the DOM and replaced by a comment); shown when true. */
  show(name: S["ifs"], on: boolean): void;
  /** Subscribe to a store: calls fn immediately once, and unsubscribes automatically when the element is removed. */
  bind<T>(store: ReadableStore<T>, fn: (value: T) => void): void;
  /** Add an event listener that is removed automatically when the element is removed. Returns a function to remove it manually. */
  on<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): () => void;
  on(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): () => void;
  /** Register a cleanup function that runs when the element is removed. */
  onCleanup(fn: () => void): void;
  /** The nodes currently assigned to the slot (fallback content excluded). In Shadow mode this is the native `slot.assignedNodes()`. */
  assignedNodes(name: S["slots"]): Node[];
  connected(): void;
  disconnected(): void;
  /** Light mode: called when slot content changes after creation (the initial assignment does not trigger it). */
  slotchange(name: S["slots"]): void;
}

/** Members added when the `state` / `props` / `derive` / `emits` options are used. */
export interface StatefulInstance<S extends Schema, St extends object, P extends object, R, E extends Record<string, EventDecl<unknown>>> extends ComponentInstance<S> {
  /** The component's own data (read-only). Use set() to change it. */
  readonly state: Readonly<St>;
  /** Data provided by the parent (read-only). Do not assign it inside the component; use emit() to notify the parent. */
  readonly props: Readonly<P>;
  /**
   * The only way to change state: shallow-merges the patch, and does nothing when no field actually changed.
   * When something changed it synchronously updates the same-named {{ holes }} and data-if, then calls render(). It cannot change props.
   */
  set(patch: Partial<St> | ((s: Readonly<St>) => Partial<St>)): void;
  /** Coalesce several set() calls and prop changes: the view is updated and render() is called once, after fn returns. */
  batch(fn: () => void): void;
  /**
   * Override it to handle updates that automatic binding cannot do (lists, attributes, focus, ...).
   * `view` is state, props and derived values merged; `changed` holds the fields that changed (all of them on the first render).
   */
  render(view: View<St & P, R>, changed: ReadonlySet<keyof St | keyof P>): void;
  /** Emit an event declared in `emits` (it does not bubble by default and only reaches this element itself). */
  emit<K extends keyof E & string>(name: K, ...detail: EmitArgs<E[K]>): void;
  /** Type inference only (EmitEvent uses it to get the detail type of an event); does not exist at runtime. */
  readonly "~emits"?: { [K in keyof E]: DetailOf<E[K]> };
}

/** The type of an event emitted by a component: `EmitEvent<FormField, "change-value">` is `CustomEvent<{ value: string }>`. */
export type EmitEvent<I, N extends string> = I extends { readonly "~emits"?: infer M }
  ? N extends keyof NonNullable<M>
    ? CustomEvent<NonNullable<M>[N]>
    : never
  : never;

const NON_BUBBLING = new Set([
  "focus", "blur", "mouseenter", "mouseleave", "pointerenter", "pointerleave", "load", "error", "scroll", "scrollend", "toggle", "beforetoggle", "cancel", "close", "invalid",
  "abort", "canplay", "canplaythrough", "durationchange", "emptied", "ended", "loadeddata", "loadedmetadata", "loadstart", "pause", "play", "playing", "progress", "ratechange", "seeked", "seeking", "stalled", "suspend", "timeupdate", "volumechange", "waiting",
]);

export function Component<S extends Schema>(
  tpl: Template<S>,
  // The data options are explicitly excluded so that an options object that has them never matches this overload;
  // otherwise TypeScript tries this overload first and cannot infer the type of the parameter of `derive`.
  opts?: ComponentOptions & { state?: never; props?: never; derive?: never; emits?: never },
): new () => ComponentInstance<S>;
/**
 * With the `state` / `props` / `derive` / `emits` options, {{ holes }} and data-if in the HTML bind to same-named data.
 * When something is wrong the return type becomes an object type describing the problem, so
 * `class X extends Component(...)` fails in tsc and lists the names:
 * `missingStateKeys` (the HTML uses a name that does not exist), `conflictingKeys` (state / props / derive share a name),
 * `reservedPropNames` (a prop shares a name with HTMLElement or a ts-dom member), `nativeEventNames` (emits shares a name with a native event).
 * (The check lives in the return type, not in the parameter: in the parameter it prevents TypeScript from inferring the type of derive.)
 */
export function Component<
  S extends Schema,
  St extends object = Record<never, never>,
  P extends object = Record<never, never>,
  R = Record<never, never>,
  E extends Record<string, EventDecl<unknown>> = Record<never, never>,
>(
  tpl: Template<S>,
  opts: DataOptions<St, P, R, E>,
): IsClean<Problems<S, St, P, R, E>> extends true ? new () => StatefulInstance<S, St, P, R, E> & P : Problems<S, St, P, R, E>;
export function Component(
  tpl: Template<Schema>,
  opts: ComponentOptions & {
    state?: object;
    props?: object;
    derive?: Record<string, (s: never) => unknown>;
    emits?: Record<string, EventDecl<unknown>>;
  } = {},
): unknown {
  const shadow = opts.shadow === true;
  const hasState = opts.state !== undefined || opts.props !== undefined || opts.derive !== undefined;
  const propDefaults = (opts.props ?? {}) as Record<string, unknown>;
  const propKeys = Object.keys(propDefaults);
  const stateKeys = Object.keys(opts.state ?? {});
  // Reject declarations that would cause hard-to-trace problems as early as possible, at definition time
  for (const k of propKeys) {
    if (k in HTMLElement.prototype || RESERVED_NAMES.has(k)) throw new Error(`[reserved-prop] props.${k} has the same name as a member of HTMLElement or ts-dom, which it would shadow. Fix: rename the prop (e.g. ${k}Text).`);
    if (stateKeys.includes(k)) throw new Error(`[conflicting-keys] "${k}" is declared in both state and props. Data must have exactly one owner. Fix: keep it in props (the parent owns it) or in state (the component owns it), not both.`);
  }
  for (const k of Object.keys(opts.derive ?? {})) {
    if (stateKeys.includes(k) || propKeys.includes(k)) throw new Error(`[conflicting-keys] derive.${k} has the same name as a state or props field. Fix: rename the derived value.`);
  }
  for (const k of Object.keys(opts.emits ?? {})) {
    if (`on${k}` in HTMLElement.prototype) throw new Error(`[native-event-name] emits.${k} has the same name as a native DOM event. Fix: rename the event (for example with a prefix such as "field-${k}").`);
  }
  // Only props whose default is a string / number / boolean can be set from HTML attributes
  const attrProps = new Map<string, { key: string; kind: "string" | "number" | "boolean" }>();
  for (const k of propKeys) {
    const t = typeof propDefaults[k];
    if (t === "string" || t === "number" || t === "boolean") attrProps.set(attrNameOf(k), { key: k, kind: t });
  }
  const content = tpl.build();

  // Light mode: extract the template's top-level <style> elements and inject them once per document, not once per instance
  const injectStyles = createInjector(shadow ? [] : extractSheets(content));

  // Scan once at definition time: which data-on-* events and methods the template (list items included) uses
  const eventTypes = new Set<string>();
  const methodNames = new Set<string>();
  (function scan(root: ParentNode) {
    for (const el of root.querySelectorAll("*")) {
      for (const a of el.attributes) {
        if (!a.name.startsWith("data-on-")) continue;
        eventTypes.add(a.name.slice("data-on-".length));
        methodNames.add(a.value.trim());
      }
      if (el instanceof HTMLTemplateElement) scan(el.content);
    }
  })(content);
  const eventSelector = [...eventTypes].map((t) => `[data-on-${t}]`).join(",");

  class Base extends HTMLElement {
    refs = {} as Record<string, Element>;
    lists = {} as Record<string, List>;
    text = {} as Record<string, unknown>;
    root: ShadowRoot | HTMLElement;
    #show: (name: string, on: boolean) => void = () => {};
    #condNames: ReadonlySet<string> = new Set();
    #slots: LightSlots | null = null;
    #cleanups: (() => void)[] = [];
    #owned = new WeakMap<Element, Map<string, string>>();
    #built = false;
    #started = false;

    // state
    #state: Record<string, unknown> = { ...(opts.state as Record<string, unknown> | undefined) };
    #props: Record<string, unknown> = { ...propDefaults };
    #derived: Record<string, unknown> = {};
    #ready = false;
    #dirtyFrom: Record<string, unknown> | null = null;
    #batchDepth = 0;
    #rendering = false;

    static {
      // Props are exposed as accessor properties of the element, so a parent can assign them directly: child.userName = "Ada"
      for (const k of propKeys) {
        Object.defineProperty(this.prototype, k, {
          configurable: true,
          enumerable: true,
          get(this: Base) {
            return this.#props[k];
          },
          set(this: Base, v: unknown) {
            this.#setProp(k, v);
          },
        });
      }
    }

    static get observedAttributes(): string[] {
      return [...attrProps.keys()];
    }

    constructor() {
      super();
      // A prop assigned before the element was upgraded became an own property that shadows the accessor: take the value back and delete it
      for (const k of propKeys) {
        if (Object.hasOwn(this, k)) {
          const v = (this as unknown as Record<string, unknown>)[k];
          delete (this as unknown as Record<string, unknown>)[k];
          this.#props[k] = v;
        }
      }
      this.root = shadow ? this.attachShadow({ mode: "open" }) : this;
      if (shadow) this.#build();
    }

    #build(): void {
      if (this.#built) return;
      this.#built = true;
      if (!shadow) injectStyles(this);
      // Light mode: take the user's child nodes out first and put them back later according to slot names
      const given = shadow ? [] : [...this.childNodes];
      if (!shadow) this.replaceChildren();
      const frag = content.cloneNode(true) as DocumentFragment;
      const mounted = mountTemplate(frag, (el) => this.#register(el));
      this.lists = mounted.lists;
      this.refs = mounted.refs;
      this.#register(frag);
      const conds = mounted.conds;
      this.#show = conds.show;
      this.#condNames = conds.names;
      this.text = mounted.text;
      if (!shadow) {
        this.#slots = new LightSlots(this, (name) => this.slotchange(name));
        this.#slots.project(frag, given);
      }
      conds.hideAll(); // hidden by default; TypeScript decides when to show them
      this.root.append(frag);
      // Event delegation: one listener per event type on the root.
      // Native bubbling events use the bubble phase (so a user's stopPropagation is respected);
      // the rest (non-bubbling native events and custom events emitted by child components) need the capture phase.
      for (const type of eventTypes) {
        const nativeBubbling = `on${type}` in HTMLElement.prototype && !NON_BUBBLING.has(type);
        this.root.addEventListener(type, (e) => this.#dispatch(e), !nativeBubbling);
      }
    }

    /** Register the data-on-* attributes in a subtree (only elements from our own template count, not user slot content). */
    #register(root: Element | DocumentFragment): void {
      if (!eventSelector) return;
      const els = root.querySelectorAll(eventSelector);
      for (const el of root instanceof Element && root.matches(eventSelector) ? [root, ...els] : els) {
        const map = new Map<string, string>();
        for (const a of el.attributes) {
          if (a.name.startsWith("data-on-")) map.set(a.name.slice("data-on-".length), a.value.trim());
        }
        this.#owned.set(el, map);
      }
    }

    #dispatch(e: Event): void {
      const bubbling = e.bubbles;
      for (let n = e.target as Node | null; n && n !== this.root; n = n.parentNode) {
        if (n instanceof Element) {
          const method = this.#owned.get(n)?.get(e.type);
          if (method) {
            const fn = (this as unknown as Record<string, unknown>)[method];
            if (typeof fn !== "function") throw new Error(`<${this.localName}>: [missing-handler] data-on-${e.type}="${method}" refers to a method this component does not have. Fix: add a public method ${method}(e, hit) to the class.`);
            let hit: { key: PropertyKey; item: unknown } | undefined;
            for (const l of Object.values(this.lists)) if ((hit = l.itemOf(n))) break;
            fn.call(this, e, { el: n, key: hit?.key, item: hit?.item } satisfies EventHit);
            if (e.cancelBubble) return;
          }
        }
        if (!bubbling) return; // non-bubbling events (focus, emit by default) only go to the target itself
      }
    }

    // ---- state ----
    get state(): Record<string, unknown> {
      return this.#state;
    }

    get props(): Record<string, unknown> {
      return this.#props;
    }

    emit(name: string, detail?: unknown): void {
      const decl = opts.emits?.[name];
      if (!decl) throw new Error(`<${this.localName}>: [undeclared-event] emit("${name}") was called but the event is not declared. Fix: add it to the emits option: emits: { "${name}": event<Detail>() }.`);
      this.dispatchEvent(new CustomEvent(name, { detail, bubbles: decl.bubbles === true, composed: false }));
    }

    set(patch: Record<string, unknown> | ((s: Record<string, unknown>) => Record<string, unknown>)): void {
      const p = typeof patch === "function" ? patch(this.#state) : patch;
      let next = this.#state;
      for (const k of Object.keys(p)) {
        if (Object.hasOwn(this.#props, k)) {
          throw new Error(`<${this.localName}>: [props-mutation] "${k}" is a prop controlled by the parent, so set() cannot change it. Fix: emit an event so the parent changes it, or declare it in state instead.`);
        }
        if (Object.is(next[k], p[k])) continue;
        if (next === this.#state) next = { ...next };
        next[k] = p[k];
      }
      if (next === this.#state) return; // nothing changed: no update and no render() call
      this.#dirtyFrom ??= this.#merged();
      this.#state = next;
      this.#flushIfIdle();
    }

    #merged(): Record<string, unknown> {
      return { ...this.#state, ...this.#props };
    }

    #setProp(key: string, value: unknown): void {
      if (Object.is(this.#props[key], value)) return;
      this.#dirtyFrom ??= this.#merged();
      this.#props = { ...this.#props, [key]: value };
      this.#flushIfIdle();
    }

    attributeChangedCallback(attr: string, _old: string | null, value: string | null): void {
      const p = attrProps.get(attr);
      if (!p) return;
      const def = propDefaults[p.key];
      let v: unknown;
      if (p.kind === "boolean") v = value !== null && value !== "false";
      else if (p.kind === "number") {
        v = value === null ? def : Number(value);
        if (Number.isNaN(v)) {
          console.warn(`<${this.localName}>: [invalid-prop-value] the attribute ${attr}="${value}" is not a number; using the default value instead. Fix: write a numeric value such as ${attr}="5".`);
          v = def;
        }
      } else v = value ?? def;
      this.#setProp(p.key, v);
    }

    batch(fn: () => void): void {
      this.#batchDepth++;
      try {
        fn();
      } finally {
        this.#batchDepth--;
        this.#flushIfIdle();
      }
    }

    #flushIfIdle(): void {
      if (this.#ready && this.#batchDepth === 0 && !this.#rendering) this.#flush();
    }

    #flush(): void {
      for (let guard = 0; this.#dirtyFrom; guard++) {
        if (guard >= 50) {
          this.#dirtyFrom = null;
          throw new Error(`<${this.localName}>: [render-loop] render() keeps calling set() and the state never settles (50 passes). Fix: only call set() inside render() when the value actually changes, or move the logic into derive.`);
        }
        const from = this.#dirtyFrom;
        this.#dirtyFrom = null;
        this.#rendering = true;
        try {
          this.#apply(from, this.#merged());
        } finally {
          this.#rendering = false;
        }
      }
    }

    /** Bind same-named {{ holes }} and data-if automatically, then call render(). `from` is null for the first render (all fields). */
    #apply(from: Record<string, unknown> | null, to: Record<string, unknown>): void {
      const keys = from ? [...new Set([...Object.keys(from), ...Object.keys(to)])].filter((k) => !Object.is(from[k], to[k])) : Object.keys(to);
      if (!keys.length) return;
      const bindName = (name: string, value: unknown): void => {
        if (Object.hasOwn(this.text, name)) this.text[name] = value;
        if (this.#condNames.has(name)) this.#show(name, Boolean(value));
      };
      for (const k of keys) bindName(k, to[k]);
      const derived: Record<string, unknown> = {};
      for (const [name, fn] of Object.entries(opts.derive ?? {})) {
        const v = (fn as (s: unknown) => unknown)(to);
        derived[name] = v;
        if (!from || !Object.is(this.#derived[name], v)) bindName(name, v);
      }
      this.#derived = derived;
      this.render({ ...to, ...derived }, new Set(keys));
    }

    // ---- everything else ----
    show(name: string, on: boolean): void {
      this.#show(name, on);
    }

    bind<T>(store: ReadableStore<T>, fn: (value: T) => void): void {
      fn(store.get());
      this.#cleanups.push(store.subscribe(fn));
    }

    on(target: EventTarget, type: string, fn: (e: never) => void, opts?: AddEventListenerOptions): () => void {
      const l = fn as EventListener;
      target.addEventListener(type, l, opts);
      const off = () => target.removeEventListener(type, l, opts);
      this.#cleanups.push(off);
      return off;
    }

    onCleanup(fn: () => void): void {
      this.#cleanups.push(fn);
    }

    connectedCallback(): void {
      // While the parser creates the element its children have not arrived yet, so Light mode waits for the document to be parsed before reading slot content
      if (!shadow && !this.#built && document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => this.isConnected && this.#start(), { once: true });
        return;
      }
      this.#start();
    }

    #start(): void {
      this.#build();
      if (!this.#started) {
        this.#started = true;
        for (const m of methodNames) {
          if (typeof (this as unknown as Record<string, unknown>)[m] !== "function") {
            throw new Error(`<${this.localName}>: [missing-handler] the HTML refers to the method ${m} (data-on-*), but the component does not have it. Fix: add a public method ${m}(e, hit) to the class.`);
          }
        }
        if (hasState) {
          // First render: write all the current data into the view
          this.#ready = true;
          this.#dirtyFrom = null;
          this.#rendering = true;
          try {
            this.#apply(null, this.#merged());
          } finally {
            this.#rendering = false;
          }
          this.#flush(); // handle set() calls made inside render()
        }
      }
      this.#slots?.observe();
      this.connected();
    }

    /** Opts in to atomic moves (`moveBefore`): a moved component stays connected, keeping its state, focus and subscriptions. */
    connectedMoveCallback(): void {}

    disconnectedCallback(): void {
      this.#slots?.disconnect();
      for (const fn of this.#cleanups.splice(0)) fn();
      this.disconnected();
    }

    connected(): void {}
    disconnected(): void {}
    slotchange(_name: string): void {}
    render(_view: unknown, _changed: ReadonlySet<string>): void {}

    assignedNodes(name: string): Node[] {
      if (this.#slots) return this.#slots.assigned(name);
      const sel = name ? `slot[name="${name.replaceAll('"', '\\"')}"]` : "slot:not([name])";
      return this.shadowRoot?.querySelector<HTMLSlotElement>(sel)?.assignedNodes() ?? [];
    }
  }
  return Base;
}

type CheckHandlers<I> = I extends { readonly "~events"?: infer E }
  ? [Exclude<NonNullable<E>, keyof I>] extends [never]
    ? unknown
    : { missingHandlers: Exclude<NonNullable<E>, keyof I> }
  : unknown;

/**
 * Register a custom element. Also checks types: every method name referenced by data-on-* in the HTML must exist on the
 * component as a public method, otherwise tsc reports an error that lists the missing names (`missingHandlers`).
 */
export function define<C extends abstract new (...args: never[]) => HTMLElement>(
  name: string,
  ctor: C & CheckHandlers<InstanceType<C>>,
): void {
  if (!customElements.get(name)) customElements.define(name, ctor as unknown as CustomElementConstructor);
}
