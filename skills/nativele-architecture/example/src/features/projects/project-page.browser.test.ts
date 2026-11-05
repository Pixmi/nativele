import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "./project-page.ts";
import { projects, seedProjects } from "./projects-store.ts";
import { TaskRow } from "./task-row.ts";

beforeEach(() => projects.set(seedProjects()));
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

test("Chrome moves a toggled task to the end with moveBefore: the row stays connected and its checkbox keeps focus", () => {
  expect("moveBefore" in Element.prototype).toBe(true);
  const el = document.createElement("project-page");
  el.projectId = "p1";
  document.body.append(el);
  const disconnected = vi.spyOn(TaskRow.prototype, "disconnected");
  const box = el.querySelector<HTMLInputElement>("task-row input")!;
  box.focus();
  box.click();
  const rows = [...el.querySelectorAll("task-row")];
  expect(rows.at(-1)?.contains(box)).toBe(true);
  expect(disconnected).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(box);
});
