/** What `bind` needs from a store: the current value and a subscription. A read-only source can be bound too. */
export type ReadableStore<T> = Pick<Store<T>, "get" | "subscribe">;

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: (value: T) => void): () => void;
}

/** A tiny store: no dependency tracking, only get / set / subscribe. */
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(next) {
      const v = typeof next === "function" ? (next as (p: T) => T)(value) : next;
      if (Object.is(v, value)) return;
      value = v;
      // eslint-disable-next-line unicorn/no-useless-spread -- subscribers may be added or removed during notification, so iterate over a snapshot
      for (const fn of [...subs]) fn(value);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
  };
}
