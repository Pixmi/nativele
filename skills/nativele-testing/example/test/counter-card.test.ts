import { afterEach, expect, test } from "vitest";
import type { EmitEvent } from "@nativele/ts-dom";
import "../src/nv/counter-card.ts";
import type { CounterCard } from "../src/nv/counter-card.ts";

afterEach(() => document.body.replaceChildren());

function mount(label?: string): CounterCard {
  const el = document.createElement("counter-card");
  if (label !== undefined) el.label = label;
  document.body.append(el);
  return el;
}

test("renders when it is appended, with props set as properties before", () => {
  const el = document.createElement("counter-card");
  el.label = "Clicks";
  expect(el.childNodes.length).toBe(0);
  document.body.append(el);
  expect(el.querySelector("p")?.textContent).toBe("Clicks: 0");
});

test("a prop changed later, as a property or an attribute, renders at once", () => {
  const el = mount();
  el.label = "Taps";
  expect(el.querySelector("p")?.textContent).toBe("Taps: 0");
  el.setAttribute("label", "Hits");
  expect(el.label).toBe("Hits");
  expect(el.querySelector("p")?.textContent).toBe("Hits: 0");
});

test("a click updates the DOM synchronously", () => {
  const el = mount();
  el.querySelector("button")!.click();
  expect(el.querySelector("b")?.textContent).toBe("1");
});

test("emit: listen on the element, read detail; the event does not bubble", () => {
  const el = mount();
  const details: { count: number }[] = [];
  let heardByDocument = 0;
  el.addEventListener("count-change", (e) => details.push((e as EmitEvent<CounterCard, "count-change">).detail));
  document.addEventListener("count-change", () => heardByDocument++);
  el.querySelector("button")!.click();
  el.querySelector("button")!.click();
  expect(details).toEqual([{ count: 1 }, { count: 2 }]);
  expect(heardByDocument).toBe(0);
});

test("data-if: the block is absent until its value is truthy", () => {
  const el = mount();
  const lots = () => [...el.querySelectorAll("p")].some((p) => p.textContent === "That is a lot.");
  for (let i = 0; i < 2; i++) el.querySelector("button")!.click();
  expect(lots()).toBe(false);
  el.querySelector("button")!.click();
  expect(lots()).toBe(true);
});

test("afterEach emptied the document", () => {
  expect(document.body.children.length).toBe(0);
});
