import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({ server: { port: 5406, strictPort: true }, logLevel: "error" });
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

async function open(withoutMoveBefore) {
  const page = await browser.newPage();
  if (withoutMoveBefore) await page.addInitScript(() => delete Element.prototype.moveBefore);
  const messages = [];
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && messages.push(m.text()));
  await page.goto("http://localhost:5406/");
  await page.waitForSelector("#card button");
  const settled = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 2000 }).then(() => true, () => false);
  const log = () => page.evaluate(() => globalThis.nvLog.splice(0));
  return { page, messages, settled, log };
}

async function moveHosts({ page, log }) {
  await page.evaluate(() => {
    globalThis.marks = new Map([...document.querySelectorAll("#hosts nv-light-card, #probes nv-life-probe")].map((el) => [el, el.dataset.key ?? el.name]));
  });
  await log();
  await page.click("#rotate");
  const hosts = await page.evaluate(() =>
    [...document.querySelectorAll("#hosts nv-light-card")].map((el) => {
      const slotted = el.assignedNodes("").filter((n) => n.nodeType === 1);
      return `${el.dataset.key}${slotted.length === 1 ? slotted[0].textContent : "?"}${globalThis.marks.get(el)}`;
    }),
  );
  const sameProbes = await page.evaluate(() => [...document.querySelectorAll("#probes nv-life-probe")].every((el) => globalThis.marks.get(el) === el.name));
  return { hosts, sameProbes, moved: await log() };
}

try {
  const { page, messages, settled, log } = await open(false);

  const props = await page.$eval("#card", (el) => ({ attrs: el.getAttributeNames(), item: el.item, count: el.count, label: el.label }));
  check("props arrive as properties, not attributes", props.attrs.join() === "id" && props.item?.name === "apple" && props.count === 0 && props.label === "Fruit", props);
  await page.click("#next");
  check("changing Preact state re-renders the component", await settled(() => /1\s*pear/.test(document.querySelector("#card")?.textContent ?? "")), await page.textContent("#card"));
  await page.click("#card button");
  await page.click("#card button");
  check("onitem-select runs once per event with the detail", await settled(() => document.querySelector("#picked")?.textContent === "2,2"), await page.textContent("#picked"));
  await page.click("#camel button");
  await page.waitForTimeout(100);
  check("onItemSelect never hears item-select", (await page.textContent("#camel-count")) === "0", await page.textContent("#camel-count"));

  await page.fill("#field input", "typed");
  check("a value prop and a value-change event: typing updates Preact state", await settled(() => document.querySelector("#text")?.textContent === "typed"), await page.textContent("#text"));
  await page.click("#reset");
  check("a value prop and a value-change event: Preact state updates the field", await settled(() => document.querySelector("#field input")?.value === "reset"), await page.$eval("#field input", (i) => i.value));

  await page.click("#show-late");
  await page.click("#define-late");
  await settled(() => customElements.get("nv-late-card") !== undefined);
  const late = await page.evaluate(() => ["#late-prop", "#late-ref"].map((s) => {
    const el = document.querySelector(s);
    return { attrs: el.getAttributeNames(), itemAttr: el.getAttribute("item"), item: el.item, text: el.textContent.trim() };
  }));
  check("before define(), item={...} writes the attribute \"[object Object]\" and the component gets null", late[0].itemAttr === "[object Object]" && late[0].item === null, late[0]);
  check("before define(), a ref that sets el.item keeps the object and the component takes it over", late[1].attrs.join() === "id" && late[1].text === "pear", late[1]);

  for (const step of ["#rotate", "#toggle-b", "#rotate", "#toggle-b", "#toggle-title", "#rotate", "#toggle-title"]) await page.click(step);
  const slots = await page.evaluate(() => {
    const elements = (nodes) => nodes.filter((n) => n.nodeType === 1).map((n) => n.textContent.trim());
    const shadow = document.querySelector("#shadow");
    const light = document.querySelector("#light");
    return {
      shadow: [elements(shadow.assignedNodes("title")), elements(shadow.assignedNodes("")).join("")],
      light: [elements(light.assignedNodes("title")), [...light.querySelectorAll("p")].map((p) => p.textContent).join(""), elements(light.assignedNodes("")).length],
    };
  });
  check("shadow: true takes conditional and keyed children", JSON.stringify(slots.shadow) === '[["Shadow"],"cba"]', slots.shadow);
  check("Light DOM with one stable wrapper per slot takes conditional and keyed children", JSON.stringify(slots.light) === '[["Light"],"cba",1]', slots.light);

  const withMove = await moveHosts({ page, log });
  check("keyed reordering moves Light DOM hosts with their slotted children", withMove.hosts.join() === "aaa,ccc,bbb", withMove.hosts);
  check("with moveBefore, Preact moves the same element and it stays connected", withMove.sameProbes && withMove.moved.length === 0, withMove);

  let lines;
  await page.click("#tick");
  lines = await log();
  check("bind() delivers store updates to every connected probe", lines.length === 4 && lines.every((l) => l.startsWith("tick")), lines);
  await page.click("#toggle-probe");
  lines = await log();
  check("conditional removal runs disconnected()", JSON.stringify(lines) === '["disconnected cond"]', lines);
  await page.click("#tick");
  lines = await log();
  check("a removed component receives no store updates", lines.length === 3 && !lines.some((l) => l.includes("cond")), lines);
  await page.click("#toggle-probe");
  lines = await log();
  check("rendering it again runs connected() and binds with the current value", JSON.stringify(lines) === '["connected cond","tick cond 2"]', lines);

  check("no errors or warnings in the console", messages.length === 0, messages);

  const old = await open(true);
  const withoutMove = await moveHosts(old);
  check("without moveBefore, keyed reordering still moves hosts with their slotted children", withoutMove.hosts.join() === "ccc,aaa,bbb", withoutMove.hosts);
  check("without moveBefore, the moved element runs disconnected() then connected() and binds again", withoutMove.sameProbes && JSON.stringify(withoutMove.moved) === '["disconnected c","connected c","tick c 0"]', withoutMove);
  check("no errors or warnings in the console without moveBefore", old.messages.length === 0, old.messages);
} finally {
  await browser.close();
  await server.close();
}
if (failures.length) process.exit(1);
