import { afterEach, beforeEach, expect, test } from "vitest";
import { defaultPreferences, preferences } from "../../shared/stores/preferences.ts";
import "./settings-page.ts";

beforeEach(() => preferences.set(defaultPreferences));
afterEach(() => document.body.replaceChildren());

test("the form starts from the app-wide store and saves back to it", () => {
  preferences.set({ userName: "Ada", showDone: true });
  const el = document.createElement("settings-page");
  document.body.append(el);
  const [name, showDone] = el.querySelectorAll("input");
  expect(name!.value).toBe("Ada");
  expect(showDone!.checked).toBe(true);
  name!.value = "Grace";
  showDone!.checked = false;
  el.querySelector("button")!.click();
  expect(preferences.get()).toEqual({ userName: "Grace", showDone: false });
  expect(el.querySelector("[role=status]")?.textContent).toBe("Saved.");
});
