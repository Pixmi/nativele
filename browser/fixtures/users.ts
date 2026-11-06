import { createStore } from "@nativele/ts-dom";

export interface User {
  id: number;
  name: string;
  email: string;
  status: "active" | "invited";
}

export interface Column {
  id: string;
  header: string;
  cell: (user: User) => Node | string;
  sort?: (a: User, b: User) => number;
}

export const users = createStore<readonly User[]>([]);

export function removeUser(id: number): void {
  users.set((list) => list.filter((u) => u.id !== id));
}
