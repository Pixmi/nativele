import { Component, define } from "@nativele/ts-dom";
import type { EventHit } from "@nativele/ts-dom";
import { removeUser, users } from "./users.js";
import type { Column, User } from "./users.js";
import tpl from "./user-table.html.js";

function sortRows(list: readonly User[], sort: Column["sort"], desc: boolean): readonly User[] {
  if (!sort) return list;
  const sorted = [...list].sort(sort);
  return desc ? sorted.reverse() : sorted;
}

export class UserTable extends Component(tpl, {
  props: { columns: [] as readonly Column[] },
  state: { users: [] as readonly User[], sortId: "", desc: false },
  derive: { rows: (s) => sortRows(s.users, s.columns.find((c) => c.id === s.sortId)?.sort, s.desc) },
}) {
  override connected(): void {
    this.bind(users, (list) => this.set({ users: list }));
    this.on(this.refs.body, "click", (e) => {
      const button = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-action]") : null;
      const user = button?.closest("user-row")?.user;
      if (user && button?.dataset.action === "remove") removeUser(user.id);
    });
  }
  sortBy(_e: MouseEvent, hit: EventHit<Column, "id">): void {
    this.set((s) => ({ sortId: hit.key, desc: s.sortId === hit.key && !s.desc }));
  }
  override render(
    view: { columns: readonly Column[]; rows: readonly User[]; sortId: string; desc: boolean },
    changed: ReadonlySet<"columns" | "rows" | "sortId" | "desc">,
  ): void {
    if (changed.has("columns") || changed.has("sortId") || changed.has("desc")) {
      this.lists.headers.replace(
        view.columns,
        (c) => c.id,
        (c, { text, refs, el }) => {
          text.header = c.header;
          refs.sort.hidden = c.sort === undefined;
          refs.label.hidden = c.sort !== undefined;
          el.ariaSort = c.id === view.sortId ? (view.desc ? "descending" : "ascending") : null;
        },
      );
    }
    if (changed.has("rows")) this.lists.rows.items = view.rows;
    if (changed.has("rows") || changed.has("columns")) {
      for (const u of view.rows) {
        const row = this.lists.rows.get(u.id);
        if (row) row.el.columns = view.columns;
      }
    }
  }
}
define("user-table", UserTable);
