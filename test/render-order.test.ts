import { describe, expect, it } from "vitest";
import { Component, define } from "@nativele/ts-dom";
import childTpl from "./order-child.html.js";
import parentTpl from "./order-parent.html.js";

export class OrderChild extends Component(childTpl, { props: { label: "" } }) {
  seen: string[] = [];
  override connected(): void {
    this.seen.push(`connected:${this.props.label}`);
  }
  override render(view: { label: string }): void {
    this.seen.push(`render:${view.label}`);
  }
}
define("order-child", OrderChild);

// Light DOM only: in a Shadow DOM parent, happy-dom connects the children before the host, which Chrome does not; browser/browser.test.ts checks both modes there.
for (const shadow of [false]) {
  const tag = `order-parent-${shadow ? "shadow" : "light"}`;
  class Parent extends Component(parentTpl, { shadow, state: { name: "Ada" } }) {
    kidSeenAtConnected: string[] = [];
    override render(view: { name: string }): void {
      this.refs.kid.label = view.name;
    }
    override connected(): void {
      this.kidSeenAtConnected = [...this.refs.kid.seen];
    }
  }
  define(tag, Parent);

  describe(`a child component in a ${shadow ? "Shadow" : "Light"} DOM parent's template`, () => {
    it("connects and renders first with the props the parent's first render gives it", () => {
      const parent = document.createElement(tag) as Parent;
      document.body.append(parent);
      expect(parent.refs.kid.seen).toEqual(["render:Ada", "connected:Ada"]);
      expect(parent.refs.kid.isConnected).toBe(true);
      expect(parent.kidSeenAtConnected).toEqual(["render:Ada", "connected:Ada"]);
    });
  });
}
