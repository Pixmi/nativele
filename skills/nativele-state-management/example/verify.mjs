import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({ server: { port: 5431, strictPort: true }, logLevel: "error" });
await server.listen();
const chrome = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const browser = await chromium.launch({
  ...(existsSync(chrome) ? { executablePath: chrome } : {}),
  args: ["--no-sandbox", "--no-zygote", "--disable-gpu", "--disable-dev-shm-usage"],
});
const failures = [];
const check = (name, ok, got) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `: got ${JSON.stringify(got)}`}`);
  if (!ok) failures.push(name);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  const page = await browser.newPage();
  const messages = [];
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && messages.push(m.text()));
  await page.goto("http://localhost:5431/");
  await page.waitForFunction(() => document.querySelector("#filter button")?.textContent === "filter: all");

  const texts = () => page.evaluate(() => Object.fromEntries(["user", "theme", "badge", "summary", "counter", "filter"].map((id) => [id, document.getElementById(id).textContent.replace(/\s+/g, " ").trim()])));
  check("every component shows the current store value when it connects", same(await texts(), { user: "guest", theme: "theme: light", badge: "0 in cart", summary: "0 items", counter: "0 +1", filter: "filter: all" }), await texts());

  await page.evaluate(() => {
    globalThis.calls = [];
    for (const tag of ["cart-badge", "cart-summary", "counter-view", "filter-toggle", "theme-switch"]) {
      const proto = customElements.get(tag).prototype;
      for (const name of ["set", "render"]) {
        const original = proto[name];
        proto[name] = function (...args) {
          globalThis.calls.push(`${name} ${tag}`);
          return original.apply(this, args);
        };
      }
    }
  });
  const calls = () => page.evaluate(() => globalThis.calls.splice(0));
  const act = (fn) => page.evaluate(fn);

  const added = await act(() => {
    document.querySelector("#form button").click();
    return document.getElementById("badge").textContent.trim();
  });
  check("Zustand: an action called from a Nativele handler updates the view before it returns", added === "1 in cart", added);
  let lines = await calls();
  check("Zustand: a change to the selected slice runs the callback and renders", same(lines.filter((l) => l.endsWith("cart-badge")), ["set cart-badge", "render cart-badge"]), lines);
  check("Zustand: the whole store bound directly also renders", same(lines.filter((l) => l.endsWith("cart-summary")), ["set cart-summary", "render cart-summary"]), lines);

  await page.fill("#form input", "gift");
  lines = await calls();
  check("Zustand: an unrelated change runs no callback and no render through the selector", !lines.some((l) => l.endsWith("cart-badge")), lines);
  check("Zustand: an unrelated change runs the whole-store callback, and set() skips the render", same(lines, ["set cart-summary"]), lines);

  const counted = await act(() => {
    document.querySelector("#counter button").click();
    return document.querySelector("#counter b").textContent;
  });
  check("Redux: dispatch from a Nativele handler updates the view before it returns", counted === "1", counted);
  lines = await calls();
  check("Redux: the selected value renders once", same(lines, ["set counter-view", "render counter-view"]), lines);
  await page.click("#filter button");
  lines = await calls();
  check("Redux: an action on another slice runs no callback and no render through the selector", same(lines, ["set filter-toggle", "render filter-toggle"]), lines);

  const themed = await act(() => {
    document.querySelector("#theme button").click();
    return document.querySelector("#theme button").textContent;
  });
  lines = await calls();
  check("nanostores: get + listen delivers each change once, before set() returns", same(lines, ["set theme-switch", "render theme-switch"]) && themed === "theme: dark", { lines, themed });

  await page.click("sign-in button");
  check("createStore: a change from one component reaches another", (await texts()).user === "Ada", await texts());

  await act(() => {
    globalThis.parked = ["badge", "counter", "theme"].map((id) => document.getElementById(id));
    for (const el of globalThis.parked) el.remove();
  });
  await calls();
  await act(async () => {
    document.querySelector("#form button").click();
    document.querySelector("#filter button").click();
    const { store, increment } = await import("/src/stores/counter.ts");
    store.dispatch(increment());
    const { $theme } = await import("/src/stores/theme.ts");
    $theme.set("light");
  });
  lines = await calls();
  check("a removed component gets no updates from Zustand, Redux or nanostores", !lines.some((l) => /cart-badge|counter-view|theme-switch/.test(l)), lines);
  await act(() => {
    const [badge, counter, theme] = globalThis.parked;
    document.querySelector("section").prepend(badge);
    document.querySelectorAll("section")[1].prepend(counter);
    document.querySelector("header").append(theme);
  });
  lines = await calls();
  const back = await texts();
  check("re-inserted, each component binds again and gets the current value at once", same(lines, ["set cart-badge", "render cart-badge", "set counter-view", "render counter-view", "set theme-switch", "render theme-switch"]) && back.badge === "2 in cart" && back.counter === "2 +1" && back.theme === "theme: light", { lines, back });
  await act(() => document.querySelector("#form button").click());
  lines = await calls();
  check("re-inserted, it subscribes once, not twice", same(lines.filter((l) => l.endsWith("cart-badge")), ["set cart-badge", "render cart-badge"]), lines);

  const contract = await act(async () => {
    const { session } = await import("/src/stores/session.ts");
    const { $theme } = await import("/src/stores/theme.ts");
    const { cart } = await import("/src/stores/cart.ts");
    const { fromStore } = await import("/src/stores/from-store.ts");
    const host = document.createElement("user-badge");
    document.body.append(host);
    const { store, setFilter } = await import("/src/stores/counter.ts");
    const seen = { store: [], nanoDirect: 0, nanoListen: 0, newObject: 0, keptItems: 0, keptSlice: 0 };
    host.bind(session, (s) => seen.store.push(s.user));
    session.set({ user: "Bo" });
    session.set((s) => s);
    host.bind($theme, () => seen.nanoDirect++);
    host.bind({ get: $theme.get, subscribe: $theme.listen }, () => seen.nanoListen++);
    host.bind(fromStore(cart, (s) => ({ count: s.items.length })), () => seen.newObject++);
    host.bind(fromStore(cart, (s) => s.items), () => seen.keptItems++);
    host.bind(fromStore(store, (s) => s.counter), () => seen.keptSlice++);
    store.dispatch(setFilter("all"));
    store.dispatch(setFilter("done"));
    cart.getState().setNote("a");
    cart.getState().setNote("b");
    host.remove();
    session.set({ user: "Cy" });
    document.body.append(host);
    session.set({ user: "Di" });
    host.remove();
    return seen;
  });
  check("bind calls back at once with get(), then on every change, and not for an Object.is-equal set", same(contract.store, ["Ada", "Bo"]), contract.store);
  check("bind made outside connected() ends on removal and is not made again on re-insertion", same(contract.store, ["Ada", "Bo"]), contract.store);
  check("nanostores: binding the atom itself calls back twice at once (its subscribe also calls)", contract.nanoDirect === 2, contract.nanoDirect);
  check("nanostores: get + listen calls back once at once", contract.nanoListen === 1, contract.nanoListen);
  check("a selector that returns a new object calls back on every change", contract.newObject === 3, contract.newObject);

  check("a selector that returns an array or slice the store keeps calls back only when it changes", contract.keptItems === 1 && contract.keptSlice === 1, contract);

  check("no errors or warnings in the console", messages.length === 0, messages);
} finally {
  await browser.close();
  await server.close();
}
if (failures.length) process.exit(1);
