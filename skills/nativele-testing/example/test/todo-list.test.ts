import { afterEach, expect, test, vi } from "vitest";
import "../src/nv/todo-list.ts";
import { TodoRow, type Todo } from "../src/nv/todo-row.ts";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const todos: Todo[] = [
  { id: 1, title: "Write tests", done: false },
  { id: 2, title: "Run them", done: true },
];

function mount() {
  const el = document.createElement("todo-list");
  el.todos = todos;
  document.body.append(el);
  return el;
}

const rows = (el: HTMLElement) => [...el.querySelectorAll("todo-row")];

test("an item list renders one element per item, with the item set as its prop", () => {
  const el = mount();
  expect(rows(el).map((r) => r.textContent?.trim())).toEqual(["Write tests", "Run them"]);
  expect(rows(el)[1]!.todo).toBe(todos[1]);
  expect(el.lists.todos.items).toEqual(todos);
});

test("data-if from a derived value, and an empty list", () => {
  const el = mount();
  expect(el.textContent).not.toContain("Nothing to do.");
  el.todos = [];
  expect(rows(el)).toEqual([]);
  expect(el.textContent).toContain("Nothing to do.");
});

test("an item's event reaches the parent handler with hit.key", () => {
  const el = mount();
  rows(el)[1]!.querySelector("input")!.click();
  expect(el.state.done).toEqual([2]);
});

test("reordering keeps each element", () => {
  const el = mount();
  const [first, second] = rows(el);
  el.todos = [todos[1]!, todos[0]!];
  expect(rows(el)).toEqual([second, first]);
});

test("happy-dom and jsdom have no moveBefore: a moved item is reconnected and loses focus (Chrome keeps both, see move.browser.test.ts)", () => {
  expect("moveBefore" in Element.prototype).toBe(false);
  const el = mount();
  const disconnected = vi.spyOn(TodoRow.prototype, "disconnected");
  const connected = vi.spyOn(TodoRow.prototype, "connected");
  const input = el.querySelector("todo-row input") as HTMLInputElement;
  input.focus();
  el.todos = [todos[1]!, todos[0]!];
  expect(el.querySelectorAll("todo-row input")[1]).toBe(input);
  expect(disconnected).toHaveBeenCalledTimes(1);
  expect(connected).toHaveBeenCalledTimes(1);
  expect(document.activeElement).not.toBe(input);
});
