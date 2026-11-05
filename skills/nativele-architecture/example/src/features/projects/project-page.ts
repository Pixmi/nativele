import { Component, define } from "@nativele/ts-dom";
import type { DeepReadonly, EmitEvent, EventHit } from "@nativele/ts-dom";
import { preferences } from "../../shared/stores/preferences.ts";
import type { TextEntry } from "../../shared/text-entry.ts";
import { addTask, projects, tasksOf, toggleTask, type ProjectsState, type Task } from "./projects-store.ts";
import tpl from "./project-page.html.js";

type View = DeepReadonly<{ projectId: string; data: ProjectsState; showDone: boolean }>;

const project = (v: View) => v.data.projects.find((p) => p.id === v.projectId);
const all = (v: View) => tasksOf(v.data, v.projectId);
const visible = (v: View) => all(v).filter((t) => v.showDone || !t.done);

export class ProjectPage extends Component(tpl, {
  props: { projectId: "" },
  state: { data: { projects: [], tasks: [], nextId: 0 } as ProjectsState, showDone: true },
  derive: {
    found: (v) => project(v) !== undefined,
    missing: (v) => project(v) === undefined,
    name: (v) => project(v)?.name ?? "",
    tasks: (v) => [...visible(v)].sort((a, b) => Number(a.done) - Number(b.done)),
    doneCount: (v) => all(v).filter((t) => t.done).length,
    totalCount: (v) => all(v).length,
    hiddenCount: (v) => all(v).length - visible(v).length,
    someHidden: (v) => all(v).length > visible(v).length,
  },
}) {
  override connected(): void {
    this.bind(projects, (data) => this.set({ data }));
    this.bind(preferences, (p) => this.set({ showDone: p.showDone }));
  }

  onAdd(e: Event): void {
    addTask(this.props.projectId, (e as EmitEvent<TextEntry, "entry-submit">).detail.value);
  }

  onToggle(_e: Event, hit: EventHit<Task, "id">): void {
    toggleTask(hit.key);
  }

  override render(
    view: { tasks: readonly Task[]; doneCount: number; totalCount: number },
    changed: ReadonlySet<"tasks" | "doneCount" | "totalCount">,
  ): void {
    if (changed.has("tasks")) this.lists.tasks.items = view.tasks;
    if (changed.has("doneCount")) this.refs.meter.done = view.doneCount;
    if (changed.has("totalCount")) this.refs.meter.total = view.totalCount;
  }
}
define("project-page", ProjectPage);
