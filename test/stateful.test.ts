import { describe, expect, it } from "vitest";
import { Component, define } from "@nativele/ts-dom";
import type { EventHit } from "@nativele/ts-dom";
import tpl from "./stateful.html.js";

interface Row {
  id: number;
  n: string;
}
const init = () => ({ title: "T", count: 1, open: true, rows: [] as Row[] });

class Counter extends Component(tpl, { state: init(), derive: { double: (s) => s.count * 2 } }) {
  renders: ReadonlySet<string>[] = [];
  focusCount = 0;
  loop = false;
  override render(v: { rows: readonly Row[]; count: number }, changed: ReadonlySet<string>): void {
    this.renders.push(changed);
    this.lists.rows.replace(v.rows, (r) => r.id, (r, { text }) => (text.n = r.n));
    if (this.loop) this.set({ count: v.count + 1 });
  }
  inc(): void {
    this.set((s) => ({ count: s.count + 1 }));
  }
  del(_e: Event, hit: EventHit): void {
    this.set((s) => ({ rows: s.rows.filter((r) => r.id !== hit.key) }));
  }
  focused(): void {
    this.focusCount++;
  }
}
define("t-counter", Counter);

const make = (html = "") => {
  document.body.insertAdjacentHTML("beforeend", `<t-counter>${html}</t-counter>`);
  return document.body.lastElementChild as Counter;
};
const last = (c: Counter) => c.renders.at(-1);

describe("state: automatic {{ }} and data-if binding", () => {
  it("first render: every field is written to the view and render receives all fields", () => {
    const c = make();
    expect(c.querySelector("h1")?.textContent).toBe("T");
    expect(c.refs.p.textContent).toBe("1 items, 2 total");
    expect(c.renders.length).toBe(1);
    expect([...(last(c) ?? [])].sort()).toEqual(["count", "open", "rows", "title"]);
  });
  it("set merges the patch; changed only holds the fields that changed; derived values update in sync", () => {
    const c = make();
    c.set({ count: 5 });
    expect(c.refs.p.textContent).toBe("5 items, 10 total");
    expect([...(last(c) ?? [])]).toEqual(["count"]);
    expect(c.state.title).toBe("T");
  });
  it("when no field actually changes, nothing updates and render is not called", () => {
    const c = make();
    const n = c.renders.length;
    c.set({ count: 1 });
    c.set({});
    c.set((s) => ({ title: s.title }));
    expect(c.renders.length).toBe(n);
  });
  it("data-if shows and hides by the truthiness of the field, and the ref stays the same node", () => {
    const c = make();
    const p = c.refs.p;
    c.set({ open: false });
    expect(c.querySelector("p")).toBeNull();
    c.set({ open: true });
    expect(c.querySelector("p")).toBe(p);
  });
  it("set before the element is connected: the first render uses the latest data", () => {
    const c = new Counter();
    c.set({ count: 7 });
    document.body.append(c);
    expect(c.refs.p.textContent).toBe("7 items, 14 total");
    expect(c.renders.length).toBe(1);
  });
  it("each instance has its own independent state", () => {
    const a = make();
    const b = make();
    a.set({ count: 9 });
    expect(b.state.count).toBe(1);
  });
});

describe("state: batch and set inside render", () => {
  it("batch coalesces several set calls: renders once, and changed is the union", () => {
    const c = make();
    const n = c.renders.length;
    c.batch(() => {
      c.set({ count: 2 });
      c.set({ title: "X" });
      c.set({ count: 3 });
    });
    expect(c.renders.length).toBe(n + 1);
    expect([...(last(c) ?? [])].sort()).toEqual(["count", "title"]);
    expect(c.querySelector("h1")?.textContent).toBe("X");
  });
  it("nested batch only updates when the outermost one ends", () => {
    const c = make();
    const n = c.renders.length;
    c.batch(() => {
      c.batch(() => c.set({ count: 2 }));
      expect(c.renders.length).toBe(n);
    });
    expect(c.renders.length).toBe(n + 1);
  });
  it("set inside render that never settles throws a render-loop error", () => {
    const c = make();
    c.loop = true;
    expect(() => c.set({ count: 100 })).toThrow(/\[render-loop\]/);
  });
  it("render-loop error message includes a fix", () => {
    const c = make();
    c.loop = true;
    expect(() => c.set({ count: 100 })).toThrow(/\[render-loop\].*Fix:/);
  });
});

describe("data-on-*: event delegation", () => {
  it("a click calls the named method and updates the view", () => {
    const c = make();
    c.refs.b.click();
    expect(c.state.count).toBe(2);
    expect(c.refs.p.textContent).toBe("2 items, 4 total");
  });
  it("events inside list items carry hit.key", () => {
    const c = make();
    c.set({ rows: [{ id: 1, n: "a" }, { id: 2, n: "b" }] });
    const buttons = c.querySelectorAll<HTMLButtonElement>("li button");
    expect(buttons.length).toBe(2);
    buttons[1]?.click();
    expect(c.state.rows.map((r) => r.n)).toEqual(["a"]);
    expect(c.querySelectorAll("li").length).toBe(1);
  });
  it("user content placed in a slot is not triggered even with a matching data-on-click", () => {
    const c = make(`<button id="u" data-on-click="inc">user</button>`);
    (c.querySelector("#u") as HTMLElement).click();
    expect(c.state.count).toBe(1);
  });
  it("a non-bubbling event (focus) is only handled on the target itself, and fires once", () => {
    const c = make();
    c.refs.inp.dispatchEvent(new FocusEvent("focus"));
    expect(c.focusCount).toBe(1);
  });
  it("after removing and re-adding the element, events still work and do not duplicate", () => {
    const c = make();
    c.remove();
    document.body.append(c);
    c.refs.b.click();
    expect(c.state.count).toBe(2);
  });
});

describe("replace with skipUnchanged", () => {
  it("skips update for the same reference; new items and items with a changed reference still update", () => {
    const c = make();
    const a = { id: 1, n: "a" };
    const b = { id: 2, n: "b" };
    let calls = 0;
    const upd = (r: Row, { text }: { text: { n: unknown } }) => {
      calls++;
      text.n = r.n;
    };
    c.lists.rows.replace([a, b], (r) => r.id, upd, { skipUnchanged: true });
    expect(calls).toBe(2);
    c.lists.rows.replace([a, b], (r) => r.id, upd, { skipUnchanged: true });
    expect(calls).toBe(2);
    c.lists.rows.replace([a, { id: 2, n: "B" }, { id: 3, n: "c" }], (r) => r.id, upd, { skipUnchanged: true });
    expect(calls).toBe(4);
    // By default nothing is skipped
    c.lists.rows.replace([a], (r) => r.id, upd);
    expect(calls).toBe(5);
  });
});

describe("missing methods", () => {
  it("at runtime: connecting throws a clear error", () => {
    class NoInc extends Component(tpl, { state: init(), derive: { double: (s) => s.count * 2 } }) {
      del(): void {}
      focused(): void {}
    }
    // @ts-expect-error inc is missing: define reports a type error
    define("t-noinc", NoInc);
    const el = new NoInc() as unknown as { connectedCallback(): void };
    expect(() => el.connectedCallback()).toThrow(/\[missing-handler\].*inc.*Fix:/);
  });
});

// ---- Type level: every @ts-expect-error below must be a real type error ----
// @ts-expect-error the HTML uses count / double / open, which state does not have
export class Bad1 extends Component(tpl, { state: { title: "", rows: [] as Row[] } }) {}
// @ts-expect-error double is missing (state has count and open, but derive does not provide double)
export class Bad2 extends Component(tpl, { state: init() }) {}
// A correct combination reports no error
export class Good extends Component(tpl, { state: init(), derive: { double: (s) => s.count * 2 } }) {
  inc(): void {}
  del(): void {}
  focused(): void {}
}
// The legacy form without state still works and does not enforce name matching
export class Legacy extends Component(tpl) {}
define("t-good", Good);

export function typeOnly() {
  const c = new Counter();
  // @ts-expect-error state is read-only
  c.state.count = 1;
  // @ts-expect-error the field types of the patch must match
  c.set({ count: "x" });
  // @ts-expect-error a field that does not exist
  c.set({ nope: 1 });
  // the view type from derive: double is a number
  const probe = new (class extends Component(tpl, { state: init(), derive: { double: (s) => s.count * 2 } }) {
    inc(): void {}
    del(): void {}
    focused(): void {}
    override render(v: { double: number }): void {
      const n: number = v.double;
      void n;
    }
  })();
  void probe;
}

describe("state, props and derived values are read-only all the way down", () => {
  it("changing an object inside state is a tsc error; replacing it with a new object is not", () => {
    const c = document.createElement("t-counter") as Counter;
    const typeChecks = (): void => {
      // @ts-expect-error an object inside state cannot be changed in place
      c.state.rows[0]!.n = "x";
      // @ts-expect-error nor can an array inside state
      c.state.rows.push({ id: 1, n: "a" });
      c.set((s) => ({ rows: s.rows.map((r) => (r.id === 1 ? { ...r, n: "x" } : r)) }));
      c.set({ rows: [...c.state.rows, { id: 2, n: "b" }] });
    };
    expect(typeChecks).toBeTypeOf("function");
  });
});
