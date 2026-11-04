import { describe, expect, it } from "vitest";
import tpl from "./list.html.js";

describe("template.instantiate", () => {
  it("wires refs, lists, text and show without a component", () => {
    const view = tpl.instantiate();
    const host = document.createElement("div");
    host.append(view.root);

    view.lists.rows.replace(["a", "b"], (s) => s, (s, { text }) => (text.n = s));
    expect([...host.querySelectorAll("li")].map((l) => l.textContent)).toEqual(["a", "b"]);

    view.text.who = "Ada";
    expect(host.querySelector("p")).toBeNull();
    view.show("msg", true);
    expect(view.refs.p.textContent).toBe("hi Ada and Ada");
    view.show("msg", false);
    expect(host.querySelector("p")).toBeNull();
  });

  it("gives every call its own nodes", () => {
    const a = tpl.instantiate();
    const b = tpl.instantiate();
    a.text.who = "x";
    b.show("msg", true);
    expect(a.root).not.toBe(b.root);
    expect(b.refs.p.textContent).toBe("hi  and ");
  });
});
