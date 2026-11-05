import { createStore } from "zustand/vanilla";

export interface CartState {
  items: string[];
  note: string;
  add(item: string): void;
  setNote(note: string): void;
}

export const cart = createStore<CartState>()((set) => ({
  items: [],
  note: "",
  add: (item) => set((s) => ({ items: [...s.items, item] })),
  setNote: (note) => set({ note }),
}));
