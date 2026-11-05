import { Component, define } from "@nativele/ts-dom";
import type { EmitEvent } from "@nativele/ts-dom";
import type { TextEntry } from "../../shared/text-entry.ts";
import type { ProjectSummary } from "./project-card.ts";
import { addProject, projects, tasksOf } from "./projects-store.ts";
import tpl from "./projects-page.html.js";

export class ProjectsPage extends Component(tpl, {
  state: { cards: [] as readonly ProjectSummary[] },
  derive: { empty: (s) => s.cards.length === 0 },
}) {
  override connected(): void {
    this.bind(projects, (s) =>
      this.set({
        cards: s.projects.map((p) => {
          const tasks = tasksOf(s, p.id);
          return { id: p.id, name: p.name, done: tasks.filter((t) => t.done).length, total: tasks.length };
        }),
      }),
    );
  }

  onAdd(e: Event): void {
    addProject((e as EmitEvent<TextEntry, "entry-submit">).detail.value);
  }

  override render(view: { cards: readonly ProjectSummary[] }, changed: ReadonlySet<"cards">): void {
    if (changed.has("cards")) this.lists.cards.items = view.cards;
  }
}
define("projects-page", ProjectsPage);
