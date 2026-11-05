import { afterEach, beforeEach, expect, test } from "vitest";
import "../src/nv/user-badge.ts";
import { session } from "../src/nv/session.ts";

beforeEach(() => session.set({ user: "guest" }));
afterEach(() => document.body.replaceChildren());

test("bind() shows the store value on connection and follows set() synchronously", () => {
  const el = document.createElement("user-badge");
  document.body.append(el);
  expect(el.textContent?.trim()).toBe("Signed in as guest");
  session.set({ user: "Ada" });
  expect(el.textContent?.trim()).toBe("Signed in as Ada");
});

test("a removed element stops following the store", () => {
  const el = document.createElement("user-badge");
  document.body.append(el);
  el.remove();
  session.set({ user: "Bob" });
  expect(el.textContent?.trim()).toBe("Signed in as guest");
});
