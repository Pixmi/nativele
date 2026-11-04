// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;
let baseUrl: string;

beforeAll(async () => {
  const s = await startServer(5301);
  stop = s.stop;
  baseUrl = s.url;
  browser = await launchChrome();
  page = await browser.newPage();
  page.on("pageerror", (e) => {
    throw e;
  });
  await page.goto(`${s.url}/browser/fixtures/page.html`);
  await page.waitForFunction(() => document.querySelector("#parsed p"));
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
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
      const el = [...document.querySelectorAll("style[data-nativel]")].find((s) => (s as HTMLElement).dataset.nativel === "light-card") as HTMLStyleElement;
      return typeof CSSScopeRule !== "undefined" && el.sheet?.cssRules[0] instanceof CSSScopeRule;
    });
    expect(native).toBe(true);
    expect(await color("#parsed p")).toBe("rgb(255, 0, 0)");
    expect(await color("#outside")).not.toBe("rgb(255, 0, 0)");
  });
  it("<style> is injected only once and does not stay inside the component", async () => {
    expect(await page.$$eval("style[data-nativel]", (e) => e.length)).toBe(2);
    expect(await page.$("light-card style")).toBeNull();
  });
  it("dynamically adding and removing slot content, and slotchange", async () => {
    const out = await page.evaluate(async () => {
      const tick = () => new Promise((r) => setTimeout(r));
      const el = document.createElement("light-card") as HTMLElement & { changes: string[] };
      document.body.append(el);
      await tick();
      const fallback = el.querySelector("header")?.textContent;
      const b = document.createElement("b");
      b.slot = "head";
      b.textContent = "N";
      el.append(b);
      await tick();
      const added = el.querySelector("header")?.textContent;
      b.remove();
      await tick();
      const restored = el.querySelector("header")?.textContent;
      return { fallback, added, restored, changes: el.changes };
    });
    expect(out).toEqual({ fallback: "fallback", added: "N", restored: "fallback", changes: ["head", "head"] });
  });
  it("keyed list reordering keeps existing nodes", async () => {
    const same = await page.evaluate(() => {
      const el = document.createElement("light-card") as HTMLElement & { lists: { rows: { replace(i: string[], k: (s: string) => string, u: (s: string, c: { text: { n: string } }) => void): void } } };
      document.body.append(el);
      const upd = (s: string, c: { text: { n: string } }) => (c.text.n = s);
      el.lists.rows.replace(["a", "b", "c"], (s) => s, upd);
      const b = el.querySelectorAll("li")[1];
      el.lists.rows.replace(["c", "b", "a"], (s) => s, upd);
      const lis = [...el.querySelectorAll("li")];
      return { order: lis.map((l) => l.textContent), kept: lis[1] === b };
    });
    expect(same).toEqual({ order: ["c", "b", "a"], kept: true });
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
  it("native slot assignment", async () => {
    const r = await page.evaluate(() => {
      const el = document.querySelector("#shadow") as HTMLElement;
      const slots = [...(el.shadowRoot?.querySelectorAll("slot") ?? [])];
      return slots.map((s) => s.assignedNodes().map((n) => n.textContent));
    });
    expect(r).toEqual([["SH"], ["sbody"]]);
  });
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
      const el = [...document.querySelectorAll("style[data-nativel]")].find((x) => (x as HTMLElement).dataset.nativel === "light-card") as HTMLStyleElement;
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
