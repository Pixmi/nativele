import { afterEach, beforeEach, expect, test } from "vitest";
import "./projects-page.ts";
import { addTask, projects, seedProjects } from "./projects-store.ts";

beforeEach(() => projects.set(seedProjects()));
afterEach(() => document.body.replaceChildren());

const cards = () => [...document.querySelectorAll("project-card")];

test("lists every project with a link to its page and its progress", () => {
  document.body.append(document.createElement("projects-page"));
  expect(cards().map((c) => c.querySelector("a")!.textContent)).toEqual(["Website", "Mobile app"]);
  expect(cards().map((c) => c.querySelector("a")!.getAttribute("href"))).toEqual(["/projects/p1", "/projects/p2"]);
  expect(cards()[0]!.querySelector("progress-meter span")!.textContent).toBe("1 of 3 done");
});

test("the shared text-entry adds a project through the feature store", () => {
  const page = document.createElement("projects-page");
  document.body.append(page);
  page.querySelector("input")!.value = "Docs";
  page.querySelector("button")!.click();
  expect(projects.get().projects.map((p) => p.name)).toEqual(["Website", "Mobile app", "Docs"]);
  expect(cards().at(-1)!.querySelector("a")!.textContent).toBe("Docs");
});

test("a change to the store from anywhere shows at once", () => {
  document.body.append(document.createElement("projects-page"));
  addTask("p2", "Test on a phone");
  expect(cards()[1]!.querySelector("progress-meter span")!.textContent).toBe("0 of 2 done");
});
