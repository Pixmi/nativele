import { Component, define } from "nativel";
import tpl from "./user-card.html.js";

export interface Tag {
  id: number;
  label: string;
  hot?: boolean;
}

export class UserCard extends Component(tpl, {
  // All the data lives here; {{ name }} and data-if="admin" bind to the same-named fields automatically
  state: { name: "Ada", admin: false, tags: [{ id: 1, label: "ts", hot: true }] as Tag[] },
}) {
  /** Called by data-on-click="toggleAdmin" in the HTML */
  toggleAdmin(): void {
    this.set((s) => ({ admin: !s.admin }));
  }

  /** Updates that automatic binding cannot do (the list) go here; `changed` tells you which fields changed */
  override render(v: { tags: Tag[] }, changed: ReadonlySet<string>): void {
    if (!changed.has("tags")) return;
    this.lists.tags.replace(
      v.tags,
      (t) => t.id,
      (t, { text, show }) => {
        text.label = t.label;
        show("hot", t.hot === true);
      },
      { skipUnchanged: true },
    );
  }
}
define("user-card", UserCard);
