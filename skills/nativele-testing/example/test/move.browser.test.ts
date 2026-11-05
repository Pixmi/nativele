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

test("Chrome moves a list item with moveBefore: it stays connected and keeps focus", () => {
  expect("moveBefore" in Element.prototype).toBe(true);
  const el = document.createElement("todo-list");
  el.todos = todos;
  document.body.append(el);
  const disconnected = vi.spyOn(TodoRow.prototype, "disconnected");
  const connected = vi.spyOn(TodoRow.prototype, "connected");
  const input = el.querySelector("todo-row input") as HTMLInputElement;
  input.focus();
  el.todos = [todos[1]!, todos[0]!];
  expect(el.querySelectorAll("todo-row input")[1]).toBe(input);
  expect(disconnected).not.toHaveBeenCalled();
  expect(connected).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(input);
});
