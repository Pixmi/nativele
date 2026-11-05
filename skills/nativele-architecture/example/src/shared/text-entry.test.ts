import { afterEach, expect, test } from "vitest";
import type { EmitEvent } from "@nativele/ts-dom";
import "./text-entry.ts";
import type { TextEntry } from "./text-entry.ts";

afterEach(() => document.body.replaceChildren());

function mount(): { el: TextEntry; sent: string[] } {
  const el = document.createElement("text-entry");
  el.label = "Name";
  el.action = "Add name";
  const sent: string[] = [];
  el.addEventListener("entry-submit", (e) => sent.push((e as EmitEvent<TextEntry, "entry-submit">).detail.value));
  document.body.append(el);
  return { el, sent };
}

test("its interface is its props and its event: it emits the trimmed text and clears the field", () => {
  const { el, sent } = mount();
  expect(el.querySelector("label")?.textContent?.trim()).toBe("Name");
  expect(el.querySelector("button")?.textContent).toBe("Add name");
  el.querySelector("input")!.value = "  Ship it  ";
  el.querySelector("button")!.click();
  expect(sent).toEqual(["Ship it"]);
  expect(el.querySelector("input")!.value).toBe("");
});

test("an empty entry emits nothing, and the event does not bubble past the element", () => {
  const { el, sent } = mount();
  let heardByDocument = 0;
  document.addEventListener("entry-submit", () => heardByDocument++);
  el.querySelector("button")!.click();
  el.querySelector("input")!.value = "x";
  el.querySelector("button")!.click();
  expect(sent).toEqual(["x"]);
  expect(heardByDocument).toBe(0);
});
