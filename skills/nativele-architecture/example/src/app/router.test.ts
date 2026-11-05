import { afterEach, beforeEach, expect, test } from "vitest";
import { projects, seedProjects } from "../features/projects/projects-store.ts";
import { currentPath } from "./current-path.ts";
import { show } from "./router.ts";

const url = (path: string) => new URL(path, "http://localhost/").href;
let outlet: HTMLElement;

beforeEach(() => {
  projects.set(seedProjects());
  outlet = document.createElement("main");
  document.body.append(outlet);
});
afterEach(() => document.body.replaceChildren());

test("a route loads its page module, then mounts the page element with the route params as props", async () => {
  await show(outlet, url("/projects/p2"));
  const page = outlet.firstElementChild;
  expect(page?.localName).toBe("project-page");
  expect(customElements.get("project-page")).toBeDefined();
  expect((page as HTMLElementTagNameMap["project-page"]).projectId).toBe("p2");
  expect(page?.querySelector("h1")?.textContent).toBe("Mobile app");
  expect(currentPath.get()).toBe("/projects/p2");
});

test("the next route replaces the page, so the old one is removed", async () => {
  await show(outlet, url("/"));
  const list = outlet.firstElementChild!;
  await show(outlet, url("/settings"));
  expect(list.isConnected).toBe(false);
  expect([...outlet.children].map((c) => c.localName)).toEqual(["settings-page"]);
});

test("a navigation aborted by the time its module has loaded mounts nothing", async () => {
  await show(outlet, url("/projects/p1"));
  const superseded = new AbortController();
  const stale = show(outlet, url("/settings"), superseded.signal);
  superseded.abort();
  await stale;
  expect([...outlet.children].map((c) => c.localName)).toEqual(["project-page"]);
});

test("an unknown path shows the not-found message", async () => {
  await show(outlet, url("/nowhere"));
  expect(outlet.querySelector("h1")?.textContent).toBe("Page not found");
  expect(currentPath.get()).toBe("/nowhere");
});
