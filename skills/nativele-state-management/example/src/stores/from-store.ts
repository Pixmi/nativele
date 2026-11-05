import type { ReadableStore } from "@nativele/ts-dom";

export interface ExternalStore<S> {
  getState(): S;
  subscribe(listener: () => void): () => void;
}

export function fromStore<S, T>(store: ExternalStore<S>, select: (state: S) => T): ReadableStore<T> {
  return {
    get: () => select(store.getState()),
    subscribe(fn) {
      let last = select(store.getState());
      return store.subscribe(() => {
        const next = select(store.getState());
        if (Object.is(next, last)) return;
        last = next;
        fn(next);
      });
    },
  };
}
