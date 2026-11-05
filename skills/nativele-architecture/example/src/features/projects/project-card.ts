import { Component, define } from "@nativele/ts-dom";
import tpl from "./project-card.html.js";

export interface ProjectSummary {
  id: string;
  name: string;
  done: number;
  total: number;
}

export class ProjectCard extends Component(tpl, {
  props: { project: { id: "", name: "", done: 0, total: 0 } as ProjectSummary },
  derive: { name: (v) => v.project.name },
}) {
  override render(view: { project: ProjectSummary }): void {
    this.refs.link.href = `/projects/${encodeURIComponent(view.project.id)}`;
    this.refs.meter.done = view.project.done;
    this.refs.meter.total = view.project.total;
  }
}
define("project-card", ProjectCard);
