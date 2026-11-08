// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { openPage } from "./server.ts";

let page: Page;
let errors: string[];
let browser: Browser;
let baseUrl: string;
let close: () => Promise<void>;

beforeAll(async () => {
  ({
    page,
    errors,
    browser,
    url: baseUrl,
    close,
  } = await openPage({
    path: "/browser/fixtures/page.html",
    ready: () => document.querySelector("#parsed p"),
  }));
}, 60_000);

afterAll(async () => {
  expect(errors).toEqual([]);
  await close();
});

const color = (sel: string) => page.evaluate((s) => getComputedStyle(document.querySelector(s) as Element).color, sel);

describe("Real browser: Light DOM", () => {
  it("parser-created elements: slot content is distributed correctly (after DOMContentLoaded)", async () => {
    expect(await page.textContent("#parsed header")).toBe("H");
    expect(await page.textContent("#parsed main")).toBe("body");
    expect(await page.evaluate(() => document.querySelector("#parsed")?.shadowRoot)).toBeNull();
  });
  it("holes and data-if are hidden by default", async () => {
    expect(await page.textContent("#parsed p")).toBe("light");
    expect(await page.$("#parsed [data-ref=extra]")).toBeNull();
  });
  it("scoped uses the native browser @scope and only applies inside the component", async () => {
    const native = await page.evaluate(() => {
      const el = [...document.querySelectorAll("style[data-ts-dom]")].find((s) => (s as HTMLElement).dataset.tsDom === "light-card") as HTMLStyleElement;
      return typeof CSSScopeRule !== "undefined" && el.sheet?.cssRules[0] instanceof CSSScopeRule;
    });
    expect(native).toBe(true);
    expect(await color("#parsed p")).toBe("rgb(255, 0, 0)");
    expect(await color("#outside")).not.toBe("rgb(255, 0, 0)");
  });
  it("<style> is injected only once and does not stay inside the component", async () => {
    expect(await page.$$eval("style[data-ts-dom]", (e) => e.length)).toBe(2);
    expect(await page.$("light-card style")).toBeNull();
  });
  it("slot content a parent template's data-if shows and hides later, and slotchange", async () => {
    const out = await page.evaluate(async () => {
      const tick = () => new Promise((r) => setTimeout(r));
      const p = document.createElement("light-card-parent") as HTMLElement & { set(s: { on: boolean }): void; refs: { kid: HTMLElement & { changes: string[] } } };
      document.body.append(p);
      await tick();
      const el = p.refs.kid;
      const fallback = el.querySelector("header")?.textContent;
      p.set({ on: true });
      await tick();
      const added = el.querySelector("header")?.textContent;
      p.set({ on: false });
      await tick();
      const restored = el.querySelector("header")?.textContent;
      return { fallback, added, restored, changes: el.changes };
    });
    expect(out).toEqual({ fallback: "fallback", added: "N", restored: "fallback", changes: ["head", "head"] });
  });
});

describe("a parent template's list and data-if inside a Light DOM slot component", () => {
  it("put their elements straight into the slot, never at the top level of the element first", async () => {
    const out = await page.evaluate(async () => {
      const tick = () => new Promise((r) => setTimeout(r));
      const p = document.createElement("light-card-list-parent") as HTMLElement & { fill(n: string[]): void; set(s: { on: boolean }): void; refs: { kid: HTMLElement } };
      document.body.append(p);
      p.fill(["a", "b"]);
      await tick();
      const kid = p.refs.kid;
      let topLevel = 0;
      const watch = new MutationObserver((records) => {
        for (const r of records) topLevel += [...r.addedNodes].filter((n) => n instanceof Element).length;
      });
      watch.observe(kid, { childList: true });
      p.fill(["c", "a", "b"]);
      p.fill(["b", "a", "c"]);
      p.set({ on: true });
      await tick();
      watch.disconnect();
      const main = [...kid.querySelectorAll("main i")].map((n) => n.textContent);
      const head = kid.querySelector("header")?.textContent;
      p.remove();
      return { topLevel, main, head };
    });
    expect(out).toEqual({ topLevel: 0, main: ["b", "a", "c"], head: "N" });
  });
});

describe("a parent template's list and data-if inside a slot that the component keeps out of the document", () => {
  it("land in the slot while it is out, and connect once when it is put back", async () => {
    const out = await page.evaluate(async () => {
      const tick = () => new Promise((r) => setTimeout(r));
      const counter = (window as unknown as { CountConnects: { connects: number } }).CountConnects;
      const p = document.createElement("b-modal-parent") as HTMLElement & { fill(n: string[]): void; set(s: { on: boolean }): void; refs: { dlg: HTMLElement & { open(): void; refs: { content: HTMLElement } } } };
      document.body.append(p);
      p.fill(["a", "b"]);
      p.set({ on: true });
      await tick();
      const whileOut = counter.connects;
      const dlg = p.refs.dlg;
      dlg.open();
      await tick();
      const content = dlg.refs.content;
      const items = [...content.querySelectorAll("i")].map((n) => n.textContent);
      const counted = !!content.querySelector("b-count-connects");
      const connects = counter.connects;
      p.remove();
      return { whileOut, connects, items, counted };
    });
    expect(out).toEqual({ whileOut: 0, connects: 1, items: ["a", "b"], counted: true });
  });
});

describe("Real browser: assignedNodes", () => {
  it("assignedNodes is consistent between light and shadow", async () => {
    const r = await page.evaluate(() => {
      const light = document.querySelector("#parsed") as HTMLElement & { assignedNodes(n: string): Node[] };
      const shadow = document.querySelector("#shadow") as HTMLElement & { assignedNodes(n: string): Node[] };
      const t = (el: { assignedNodes(n: string): Node[] }, n: string) => el.assignedNodes(n).map((x) => x.textContent);
      return { light: [t(light, "head"), t(light, "")], shadow: [t(shadow, "head"), t(shadow, "")] };
    });
    expect(r.light).toEqual([["H"], ["body"]]);
    expect(r.shadow).toEqual([["SH"], ["sbody"]]);
  });
});

describe("Real browser: changing the slot attribute", () => {
  it("light reassigns just like shadow", async () => {
    const r = await page.evaluate(async () => {
      const tick = () => new Promise((res) => setTimeout(res));
      const out: Record<string, (string | null)[][]> = {};
      for (const tag of ["light-card", "shadow-card"]) {
        const el = document.createElement(tag) as HTMLElement & { assignedNodes(n: string): Node[] };
        const b = document.createElement("b");
        b.slot = "head";
        b.textContent = "X";
        el.append(b);
        document.body.append(el);
        await tick();
        const t = () => [el.assignedNodes("head"), el.assignedNodes("")].map((a) => a.map((n) => n.textContent));
        const before = t();
        b.removeAttribute("slot");
        await tick();
        out[tag] = [...before, ...t()];
      }
      return out;
    });
    expect(r["light-card"]).toEqual([["X"], [], [], ["X"]]);
    expect(r["shadow-card"]).toEqual(r["light-card"]);
  });
});

describe("Real browser: props", () => {
  it("a prop assigned before the element is upgraded is not lost (an own property shadowing the accessor is recovered)", async () => {
    const r = await page.evaluate(async () => {
      const w = window as unknown as { Lazy: CustomElementConstructor };
      await new Promise((res) => setTimeout(res));
      const el = document.createElement("lazy-el") as HTMLElement & { label: string; props: { label: string } };
      el.label = "preassigned"; // not defined yet: this is just a plain property
      document.body.append(el);
      customElements.define("lazy-el", w.Lazy); // upgrade
      await new Promise((res) => setTimeout(res));
      return { prop: el.props.label, text: el.textContent?.trim(), own: Object.hasOwn(el, "label"), viaAccessor: el.label };
    });
    expect(r).toEqual({ prop: "preassigned", text: "preassigned", own: false, viaAccessor: "preassigned" });
  });
});

describe("Real browser: Shadow DOM", () => {
  it("style isolation: a <style> inside shadow does not leak out, and outside .t rules do not get in", async () => {
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("#shadow")?.shadowRoot?.querySelector("p") as Element).color)).not.toBe("rgb(0, 0, 255)");
    expect(await color("#outside")).not.toBe("rgb(255, 0, 0)");
    // Note: Playwright selectors pierce open shadow roots, so use the native querySelector here
    expect(await page.evaluate(() => document.querySelector("#shadow style"))).toBeNull();
    expect(await page.evaluate(() => document.querySelector("#shadow")?.shadowRoot?.querySelector("style") !== null)).toBe(true);
  });
});

describe("Real browser: fallback without @scope (CSS nesting)", () => {
  it("scoped falls back to nesting and behaves like native @scope", async () => {
    const p2 = await browser.newPage();
    // Remove CSSScopeRule before page scripts run to simulate a browser without @scope support
    await p2.addInitScript(() => {
      delete (window as unknown as Record<string, unknown>).CSSScopeRule;
    });
    await p2.goto(`${baseUrl}/browser/fixtures/page.html`);
    await p2.waitForFunction(() => document.querySelector("#parsed p"));
    const r = await p2.evaluate(() => {
      const el = [...document.querySelectorAll("style[data-ts-dom]")].find((x) => (x as HTMLElement).dataset.tsDom === "light-card") as HTMLStyleElement;
      const c = (sel: string) => getComputedStyle(document.querySelector(sel) as Element).color;
      return {
        hasScope: "CSSScopeRule" in window,
        text: el.textContent?.trim().split("\n")[0],
        nested: el.sheet?.cssRules[0]?.constructor.name,
        inside: c("#parsed p"),
        outside: c("#outside"),
        display: getComputedStyle(document.querySelector("#parsed") as Element).display,
      };
    });
    await p2.close();
    expect(r.hasScope).toBe(false);
    expect(r.text).toBe("light-card {");
    expect(r.nested).toBe("CSSStyleRule");
    expect(r.inside).toBe("rgb(255, 0, 0)");
    expect(r.outside).not.toBe("rgb(255, 0, 0)");
    expect(r.display).toBe("block"); // :scope → & must work too
  });
});

describe("what only a browser checks", () => {
  it("a constructor that gives the element an attribute or a child: the browser reports NotSupportedError and creates an HTMLUnknownElement instead", async () => {
    const before = errors.length;
    const made = await page.evaluate(() => {
      class Attr extends HTMLElement {
        constructor() {
          super();
          this.setAttribute("role", "list");
        }
      }
      class Child extends HTMLElement {
        constructor() {
          super();
          this.append(document.createElement("b"));
        }
      }
      customElements.define("x-ctor-attr", Attr);
      customElements.define("x-ctor-child", Child);
      return ["x-ctor-attr", "x-ctor-child"].map((tag) => document.createElement(tag).constructor.name);
    });
    expect(made).toEqual(["HTMLUnknownElement", "HTMLUnknownElement"]);
    const reported = errors.splice(before);
    expect(reported).toHaveLength(2);
    for (const e of reported) expect(e).toMatch(/NotSupportedError|must not have/);
  });

  it("a Light DOM child with no matching slot is removed from the element, with a console warning", async () => {
    const warnings: string[] = [];
    const onConsole = (m: { type(): string; text(): string }) => m.type() === "warning" && warnings.push(m.text());
    page.on("console", onConsole);
    const parent = await page.evaluate(async () => {
      const card = document.createElement("light-card");
      const lost = document.createElement("u");
      lost.slot = "nope";
      card.append(lost);
      document.body.append(card);
      await new Promise((r) => setTimeout(r));
      card.remove();
      return lost.parentNode === null;
    });
    page.off("console", onConsole);
    expect(parent).toBe(true);
    expect(warnings).toEqual([expect.stringContaining(`<light-card>: [unslotted-node] a child node with slot="nope" has no matching slot`)]);
  });
});

describe("Light DOM slots in a browser with moveBefore", () => {
  it("a component moved to another slot stays connected", async () => {
    const connects = await page.evaluate(async () => {
      class Count extends HTMLElement {
        static connects = 0;
        connectedCallback(): void {
          Count.connects++;
        }
        connectedMoveCallback(): void {}
      }
      customElements.define("x-count-connects", Count);
      const card = document.createElement("light-card");
      const kid = document.createElement("x-count-connects");
      kid.slot = "head";
      card.append(kid);
      document.body.append(card);
      await new Promise((r) => setTimeout(r));
      const before = Count.connects;
      kid.removeAttribute("slot");
      await new Promise((r) => setTimeout(r));
      const placed = card.querySelector("main x-count-connects") === kid;
      card.remove();
      return { placed, connects: Count.connects - before };
    });
    expect(connects).toEqual({ placed: true, connects: 0 });
  });
});

describe("render order", () => {
  it("a child component in a Light or Shadow DOM parent's template connects and renders first with the props the parent's first render gives it", async () => {
    const seen = await page.evaluate(async () => {
      await customElements.whenDefined("b-order-light");
      return ["b-order-light", "b-order-shadow"].map((tag) => {
        const parent = document.createElement(tag) as HTMLElement & { refs: { kid: { seen: string[] } } };
        document.body.append(parent);
        const s = parent.refs.kid.seen;
        parent.remove();
        return s;
      });
    });
    expect(seen).toEqual([
      ["render:Ada", "connected:Ada"],
      ["render:Ada", "connected:Ada"],
    ]);
  });
});

describe("components the parser creates inside each other", () => {
  it("a Light DOM component inside another starts once", async () => {
    const seen = await page.evaluate(() => (document.getElementById("parsed-kid") as HTMLElement & { seen: string[] }).seen);
    expect(seen).toEqual(["render:", "connected:"]);
  });
});

describe("a component moved out and back in", () => {
  it.each(["b-order-light", "b-order-shadow"])("%s runs connected() after the components inside it, on every connection", async (tag) => {
    const log = await page.evaluate((tag) => {
      const w = window as Window & { orderLog?: string[] };
      w.orderLog = [];
      const el = document.createElement(tag);
      document.body.append(el);
      el.remove();
      document.body.append(el);
      el.remove();
      const out = w.orderLog;
      delete w.orderLog;
      return out;
    }, tag);
    expect(log).toEqual(["child", "parent", "child", "parent"]);
  });
});

describe("a list without data-prop", () => {
  it("gives update() its item with the custom elements in it upgraded, so their methods and props work before it is inserted", async () => {
    const seen = await page.evaluate(() => {
      const el = document.createElement("b-order-rows") as HTMLElement & { fill(n: string[]): void };
      document.body.append(el);
      el.fill(["a", "b"]);
      const kids = [...el.querySelectorAll("b-order-child")] as (HTMLElement & { seen: string[] })[];
      const out = kids.map((k) => k.seen);
      el.remove();
      return out;
    });
    expect(seen).toEqual([
      ["render:a", "connected:a"],
      ["render:b", "connected:b"],
    ]);
  });
});
