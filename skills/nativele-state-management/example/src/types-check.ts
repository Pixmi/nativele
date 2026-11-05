import type { CartBadge } from "./nv/cart-badge.ts";
import { cart } from "./stores/cart.ts";
import { store } from "./stores/counter.ts";

export function typesCheck(el: CartBadge): void {
  // @ts-expect-error a Zustand store has getState, not get
  el.bind(cart, () => {});
  // @ts-expect-error a Redux store has getState, not get
  el.bind(store, () => {});
  // @ts-expect-error a Redux listener gets no value
  el.bind({ get: store.getState, subscribe: store.subscribe }, () => {});
}
