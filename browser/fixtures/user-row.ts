import { Component, define } from "@nativele/ts-dom";
import type { Column, User } from "./users.js";
import tpl from "./user-row.html.js";

export class UserRow extends Component(tpl, {
  props: { user: null as User | null, columns: [] as readonly Column[] },
}) {
  override render(view: { user: User | null; columns: readonly Column[] }): void {
    const { user } = view;
    if (!user) return;
    this.refs.tr.replaceChildren(
      ...view.columns.map((c) => {
        const td = document.createElement("td");
        td.append(c.cell(user));
        return td;
      }),
    );
  }
}
define("user-row", UserRow);
