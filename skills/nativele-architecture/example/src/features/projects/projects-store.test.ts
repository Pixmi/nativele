import { beforeEach, expect, test } from "vitest";
import { addProject, addTask, projects, seedProjects, tasksOf, toggleTask } from "./projects-store.ts";

beforeEach(() => projects.set(seedProjects()));

test("the feature store's actions are plain functions, tested without any element", () => {
  const id = addProject("Docs");
  addTask(id, "Outline");
  expect(projects.get().projects.at(-1)).toEqual({ id, name: "Docs" });
  expect(tasksOf(projects.get(), id).map((t) => t.title)).toEqual(["Outline"]);
});

test("toggleTask replaces the task object, so lists that compare by reference update", () => {
  const before = projects.get().tasks.find((t) => t.id === "t2")!;
  toggleTask("t2");
  const after = projects.get().tasks.find((t) => t.id === "t2")!;
  expect(after).not.toBe(before);
  expect(after.done).toBe(true);
});
