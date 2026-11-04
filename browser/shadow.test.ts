// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { launchChrome, startServer } from "./server.ts";

let browser: Browser;
let page: Page;
let stop: () => void;
const errors: string[] = [];

beforeAll(async () => {
  const s = await startServer(5304);
  stop = s.stop;
  browser = await launchChrome();
  page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "warning" && errors.push(`warn: ${m.text()}`));
  await page.goto(`${s.url}/browser/fixtures/shadow/page.html`);
  await page.waitForFunction(() => document.querySelector("#plain")?.shadowRoot?.querySelector("p"));
  // Count custom events that bubble out to the window: emitted events must not (they do not bubble by default).
  await page.evaluate(() => {
    const w = window as unknown as { leaked: string[] };
    w.leaked = [];
    window.addEventListener("bumped", () => w.leaked.push("bumped"));
  });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  stop?.();
});

/** Run a function in the page with the shadow root of the element matching `host`. The function must not use closure variables. */
const inShadow = <T>(host: string, fn: (root: ShadowRoot) => T): Promise<T> =>
  page.evaluate(
    ([sel, src]) => {
      const root = document.querySelector(sel as string)?.shadowRoot;
      if (!root) throw new Error(`no shadow root on ${sel}`);
      return new Function("root", `return (${src})(root)`)(root);
    },
    [host, fn.toString()] as const,
  ) as Promise<T>;
const text = (host: string, sel: string) =>
  page.evaluate(([h, s]) => document.querySelector(h as string)?.shadowRoot?.querySelector(s as string)?.textContent ?? null, [host, sel] as const);
const click = (host: string, sel: string) =>
  page.evaluate(([h, s]) => (document.querySelector(h as string)?.shadowRoot?.querySelector(s as string) as HTMLElement | null)?.click(), [host, sel] as const);
const color = (host: string, sel: string) =>
  page.evaluate(([h, s]) => getComputedStyle(document.querySelector(h as string)?.shadowRoot?.querySelector(s as string) as Element).color, [host, sel] as const);

describe("Shadow DOM: rendering and isolation", () => {
  it("renders into a shadow root, not into the light DOM", async () => {
    expect(await page.evaluate(() => document.querySelector("#plain")?.shadowRoot?.mode)).toBe("open");
    expect(await page.evaluate(() => document.querySelector("#plain p"))).toBeNull();
    expect(await text("#plain", "p")).toBe("plain:0");
  });
  it("a Shadow DOM component's <style> stays inside its shadow root and is never injected into <head>", async () => {
    expect(await inShadow("#plain", (r) => r.querySelector("style") !== null)).toBe(true);
    // The Light DOM variant (lt-leaf) does inject a global style; the Shadow DOM components must not.
    const tags = await page.evaluate(() => [...document.querySelectorAll("style[data-nativele]")].map((e) => (e as HTMLElement).dataset.nativele));
    expect(tags).not.toContain("sh-leaf");
    expect(tags).not.toContain("sh-panel");
    expect(tags).not.toContain("sh-scoped");
  });
  it("document styles do not leak in (p { color: red !important }), and :host styles the host", async () => {
    expect(await color("#plain", "p")).toBe("rgb(0, 128, 0)");
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("#panel") as Element).display)).toBe("block");
    // the same markup in Light DOM *is* affected by the document style
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("#host .total") as Element).color)).toBe("rgb(255, 0, 0)");
  });
  it("<style scoped> has no effect in Shadow DOM: it behaves like a normal shadow style and is not injected globally", async () => {
    expect(await color("#scoped", ".x")).toBe("rgb(1, 2, 3)");
    expect(await page.evaluate(() => document.querySelector("style[data-nativele='sh-scoped']"))).toBeNull();
  });
});

describe("Shadow DOM: slots (native)", () => {
  it("assigns light DOM children to the native slot and keeps their document styling", async () => {
    const r = await page.evaluate(() => {
      const el = document.querySelector("#plain") as HTMLElement & { assignedNodes(n: string): Node[] };
      const slot = el.shadowRoot?.querySelector("slot[name=extra]") as HTMLSlotElement;
      return {
        assigned: el.assignedNodes("extra").map((n) => n.textContent),
        native: slot.assignedNodes().map((n) => n.textContent),
        color: getComputedStyle(document.querySelector("#slotted") as Element).color,
        lightParent: document.querySelector("#slotted")?.parentElement?.id,
      };
    });
    expect(r).toEqual({ assigned: ["slotted"], native: ["slotted"], color: "rgb(200, 0, 0)", lightParent: "plain" });
  });
  it("shows the fallback when nothing is assigned, and the native slotchange event fires on changes", async () => {
    const r = await page.evaluate(async () => {
      const tick = () => new Promise((res) => setTimeout(res));
      const el = document.createElement("sh-leaf") as HTMLElement & { assignedNodes(n: string): Node[] };
      document.body.append(el);
      const slot = el.shadowRoot?.querySelector("slot[name=extra]") as HTMLSlotElement;
      let changes = 0;
      slot.addEventListener("slotchange", () => changes++);
      await tick();
      const before = { assigned: el.assignedNodes("extra").length, fallback: slot.assignedNodes({ flatten: true }).map((n) => n.textContent) };
      const b = document.createElement("b");
      b.slot = "extra";
      b.textContent = "new";
      el.append(b);
      await tick();
      const after = el.assignedNodes("extra").map((n) => n.textContent);
      b.remove();
      await tick();
      el.remove();
      return { before, after, changes };
    });
    expect(r.before).toEqual({ assigned: 0, fallback: ["fallback"] });
    expect(r.after).toEqual(["new"]);
    expect(r.changes).toBe(2);
  });
});

describe("Shadow DOM: props, state, derive and data-if", () => {
  it("HTML attributes become props (number coerced) and fill the holes inside the shadow root", async () => {
    expect(await text("#panel", "sh-leaf")).toBe(""); // the child's content lives in the child's own shadow root, not in the parent's
    expect(await inShadow("#panel", (r) => (r.querySelector("sh-leaf") as HTMLElement & { props: unknown }).props)).toEqual({ label: "static", count: 3 });
    expect(await inShadow("#panel", (r) => r.querySelector("sh-leaf")?.shadowRoot?.querySelector("p")?.textContent)).toBe("static:3");
  });
  it("property assignment updates the shadow view; data-if is hidden by default and bound to derived values", async () => {
    const r = await page.evaluate(async () => {
      const el = document.createElement("sh-leaf") as HTMLElement & { label: string; count: number; bump(): void };
      document.body.append(el);
      const q = (s: string) => el.shadowRoot?.querySelector(s);
      const out: Record<string, unknown> = { initialBig: q(".big") !== null };
      el.label = "L";
      el.count = 9;
      out.text = q("p")?.textContent;
      el.bump();
      out.afterOne = q(".big") !== null;
      el.bump();
      out.afterTwo = q(".big") !== null;
      el.remove();
      return out;
    });
    expect(r).toEqual({ initialBig: false, text: "L:9", afterOne: false, afterTwo: true });
  });
  it("a prop assigned before the element is upgraded is kept", async () => {
    const r = await page.evaluate(async () => {
      const w = window as unknown as { LateShadow: CustomElementConstructor };
      const el = document.createElement("sh-late") as HTMLElement & { label: string; props: { label: string } };
      el.label = "early"; // not defined yet: this is just an own property of a plain element
      document.body.append(el);
      customElements.define("sh-late", w.LateShadow); // upgrade
      await new Promise((res) => setTimeout(res));
      const out = { prop: el.props.label, shown: el.shadowRoot?.querySelector("p")?.textContent, own: Object.hasOwn(el, "label") };
      el.remove();
      return out;
    });
    expect(r).toEqual({ prop: "early", shown: "early", own: false });
  });
});

describe("Shadow DOM: events (delegation, emit, composition)", () => {
  it("data-on-click inside the shadow root calls the method, and state updates the view", async () => {
    await click("#plain", "button");
    expect(await text("#plain", "p")).toBe("plain:0");
    expect(await page.evaluate(() => (document.querySelector("#plain") as unknown as { state: { clicks: number } }).state.clicks)).toBe(1);
  });
  it("non-bubbling focus events are delegated (capture phase) and fire once", async () => {
    await page.evaluate(() => (document.querySelector("#plain")?.shadowRoot?.querySelector("input") as HTMLInputElement | null)?.focus());
    expect(await page.evaluate(() => (document.querySelector("#plain") as unknown as { focusCount: number }).focusCount)).toBe(1);
  });
  it("emitted events reach the parent's data-on-* handler but do not bubble out to the window", async () => {
    await inShadow("#panel", (r) => (r.querySelector("sh-leaf")?.shadowRoot?.querySelector("button") as HTMLElement | null)?.click());
    const log = await page.evaluate(() => (document.querySelector("#panel") as unknown as { log: string[] }).log);
    expect(log).toEqual(["leaf:1"]);
    expect(await text("#panel", ".total")).toBe("1");
    expect(await page.evaluate(() => (window as unknown as { leaked: string[] }).leaked)).toEqual([]);
  });
  it("a Light DOM child inside a Shadow DOM parent works the same way", async () => {
    await inShadow("#panel", (r) => (r.querySelector("lt-leaf button") as HTMLElement).click());
    const log = await page.evaluate(() => (document.querySelector("#panel") as unknown as { log: string[] }).log);
    expect(log.at(-1)).toBe("light");
    expect(await text("#panel", ".total")).toBe("2");
  });
  it("list items hold child components: the event carries the item key", async () => {
    const rows = await inShadow("#panel", (r) => [...r.querySelectorAll("li sh-leaf")].map((e) => e.shadowRoot?.querySelector("p")?.textContent));
    expect(rows).toEqual(["row 1:0", "row 2:0"]);
    await inShadow("#panel", (r) => (r.querySelectorAll("li sh-leaf")[1]?.shadowRoot?.querySelector("button") as HTMLElement | null)?.click());
    const log = await page.evaluate(() => (document.querySelector("#panel") as unknown as { log: string[] }).log);
    expect(log.at(-1)).toBe("row:2");
    expect(await text("#panel", ".total")).toBe("3");
  });
  it("a Shadow DOM child inside a Light DOM parent works, and the parent's slotted content is assigned to the child's slot", async () => {
    await inShadow("#host sh-leaf", (r) => (r.querySelector("button") as HTMLElement).click());
    expect(await page.evaluate(() => document.querySelector("#host .total")?.textContent)).toBe("1");
    const slotted = await page.evaluate(() => {
      const child = document.querySelector("#host sh-leaf") as HTMLElement & { assignedNodes(n: string): Node[] };
      return child.assignedNodes("extra").map((n) => n.textContent);
    });
    expect(slotted).toEqual(["slotted"]);
  });
  it("user content placed in a slot is not owned by the component: its data-on-click never fires", async () => {
    const clicks = await page.evaluate(() => {
      const el = document.createElement("sh-leaf") as HTMLElement & { state: { clicks: number } };
      el.innerHTML = `<button slot="extra" data-on-click="bump">user</button>`;
      document.body.append(el);
      (el.querySelector("button") as HTMLElement).click();
      const n = el.state.clicks;
      el.remove();
      return n;
    });
    expect(clicks).toBe(0);
  });
  it("detaching and re-attaching keeps the state and does not duplicate event handling", async () => {
    const n = await page.evaluate(() => {
      const el = document.createElement("sh-leaf") as HTMLElement & { state: { clicks: number } };
      document.body.append(el);
      const btn = el.shadowRoot?.querySelector("button") as HTMLElement;
      btn.click();
      el.remove();
      document.body.append(el);
      btn.click();
      const n = el.state.clicks;
      el.remove();
      return n;
    });
    expect(n).toBe(2);
  });
});

describe("Shadow DOM: no unexpected errors or warnings", () => {
  it("the page produced no page errors or console warnings", () => {
    expect(errors).toEqual([]);
  });
});
