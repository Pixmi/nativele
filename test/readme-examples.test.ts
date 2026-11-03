import { describe, expect, it } from "vitest";
import { MyCounter } from "../examples/readme/counter.ts";
import { OrderLine } from "../examples/readme/order-line.ts";
import { TodoList } from "../examples/readme/todo-list.ts";

const mount = <T extends HTMLElement>(tag: string): T => {
  const el = document.createElement(tag) as T;
  document.body.append(el);
  return el;
};
const buttons = (el: HTMLElement) => [...el.querySelectorAll("button")];
const byText = (el: HTMLElement, label: string) => buttons(el).find((b) => b.textContent === label) as HTMLButtonElement;

// These tests keep the examples shown in README.md honest.
describe("README example: counter (state, derive, events, data-if)", () => {
  it("counts, shows the derived value and reveals the message at 10", () => {
    const c = mount<MyCounter>("my-counter");
    expect(c.querySelector("p")?.textContent).toBe("Count: 0 (double: 0)");
    expect(c.querySelector("p:nth-of-type(2)")).toBeNull();
    for (let i = 0; i < 10; i++) byText(c, "+1").click();
    expect(c.querySelector("p")?.textContent).toBe("Count: 10 (double: 20)");
    expect(c.textContent).toContain("That is a lot of clicks!");
    byText(c, "Reset").click();
    expect(c.querySelector("p")?.textContent).toBe("Count: 0 (double: 0)");
    expect(c.textContent).not.toContain("That is a lot");
  });
});

describe("README example: todo list (list, event delegation with hit.key, derive)", () => {
  const add = (t: TodoList, title: string) => {
    t.refs.input.value = title;
    t.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  };
  it("adds, toggles and removes items; blank titles are ignored", () => {
    const t = mount<TodoList>("todo-list");
    add(t, "milk");
    add(t, "  ");
    add(t, "bread");
    expect([...t.querySelectorAll("li span")].map((s) => s.textContent)).toEqual(["milk", "bread"]);
    expect(t.textContent).toContain("2 left");
    (t.querySelectorAll("li input[type=checkbox]")[0] as HTMLInputElement).click();
    expect(t.textContent).toContain("1 left");
    expect((t.querySelectorAll("li input[type=checkbox]")[0] as HTMLInputElement).getAttribute("aria-label")).toBe("Done: milk");
    const second = t.querySelectorAll("li")[1];
    (t.querySelectorAll("li button")[0] as HTMLButtonElement).click();
    expect([...t.querySelectorAll("li span")].map((s) => s.textContent)).toEqual(["bread"]);
    expect(t.querySelectorAll("li")[0]).toBe(second); // the remaining item's node was kept
  });
});

describe("README example: parent and child (props down, events up)", () => {
  it("the child asks for a change, the parent decides, and the child shows the prop it receives", () => {
    const o = mount<OrderLine>("order-line");
    expect(o.refs.qty.props).toMatchObject({ value: 1, min: 1, max: 5 }); // static attributes became props
    expect(o.querySelector("output")?.textContent).toBe("1");
    expect(o.textContent).toContain("Total: 20");
    byText(o, "+").click();
    byText(o, "+").click();
    expect(o.state.quantity).toBe(3);
    expect(o.querySelector("output")?.textContent).toBe("3");
    expect(o.textContent).toContain("Total: 60");
  });
  it("the child never goes beyond min / max", () => {
    const o = mount<OrderLine>("order-line");
    for (let i = 0; i < 8; i++) byText(o, "+").click();
    expect(o.state.quantity).toBe(5);
    for (let i = 0; i < 8; i++) byText(o, "-").click();
    expect(o.state.quantity).toBe(1);
  });
});
