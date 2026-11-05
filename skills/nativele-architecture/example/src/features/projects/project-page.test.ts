import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { defaultPreferences, preferences } from "../../shared/stores/preferences.ts";
import "./project-page.ts";
import { ProjectPage } from "./project-page.ts";
import { projects, seedProjects } from "./projects-store.ts";

beforeEach(() => {
  projects.set(seedProjects());
  preferences.set(defaultPreferences);
});
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function mount(projectId: string): ProjectPage {
  const el = document.createElement("project-page");
  el.projectId = projectId;
  document.body.append(el);
  return el;
}

const titles = (el: ProjectPage) => [...el.querySelectorAll("task-row")].map((r) => r.textContent?.trim());

test("the route param arrives as a prop: the page shows that project, open tasks first", () => {
  const el = mount("p1");
  expect(el.querySelector("h1")?.textContent).toBe("Website");
  expect(titles(el)).toEqual(["Pick the fonts", "Publish", "Write the copy"]);
  expect(el.querySelector("progress-meter span")?.textContent).toBe("1 of 3 done");
});

test("an unknown id shows a message instead of the project", () => {
  const el = mount("nope");
  expect(el.querySelector("h1")).toBeNull();
  expect(el.textContent).toContain("There is no project with this id.");
});

test("adding and toggling go through the feature store", () => {
  const el = mount("p1");
  el.querySelector<HTMLInputElement>("text-entry input")!.value = "Launch";
  el.querySelector<HTMLButtonElement>("text-entry button")!.click();
  expect(titles(el)).toEqual(["Pick the fonts", "Publish", "Launch", "Write the copy"]);
  el.querySelector<HTMLInputElement>("task-row input")!.click();
  expect(projects.get().tasks.find((t) => t.title === "Pick the fonts")?.done).toBe(true);
  expect(el.querySelector("progress-meter span")?.textContent).toBe("2 of 4 done");
});

test("the app-wide preferences store hides done tasks without any prop passed down", () => {
  const el = mount("p1");
  preferences.set({ ...preferences.get(), showDone: false });
  expect(titles(el)).toEqual(["Pick the fonts", "Publish"]);
  expect(el.textContent).toContain("1 done tasks are hidden.");
});

test("leaving the page ends its subscriptions: a removed page no longer renders on store changes", () => {
  const el = mount("p1");
  const render = vi.spyOn(ProjectPage.prototype, "render");
  preferences.set({ ...preferences.get(), showDone: false });
  expect(render).toHaveBeenCalledTimes(1);
  render.mockClear();
  el.remove();
  projects.set(seedProjects());
  preferences.set({ ...preferences.get(), showDone: true });
  expect(render).not.toHaveBeenCalled();
});
