import { describe, expect, it } from "vitest";
import { Component, define } from "@nativele/ts-dom";
import childTpl from "./order-child.html.js";
import parentTpl from "./order-parent.html.js";

export class OrderChild extends Component(childTpl, { props: { label: "" } }) {
  seen: string[] = [];
  override connected(): void {
    this.seen.push(`connected:${this.props.label}`);
  }
  override disconnected(): void {
    this.seen.push("disconnected");
  }
  override render(view: { label: string }): void {
    this.seen.push(`render:${view.label}`);
  }
}
define("order-child", OrderChild);

for (const shadow of [false, true]) {
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

import siblingsTpl from "./order-siblings.html.js";
import midTpl from "./order-mid.html.js";
import outerTpl from "./order-outer.html.js";

class Thrower extends Component(childTpl, { props: { label: "" } }) {
  override connected(): void {
    throw new Error("child failed");
  }
}
define("order-thrower", Thrower);

/** Append `el`, returning what its connection threw (happy-dom rethrows from a connectedCallback). */
const appendCatching = (el: Element): unknown => {
  try {
    document.body.append(el);
  } catch (e) {
    return e;
  }
  return undefined;
};

describe("components that start inside a component's first render", () => {
  it("one that throws does not keep the others or the parent's connected() from running", () => {
    const seen: string[] = [];
    class P extends Component(siblingsTpl, { state: { name: "Ada" } }) {
      override render(view: { name: string }): void {
        this.refs.a.label = view.name;
        this.refs.b.label = view.name;
      }
      override connected(): void {
        seen.push(`parent sees ${this.refs.b.seen.join(",")}`);
      }
    }
    define("order-siblings-p", P);
    const el = document.createElement("order-siblings-p") as P;
    const thrown = appendCatching(el);
    expect(String(thrown)).toContain("child failed");
    expect([el.refs.a.seen, el.refs.b.seen]).toEqual([
      ["render:Ada", "connected:Ada"],
      ["render:Ada", "connected:Ada"],
    ]);
    expect(seen).toEqual(["parent sees render:Ada,connected:Ada"]);
  });

  it("they still start when the parent's first render throws", () => {
    class P extends Component(parentTpl, { state: { name: "Ada" } }) {
      override render(): void {
        throw new Error("render failed");
      }
    }
    define("order-throwing-p", P);
    const el = document.createElement("order-throwing-p") as P;
    expect(String(appendCatching(el))).toContain("render failed");
    expect(el.refs.kid.seen).toEqual(["render:", "connected:"]);
  });

  it("one the parent's render moves starts once, and is not told it was disconnected before it started", () => {
    class P extends Component(siblingsTpl, { state: { name: "Ada" } }) {
      override render(view: { name: string }): void {
        const b = this.refs.b;
        b.remove();
        this.append(b);
        b.label = view.name;
      }
    }
    define("order-moving-p", P);
    const el = document.createElement("order-moving-p") as P;
    appendCatching(el);
    expect(el.refs.b.seen).toEqual(["render:Ada", "connected:Ada"]);
  });

  it("one in the shadow tree of a component inside it waits for that component, at any depth", () => {
    class Outer extends Component(outerTpl, { state: { name: "Ada" } }) {
      override render(view: { name: string }): void {
        this.refs.mid.label = view.name;
      }
    }
    define("order-outer", Outer);
    const el = document.createElement("order-outer") as Outer;
    document.body.append(el);
    expect(el.refs.mid.refs.kid.seen).toEqual(["render:Ada", "connected:Ada"]);
  });
});

export class OrderMid extends Component(midTpl, { shadow: true, props: { label: "" } }) {
  override render(view: { label: string }): void {
    this.refs.kid.label = view.label;
  }
}
define("order-mid", OrderMid);
