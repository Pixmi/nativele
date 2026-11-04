import { describe, expect, it, vi } from "vitest";
import { Component, createStore, define } from "@nativele/ts-dom";
import tpl from "./list.html.js";
import lightTpl from "./light.html.js";
import hostTpl from "./host.html.js";
import wrapTpl from "./wrap.html.js";
import styledTpl from "./styled.html.js";
import { UserCard } from "../examples/user-card.ts";

class Rows extends Component(tpl) {}
define("t-rows", Rows);

const texts = (r: Rows) => [...r.root.querySelectorAll("li")].map((l) => l.textContent);

describe("keyed list", () => {
  it("replace: adds, removes and reorders while keeping existing nodes", () => {
    const r = document.createElement("t-rows") as Rows;
    document.body.append(r);
    const upd = (s: string, { text, refs }: { text: { n: unknown }; refs: { cell: HTMLElement } }) => {
      text.n = s;
      refs.cell.dataset.k = s;
    };
    const key = (s: string) => s;
    r.lists.rows.replace(["a", "b", "c"], key, upd);
    const b = r.root.querySelectorAll("li")[1];
    r.lists.rows.replace(["c", "b", "d"], key, upd);
    expect(texts(r)).toEqual(["c", "b", "d"]);
    expect(r.root.querySelectorAll("li")[1]).toBe(b);
    r.lists.rows.remove("c");
    expect(texts(r)).toEqual(["b", "d"]);
  });
  it("{{ }} holes: same-named holes stay in sync, and holes inside items are independent", () => {
    const r = document.createElement("t-rows") as Rows;
    document.body.append(r);
    r.text.who = "Ada";
    expect(r.refs.p.textContent).toBe("hi Ada and Ada");
    r.text.who = 7;
    expect(r.refs.p.textContent).toBe("hi 7 and 7");
    r.lists.rows.replace(["x", "y"], (s) => s, (s, { text }) => (text.n = s));
    expect(r.refs.p.textContent).toBe("hi 7 and 7");
    expect(texts(r)).toEqual(["x", "y"]);
  });
  it("show: data-if removes and restores, and refs stay valid", () => {
    const r = document.createElement("t-rows") as Rows;
    document.body.append(r);
    r.show("msg", false);
    expect(r.root.querySelector("p")).toBeNull();
    r.show("msg", true);
    expect(r.root.querySelector("p")).toBe(r.refs.p);
  });
});

class Light extends Component(lightTpl) {}
define("t-light", Light);

describe("light DOM slot", () => {
  it("named, default and fallback content", () => {
    document.body.insertAdjacentHTML("beforeend", `<t-light id="l1"><b slot="head">H</b>body <i>x</i></t-light><t-light id="l2"></t-light>`);
    const l1 = document.getElementById("l1") as Light;
    expect(l1.querySelector("header")?.textContent).toBe("H");
    expect(l1.querySelector("header b")).not.toBeNull();
    expect(l1.querySelector("main")?.textContent).toBe("body x");
    expect(l1.shadowRoot).toBeNull();
    const l2 = document.getElementById("l2") as Light;
    expect(l2.querySelector("header")?.textContent).toBe("fallback");
    l1.text.title = "T";
    expect(l1.refs.h1.textContent).toBe("T");
  });
  it("{{ }} inside user content is not treated as a hole", () => {
    document.body.insertAdjacentHTML("beforeend", `<t-light id="l3">{{ title }}</t-light>`);
    expect(document.getElementById("l3")?.querySelector("main")?.textContent).toBe("{{ title }}");
  });
});

class Styled extends Component(styledTpl) {}
class StyledShadow extends Component(styledTpl, { shadow: true }) {}
define("t-styled", Styled);
define("t-styled-shadow", StyledShadow);

class Dyn extends Component(lightTpl) {
  changes: string[] = [];
  override slotchange(name: "head" | ""): void {
    this.changes.push(name);
  }
}
define("t-dyn", Dyn);
const tick = () => new Promise((r) => setTimeout(r));

describe("light slot dynamic changes", () => {
  it("children added later are assigned and trigger slotchange", async () => {
    const el = document.createElement("t-dyn") as Dyn;
    document.body.append(el);
    await tick();
    expect(el.querySelector("header")?.textContent).toBe("fallback");
    const b = document.createElement("b");
    b.slot = "head";
    b.textContent = "N";
    el.append(b);
    await tick();
    expect(el.querySelector("header")?.textContent).toBe("N");
    expect(el.changes).toEqual(["head"]);
    b.remove();
    await tick();
    expect(el.querySelector("header")?.textContent).toBe("fallback");
    expect(el.changes).toEqual(["head", "head"]);
  });
  it("the default slot receives nodes without a slot name; nodes with no matching slot are not rendered", async () => {
    const el = document.createElement("t-dyn") as Dyn;
    document.body.append(el);
    await tick();
    el.append(document.createElement("i"));
    const lost = document.createElement("u");
    lost.slot = "nope";
    el.append(lost);
    await tick();
    expect(el.querySelector("main i")).not.toBeNull();
    expect(el.querySelector("u")).toBeNull();
  });
});

describe("changing the slot attribute reassigns", () => {
  it("head → default → a slot that does not exist", async () => {
    document.body.insertAdjacentHTML("beforeend", `<t-dyn id="rs"><b id="rsb" slot="head">B</b></t-dyn>`);
    const el = document.getElementById("rs") as Dyn;
    const b = document.getElementById("rsb") as HTMLElement;
    expect(el.querySelector("header")?.textContent).toBe("B");
    b.removeAttribute("slot");
    await tick();
    expect(el.querySelector("header")?.textContent).toBe("fallback");
    expect(el.querySelector("main")?.textContent).toBe("B");
    b.slot = "nope";
    await tick();
    expect(document.getElementById("rsb")).toBeNull();
    expect(el.assignedNodes("")).toEqual([]);
    expect(el.changes).toEqual(["head", "", ""]);
  });
});

describe("assignedNodes", () => {
  it("light: returns only assigned nodes, excludes fallback content, and reflects later changes", async () => {
    document.body.insertAdjacentHTML("beforeend", `<t-dyn id="an"><b slot="head">H</b>x</t-dyn><t-dyn id="an2"></t-dyn>`);
    const el = document.getElementById("an") as Dyn;
    expect(el.assignedNodes("head").map((n) => n.textContent)).toEqual(["H"]);
    expect(el.assignedNodes("").map((n) => n.textContent)).toEqual(["x"]);
    const empty = document.getElementById("an2") as Dyn;
    expect(empty.assignedNodes("head")).toEqual([]);
    const i = document.createElement("i");
    empty.append(i);
    await tick();
    expect(empty.assignedNodes("")).toEqual([i]);
  });
});

describe("data-if is hidden by default", () => {
  it("not shown until show is called; slot content is still correct once shown", () => {
    class W extends Component(wrapTpl) {}
    define("t-wrap", W);
    document.body.insertAdjacentHTML("beforeend", `<t-wrap id="w"><b slot="x">S</b></t-wrap>`);
    const w = document.getElementById("w") as W;
    expect(w.querySelector("section")).toBeNull();
    w.show("open", true);
    expect(w.querySelector("section b")?.textContent).toBe("S");
    w.text.t = "ok";
    expect(w.querySelector("section")?.textContent).toContain("ok");
  });
});

describe("scoped fallback", () => {
  it("without @scope it falls back to CSS nesting, and :scope becomes &", async () => {
    const { scopeCss } = await import("../src/lib/style.ts");
    vi.stubGlobal("CSSScopeRule", undefined);
    expect(scopeCss(":scope{a:b} .x{c:d}", "my-el")).toBe("my-el {\n&{a:b} .x{c:d}\n}");
    vi.stubGlobal("CSSScopeRule", class {});
    expect(scopeCss(".x{}", "my-el")).toBe("@scope (my-el) {\n.x{}\n}");
    vi.unstubAllGlobals();
  });
});

describe("styles", () => {
  it("light: <style> is injected into head only once, and scoped styles are wrapped in @scope", () => {
    document.body.append(document.createElement("t-styled"), document.createElement("t-styled"));
    const styles = [...document.head.querySelectorAll("style[data-ts-dom]")];
    const g = styles.filter((e) => (e as HTMLElement).dataset.tsDom === "");
    const sc = styles.filter((e) => (e as HTMLElement).dataset.tsDom === "t-styled");
    expect(g.length).toBe(1);
    expect(g[0]?.textContent).toContain(".g");
    expect(sc.length).toBe(1);
    expect(sc[0]?.textContent).toMatch(/^(@scope \(t-styled\)|t-styled) \{/);
    expect(document.querySelector("t-styled style")).toBeNull();
  });
  it("shadow: <style> stays inside the shadow root and does not go into head", () => {
    const el = document.createElement("t-styled-shadow") as StyledShadow;
    document.body.append(el);
    expect(el.shadowRoot?.querySelector("style")).not.toBeNull();
    expect(document.head.querySelectorAll("style[data-ts-dom]").length).toBe(2);
  });
  it("using :host in light mode warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    class H extends Component(hostTpl) {}
    define("t-host", H);
    document.body.append(document.createElement("t-host"));
    expect(warn).toHaveBeenCalledOnce();
    const msg = String(warn.mock.calls[0]?.[0]);
    expect(msg).toMatch(/\[host-in-light-dom\]/);
    expect(msg).toContain("Fix:");
    warn.mockRestore();
  });
});

describe("data-if inside list items", () => {
  it("each item toggles independently", () => {
    const c = new UserCard();
    document.body.append(c);
    c.set({ tags: [{ id: 1, label: "a", hot: true }, { id: 2, label: "b" }] });
    const items = c.querySelectorAll(".tag") ?? [];
    expect(items[0]?.querySelector("b")).not.toBeNull();
    expect(items[1]?.querySelector("b")).toBeNull();
    c.set({ tags: [{ id: 1, label: "a" }, { id: 2, label: "b", hot: true }] });
    expect(items[0]?.querySelector("b")).toBeNull();
    expect(items[1]?.querySelector("b")).not.toBeNull();
  });
});

describe("on()", () => {
  it("listeners are removed automatically when the element is removed; the returned function removes them manually", () => {
    const hits: string[] = [];
    class E extends Component(tpl) {
      override connected() {
        this.on(this, "click", () => hits.push("auto"));
        const off = this.on(this, "click", () => hits.push("manual"));
        off();
      }
    }
    define("t-on", E);
    const el = document.createElement("t-on");
    document.body.append(el);
    el.click();
    expect(hits).toEqual(["auto"]);
    el.remove();
    el.click();
    expect(hits).toEqual(["auto"]);
  });
});

describe("lifecycle & store", () => {
  it("bind subscriptions are cancelled after removal", () => {
    const s = createStore(1);
    const seen: number[] = [];
    class C extends Component(tpl) {
      override connected() { this.bind(s, (v) => seen.push(v)); }
    }
    define("t-bind", C);
    const el = document.createElement("t-bind");
    document.body.append(el);
    s.set(2);
    el.remove();
    s.set(3);
    expect(seen).toEqual([1, 2]);
  });
  it("UserCard end to end", () => {
    const c = new UserCard();
    document.body.append(c);
    expect(c.querySelector(".badge")).toBeNull();
    c.querySelector<HTMLButtonElement>("button")?.click();
    expect(c.querySelector(".badge")).not.toBeNull();
    c.set({ tags: [{ id: 1, label: "x" }] });
    expect(c.querySelectorAll(".tag").length).toBe(1);
  });
});

// Type check: wrong names must be rejected by tsc
export function typeOnly(r: Rows) {
  // @ts-expect-error a ref that does not exist
  void r.refs.nope;
  // @ts-expect-error a data-if that does not exist
  r.show("nope", true);
  // @ts-expect-error a list that does not exist
  void r.lists.nope;
}

describe("list keys and read-only binding", () => {
  it("replace throws on duplicate keys and leaves the list as it was", () => {
    const r = document.createElement("t-rows") as Rows;
    document.body.append(r);
    const upd = (s: string, { text }: { text: { n: unknown } }) => (text.n = s);
    r.lists.rows.replace(["a", "b"], (s) => s, upd);
    expect(() => r.lists.rows.replace(["a", "a"], (s) => s, upd)).toThrow(/duplicate-key/);
    expect(texts(r)).toEqual(["a", "b"]);
  });

  it("bind accepts a source with only get and subscribe", () => {
    const store = createStore(1);
    const readOnly = { get: store.get, subscribe: store.subscribe };
    const r = document.createElement("t-rows") as Rows;
    document.body.append(r);
    const seen: number[] = [];
    r.bind(readOnly, (v) => seen.push(v));
    store.set(2);
    expect(seen).toEqual([1, 2]);
  });
});
