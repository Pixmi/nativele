import { afterEach, beforeEach, expect, test } from "vitest";
import { defaultPreferences, preferences } from "../shared/stores/preferences.ts";
import "./app-nav.ts";
import { currentPath } from "./current-path.ts";

beforeEach(() => {
  preferences.set(defaultPreferences);
  currentPath.set("/");
});
afterEach(() => document.body.replaceChildren());

const current = () => [...document.querySelectorAll("app-nav a[aria-current=page]")].map((a) => a.textContent);

test("the shell marks the current section from the route store", () => {
  document.body.append(document.createElement("app-nav"));
  expect(current()).toEqual(["Projects"]);
  currentPath.set("/projects/p2");
  expect(current()).toEqual(["Projects"]);
  currentPath.set("/settings");
  expect(current()).toEqual(["Settings"]);
});

test("the shell shows the user name from the app-wide store", () => {
  const el = document.createElement("app-nav");
  document.body.append(el);
  expect(el.querySelector("p")).toBeNull();
  preferences.set({ ...preferences.get(), userName: "Ada" });
  expect(el.querySelector("p")?.textContent).toBe("Signed in as Ada");
});
