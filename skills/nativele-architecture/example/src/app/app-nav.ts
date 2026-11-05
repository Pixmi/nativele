import { Component, define } from "@nativele/ts-dom";
import { preferences } from "../shared/stores/preferences.ts";
import { currentPath } from "./current-path.ts";
import tpl from "./app-nav.html.js";

function current(link: HTMLAnchorElement, on: boolean): void {
  if (on) link.setAttribute("aria-current", "page");
  else link.removeAttribute("aria-current");
}

export class AppNav extends Component(tpl, {
  state: { path: "", userName: "" },
  derive: { named: (s) => s.userName !== "" },
}) {
  override connected(): void {
    this.bind(currentPath, (path) => this.set({ path }));
    this.bind(preferences, (p) => this.set({ userName: p.userName }));
  }

  override render(view: { path: string }, changed: ReadonlySet<"path">): void {
    if (!changed.has("path")) return;
    current(this.refs.projectsLink, view.path === "/" || view.path.startsWith("/projects/"));
    current(this.refs.settingsLink, view.path === "/settings");
  }
}
define("app-nav", AppNav);
