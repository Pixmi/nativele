import { expect, test, vi } from "vitest";
import { define } from "@nativele/ts-dom";
import { CounterCard } from "../src/nv/counter-card.ts";

test("each test file starts with an empty document and its own registry", () => {
  expect(document.body.children.length).toBe(0);
  expect(customElements.get("user-badge")).toBeUndefined();
  expect(customElements.get("counter-card")).toBe(CounterCard);
});

test("define() again keeps the first class; customElements.define() throws", () => {
  class Other extends HTMLElement {}
  define("counter-card", Other);
  expect(customElements.get("counter-card")).toBe(CounterCard);
  expect(() => customElements.define("counter-card", Other)).toThrow(/already/);
});

test("vi.resetModules() does not reset a component: the tag keeps the first class and the store it imported", async () => {
  const first = await import("../src/nv/user-badge.ts");
  vi.resetModules();
  const again = await import("../src/nv/user-badge.ts");
  const { session } = await import("../src/nv/session.ts");
  expect(again.UserBadge).not.toBe(first.UserBadge);
  expect(customElements.get("user-badge")).toBe(first.UserBadge);
  const el = document.createElement("user-badge");
  document.body.append(el);
  session.set({ user: "Ada" });
  expect(el.textContent?.trim()).toBe("Signed in as guest");
  el.remove();
});
