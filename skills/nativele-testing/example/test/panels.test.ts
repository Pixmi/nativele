import { afterEach, expect, test } from "vitest";
import "../src/nv/light-panel.ts";
import "../src/nv/shadow-panel.ts";

afterEach(() => document.body.replaceChildren());

const texts = (nodes: Node[]) => nodes.filter((n) => n.nodeType === Node.ELEMENT_NODE).map((n) => n.textContent);

test("Light DOM: children present at connection are in their slots at once", () => {
  const el = document.createElement("light-panel");
  el.append(Object.assign(document.createElement("b"), { slot: "title", textContent: "Title" }), Object.assign(document.createElement("p"), { textContent: "Body" }));
  document.body.append(el);
  expect(texts(el.assignedNodes("title"))).toEqual(["Title"]);
  expect(texts(el.assignedNodes(""))).toEqual(["Body"]);
  expect(el.querySelector("h2")?.textContent).toBe("Title");
});

test("Light DOM: a child added later is placed after a microtask, and slotchange() runs", async () => {
  const el = document.createElement("light-panel");
  document.body.append(el);
  expect(el.querySelector("h2")?.textContent).toBe("Untitled");
  el.append(Object.assign(document.createElement("b"), { slot: "title", textContent: "Later" }));
  expect(el.assignedNodes("title")).toEqual([]);
  await Promise.resolve();
  expect(texts(el.assignedNodes("title"))).toEqual(["Later"]);
  expect(el.querySelector("h2")?.textContent).toBe("Later");
  expect(el.dataset.changed).toBe("title");
});

test("Shadow DOM: the template is in shadowRoot, slots are native, and slotchange fires after a microtask", async () => {
  const el = document.createElement("shadow-panel");
  el.append(Object.assign(document.createElement("p"), { textContent: "Body" }));
  document.body.append(el);
  expect(el.shadowRoot?.querySelector("h2")).not.toBeNull();
  expect(el.querySelector("h2")).toBeNull();
  expect(texts(el.assignedNodes(""))).toEqual(["Body"]);
  const slot = el.shadowRoot!.querySelector<HTMLSlotElement>("slot[name=title]")!;
  let changes = 0;
  slot.addEventListener("slotchange", () => changes++);
  el.append(Object.assign(document.createElement("b"), { slot: "title", textContent: "Title" }));
  await Promise.resolve();
  expect(changes).toBe(1);
  expect(texts(el.assignedNodes("title"))).toEqual(["Title"]);
});
