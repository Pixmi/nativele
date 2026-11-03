import { describe, expect, it, vi } from "vitest";
import { Component, define, event } from "ts-dom";
import type { EmitEvent } from "ts-dom";
import { FieldChild } from "./compose/child.ts";
import { ParentForm } from "./compose/parent.ts";
import tpl from "./compose/child.html.js";

const mount = <T extends HTMLElement>(html: string): T => {
  document.body.insertAdjacentHTML("beforeend", html);
  return document.body.lastElementChild as T;
};
const typeInto = (child: FieldChild, text: string) => {
  child.refs.input.value = text;
  child.refs.input.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("props", () => {
  it("HTML attribute → prop: converted by the type of the default value (kebab-case ↔ camelCase)", () => {
    const c = mount<FieldChild>(`<x-child label="Name" max-length="5" disabled></x-child>`);
    expect(c.props).toMatchObject({ label: "Name", maxLength: 5, disabled: true, value: "" });
    expect(c.querySelector("label")?.textContent).toContain("Name");
  });
  it("attribute change and removal: a removed boolean becomes false, others return to the default", () => {
    const c = mount<FieldChild>(`<x-child label="a" max-length="5" disabled></x-child>`);
    c.removeAttribute("disabled");
    c.removeAttribute("max-length");
    c.setAttribute("label", "b");
    expect(c.props).toMatchObject({ disabled: false, maxLength: 10, label: "b" });
  });
  it("invalid numeric attribute: warns and uses the default value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = mount<FieldChild>(`<x-child max-length="abc"></x-child>`);
    expect(c.props.maxLength).toBe(10);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it("invalid numeric attribute: the warning contains the rule id and a fix", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount<FieldChild>(`<x-child max-length="abc"></x-child>`);
    const msg = String(warn.mock.calls[0]?.[0]);
    expect(msg).toMatch(/\[invalid-prop-value\]/);
    expect(msg).toContain("Fix:");
    warn.mockRestore();
  });
  it("JS property assignment: updates the view and accepts arrays", () => {
    const c = mount<FieldChild>(`<x-child></x-child>`);
    c.label = "New label";
    c.items = ["a", "b"];
    expect(c.querySelector("label")?.textContent).toContain("New label");
    expect(c.props.items).toEqual(["a", "b"]);
  });
  it("a prop change calls render; the same value does not", () => {
    const c = mount<FieldChild>(`<x-child></x-child>`);
    const n = c.renders;
    c.label = "x";
    expect(c.renders).toBe(n + 1);
    c.label = "x";
    expect(c.renders).toBe(n + 1);
  });
  it("data-if toggles by the truthiness of a prop", () => {
    const c = mount<FieldChild>(`<x-child></x-child>`);
    expect(c.querySelector("[role=alert]")).toBeNull();
    c.error = "broken";
    expect(c.querySelector("[role=alert]")?.textContent).toBe("broken");
    c.error = "";
    expect(c.querySelector("[role=alert]")).toBeNull();
  });
  it("changing a prop with set() inside the component throws a clear error", () => {
    const c = mount<FieldChild>(`<x-child></x-child>`);
    // @ts-expect-error label is a prop, not in the state type
    expect(() => c.set({ label: "x" })).toThrow(/\[props-mutation\]/);
  });
});

describe("definition-time checks", () => {
  // Type problems are reported on the class X extends Component(...) line; at runtime they are thrown when Component() is called
  it("state and props share a name", () => {
    expect(() => {
      // @ts-expect-error conflictingKeys
      class X extends Component(tpl, { state: { label: "" }, props: { label: "" } }) {}
      void X;
    }).toThrow(/\[conflicting-keys\]/);
  });
  it("a prop shares a name with a member of HTMLElement or ts-dom", () => {
    expect(() => {
      // @ts-expect-error reservedPropNames (HTMLElement.title)
      class X extends Component(tpl, { props: { title: "" } }) {}
      void X;
    }).toThrow(/\[reserved-prop\]/);
    expect(() => {
      // @ts-expect-error reservedPropNames (ts-dom render)
      class X extends Component(tpl, { props: { render: "" } }) {}
      void X;
    }).toThrow(/\[reserved-prop\]/);
  });
  it("emits shares a name with a native event", () => {
    expect(() => {
      // @ts-expect-error nativeEventNames
      class X extends Component(tpl, { emits: { click: event() } }) {}
      void X;
    }).toThrow(/\[native-event-name\]/);
  });
  it("derive and state share a name", () => {
    expect(() => {
      // @ts-expect-error conflictingKeys
      class X extends Component(tpl, { state: { a: 1 }, derive: { a: () => 2 } }) {}
      void X;
    }).toThrow(/\[conflicting-keys\]/);
  });
});

describe("runtime error message format", () => {
  const capture = (fn: () => void) => {
    let err: unknown;
    try {
      fn();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    return (err as Error).message;
  };
  const expectShape = (msg: string, id: string) => {
    expect(msg).toContain(`[${id}]`);
    expect(msg).toContain("Fix:");
  };
  it("props-mutation", () => {
    const c = mount<FieldChild>(`<x-child></x-child>`);
    // @ts-expect-error label is a prop, not in the state type
    expectShape(capture(() => c.set({ label: "x" })), "props-mutation");
  });
  it("undeclared-event", () => {
    const c = mount<FieldChild>(`<x-child></x-child>`);
    // @ts-expect-error an undeclared event name
    expectShape(capture(() => c.emit("nope")), "undeclared-event");
  });
  it("conflicting-keys (state and props)", () => {
    expectShape(
      capture(() => {
        // @ts-expect-error conflictingKeys
        class X extends Component(tpl, { state: { label: "" }, props: { label: "" } }) {}
        void X;
      }),
      "conflicting-keys",
    );
  });
  it("conflicting-keys (derive)", () => {
    expectShape(
      capture(() => {
        // @ts-expect-error conflictingKeys
        class X extends Component(tpl, { state: { a: 1 }, derive: { a: () => 2 } }) {}
        void X;
      }),
      "conflicting-keys",
    );
    expectShape(
      capture(() => {
        // @ts-expect-error conflictingKeys
        class X extends Component(tpl, { props: { a: 1 }, derive: { a: () => 2 } }) {}
        void X;
      }),
      "conflicting-keys",
    );
  });
  it("reserved-prop", () => {
    expectShape(
      capture(() => {
        // @ts-expect-error reservedPropNames
        class X extends Component(tpl, { props: { title: "" } }) {}
        void X;
      }),
      "reserved-prop",
    );
  });
  it("native-event-name", () => {
    expectShape(
      capture(() => {
        // @ts-expect-error nativeEventNames
        class X extends Component(tpl, { emits: { click: event() } }) {}
        void X;
      }),
      "native-event-name",
    );
  });
});

describe("emit", () => {
  it("does not bubble by default: only the element itself receives it, not an outer wrapper", () => {
    const wrapper = mount<HTMLDivElement>(`<div><x-child></x-child></div>`);
    const child = wrapper.querySelector("x-child") as FieldChild;
    const seen: string[] = [];
    wrapper.addEventListener("value-change", () => seen.push("wrapper"));
    child.addEventListener("value-change", () => seen.push("child"));
    typeInto(child, "x");
    expect(seen).toEqual(["child"]);
  });
  it("only bubbles when declared with bubbles: true", () => {
    const wrapper = mount<HTMLDivElement>(`<div><x-child></x-child></div>`);
    const seen: string[] = [];
    wrapper.addEventListener("closed", () => seen.push("wrapper"));
    (wrapper.querySelector("x-child") as FieldChild).close();
    expect(seen).toEqual(["wrapper"]);
  });
  it("detail carries data; an undeclared event throws", () => {
    const child = mount<FieldChild>(`<x-child></x-child>`);
    let detail: unknown;
    child.addEventListener("value-change", (e) => (detail = (e as CustomEvent).detail));
    typeInto(child, "abc");
    expect(detail).toEqual({ value: "abc" });
    // @ts-expect-error an undeclared event name
    expect(() => child.emit("nope")).toThrow(/\[undeclared-event\]/);
  });
});

describe("composition: a parent component uses child components", () => {
  const make = () => mount<ParentForm>(`<x-parent></x-parent>`);

  it("the parent passes props as attributes (typed), and static HTML attributes work too", () => {
    const p = make();
    expect(p.refs.name.props.label).toBe("Name");
    expect(p.refs.name.props.maxLength).toBe(5);
    expect(p.refs.email.props.label).toBe("Email");
  });
  it("data flow: child emit → parent set → parent render sets child props → child view updates", () => {
    const p = make();
    typeInto(p.refs.name, "Ada Lovelace");
    expect(p.state.name).toBe("Ada Lovelace");
    expect(p.querySelector("p:last-of-type, p")?.textContent).toBeTruthy();
    expect(p.refs.name.props.error).toBe("Too long");
    expect(p.refs.name.querySelector("[role=alert]")?.textContent).toBe("Too long");
    // the child own state (dirty) is updated too
    expect(p.refs.name.querySelector("span")?.textContent).toBe("*");
  });
  it("the parent derived values show in its own holes and also in content placed in the child slot", () => {
    const p = make();
    expect(p.refs.email.querySelector("small")?.textContent).toBe("Enter a name");
    typeInto(p.refs.name, "Ada");
    expect(p.refs.email.querySelector("small")?.textContent).toBe("Hello Ada");
    expect([...p.querySelectorAll("p")].at(-1)?.textContent).toBe("Ada/");
  });
  it("child components inside list items: each item has its own props, and events carry hit.key", () => {
    const p = make();
    const rows = [...p.querySelectorAll<FieldChild>("li x-child")];
    expect(rows.map((r) => r.props.label)).toEqual(["Row 1", "Row 2"]);
    expect(rows.map((r) => r.props.value)).toEqual(["a", "b"]);
    typeInto(rows[1] as FieldChild, "B!");
    expect(p.state.rows.map((r) => r.v)).toEqual(["a", "B!"]);
    expect(p.querySelectorAll<FieldChild>("li x-child")[0]).toBe(rows[0]); // the first item was not rebuilt
  });
  it("not received across levels by accident: an outer element with data-on-value-change does not get it (the event does not bubble)", () => {
    const p = make();
    typeInto(p.refs.inner, "x");
    expect(p.wrapperHits).toBe(0);
  });
  it("the child input value is only written when it differs (avoids cursor jumps)", () => {
    const p = make();
    const input = p.refs.name.refs.input;
    typeInto(p.refs.name, "ab");
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value");
    let writes = 0;
    Object.defineProperty(input, "value", { configurable: true, get: () => desc?.get?.call(input), set: (v) => { writes++; desc?.set?.call(input, v); } });
    p.refs.name.label = "Changed label"; // a prop change unrelated to value
    expect(writes).toBe(0);
  });
});

// ---- Type level ----
export function typeOnly(p: ParentForm, c: FieldChild) {
  // @ts-expect-error value is a string
  p.refs.name.value = 1;
  // @ts-expect-error the child has no such prop
  p.refs.name.nope = "x";
  // @ts-expect-error the emit name must be declared
  c.emit("nope");
  // @ts-expect-error detail is required
  c.emit("value-change");
  // @ts-expect-error wrong detail type
  c.emit("value-change", { value: 1 });
  c.emit("ping"); // an event without detail can omit it
  c.emit("closed");
  // @ts-expect-error props are read-only
  c.props.label = "x";
  const e = {} as EmitEvent<FieldChild, "value-change">;
  const v: string = e.detail.value;
  void v;
  const undeclared: [EmitEvent<FieldChild, "nope">] extends [never] ? true : false = true; // an undeclared event is never
  void undeclared;
}
void define;
