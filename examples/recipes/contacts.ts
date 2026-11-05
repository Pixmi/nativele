import { createStore } from "@nativele/ts-dom";

export interface Contact {
  id: number;
  name: string;
  email: string;
}

export type Status = "idle" | "loading" | "error" | "ready";

export const contacts = createStore({ status: "idle" as Status, error: "", items: [] as readonly Contact[], nextId: 1 });

export async function loadContacts(): Promise<void> {
  contacts.set((s) => ({ ...s, status: "loading", error: "" }));
  try {
    const res = await fetch("/api/contacts");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = (await res.json()) as Contact[];
    contacts.set((s) => ({ ...s, status: "ready", items, nextId: Math.max(0, ...items.map((c) => c.id)) + 1 }));
  } catch (e) {
    contacts.set((s) => ({ ...s, status: "error", error: e instanceof Error ? e.message : String(e) }));
  }
}

export function addContact(name: string, email: string): void {
  contacts.set((s) => ({ ...s, items: [...s.items, { id: s.nextId, name, email }], nextId: s.nextId + 1 }));
}

export function removeContact(id: number): void {
  contacts.set((s) => ({ ...s, items: s.items.filter((c) => c.id !== id) }));
}
