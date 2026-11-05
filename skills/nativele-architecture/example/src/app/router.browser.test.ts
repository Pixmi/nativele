import { afterAll, expect, test } from "vitest";
import { startRouter } from "./router.ts";

const start = location.href;
const outlet = document.createElement("main");
document.body.append(outlet);
const ready = startRouter(outlet);

afterAll(() => navigation.navigate(start, { history: "replace" }).finished);

const go = (path: string) => navigation.navigate(path).finished;

test("the Navigation API carries same-document navigations to the router", async () => {
  await ready;
  await go("/settings");
  expect(location.pathname).toBe("/settings");
  expect(outlet.firstElementChild?.localName).toBe("settings-page");
  await go("/projects/p1");
  expect(outlet.querySelector("project-page h1")?.textContent).toBe("Website");
});

test("a click on a link inside a page is intercepted: the document stays, the page changes", async () => {
  await go("/");
  const marker = Symbol.for("same-document");
  (window as unknown as Record<symbol, boolean>)[marker] = true;
  outlet.querySelector<HTMLAnchorElement>("project-card a")!.click();
  await navigation.transition?.finished;
  expect(location.pathname).toBe("/projects/p1");
  expect(outlet.firstElementChild?.localName).toBe("project-page");
  expect((window as unknown as Record<symbol, boolean>)[marker]).toBe(true);
});

test("back and forward render the page of that entry", async () => {
  await go("/settings");
  await go("/projects/p2");
  await navigation.back().finished;
  expect(outlet.firstElementChild?.localName).toBe("settings-page");
  await navigation.forward().finished;
  expect(outlet.querySelector("project-page h1")?.textContent).toBe("Mobile app");
});
