import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({ server: { port: 5402, strictPort: true }, logLevel: "error" });
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

try {
  const page = await browser.newPage();
  const messages = [];
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && messages.push(m.text()));
  await page.goto("http://localhost:5402/");
  await page.waitForSelector("#card button");
  const settled = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 2000 }).then(() => true, () => false);
  const log = () => page.evaluate(() => globalThis.nvLog.splice(0));

  check("a kebab-case Vue component still renders", (await page.$eval("#hello", (el) => el.tagName)) === "P", await page.$eval("#hello", (el) => el.outerHTML));

  const props = await page.$eval("#card", (el) => ({ attrs: el.getAttributeNames(), item: el.item, count: el.count }));
  check("props arrive as properties, not attributes", props.attrs.join() === "id" && props.item?.name === "apple" && props.count === 0, props);
  await page.click("#next");
  check("changing Vue state re-renders the component", await settled(() => /1\s*pear/.test(document.querySelector("#card")?.textContent ?? "")), await page.textContent("#card"));
  await page.click("#card button");
  await page.click("#card button");
  check("@item-select runs once per event with a typed detail", await settled(() => document.querySelector("#picked")?.textContent === "2,2"), await page.textContent("#picked"));

  await page.fill("#field input", "typed");
  check("prop + event replaces v-model: typing updates Vue state", await settled(() => document.querySelector("#text")?.textContent === "typed"), await page.textContent("#text"));
  await page.click("#reset");
  check("prop + event replaces v-model: Vue state updates the field", await settled(() => document.querySelector("#field input")?.value === "reset"), await page.$eval("#field input", (i) => i.value));

  await page.click("#show-late");
  await page.click("#define-late");
  await settled(() => customElements.get("nv-late-card") !== undefined);
  const late = await page.evaluate(() => ["#late-bind", "#late-prop"].map((s) => {
    const el = document.querySelector(s);
    return { attrs: el.getAttributeNames(), item: el.item, text: el.textContent.trim() };
  }));
  check("before define(), :item writes an attribute and the object is lost", late[0].attrs.includes("item") && late[0].item === null, late[0]);
  check("before define(), .item sets the property and the component takes it over", late[1].attrs.join() === "id" && late[1].text === "pear", late[1]);

  for (const step of ["#rotate", "#toggle-b", "#rotate", "#toggle-b", "#toggle-title", "#rotate", "#toggle-title"]) await page.click(step);
  const slots = await page.evaluate(() => {
    const elements = (nodes) => nodes.filter((n) => n.nodeType === 1).map((n) => n.textContent.trim());
    const shadow = document.querySelector("#shadow");
    const light = document.querySelector("#light");
    return {
      shadow: [elements(shadow.assignedNodes("title")), [...shadow.querySelectorAll("p")].map((p) => p.textContent).join("")],
      light: [elements(light.assignedNodes("title")), [...light.querySelectorAll("p")].map((p) => p.textContent).join(""), elements(light.assignedNodes("")).length],
    };
  });
  check("shadow: true takes v-for and v-if children", JSON.stringify(slots.shadow) === '[["Shadow"],"cba"]', slots.shadow);
  check("Light DOM with one stable wrapper per slot takes v-for and v-if children", JSON.stringify(slots.light) === '[["Light"],"cba",1]', slots.light);

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
  check("v-for moves Light DOM hosts with their slotted children", hosts.join() === "aaa,ccc,bbb", hosts);
  const sameProbes = await page.evaluate(() => [...document.querySelectorAll("#probes nv-life-probe")].every((el) => globalThis.marks.get(el) === el.name));
  const moved = await log();
  check("v-for keeps the moved element, runs disconnected() then connected(), and binds again", sameProbes && JSON.stringify(moved) === '["disconnected a","connected a","tick a 0"]', moved);
  const kept = await page.evaluate(() => {
    globalThis.kept = [...document.querySelectorAll("nv-life-probe")].find((el) => el.name === "kept");
    return globalThis.kept !== undefined;
  });
  let lines;
  await page.click("#tick");
  lines = await log();
  check("bind() delivers store updates to every connected probe", kept && lines.length === 5 && lines.every((l) => l.startsWith("tick")), lines);

  await page.click("#swap");
  lines = await log();
  check("<KeepAlive> deactivation runs disconnected()", JSON.stringify(lines) === '["disconnected kept"]', lines);
  await page.click("#tick");
  lines = await log();
  check("a deactivated component receives no store updates", lines.length === 4 && !lines.some((l) => l.includes("kept")), lines);
  await page.click("#swap");
  lines = await log();
  check("<KeepAlive> activation runs connected() and binds again with the current value", JSON.stringify(lines) === '["connected kept","tick kept 2"]', lines);
  check("<KeepAlive> reinserts the same element", await page.evaluate(() => globalThis.kept.isConnected), false);

  await page.click("#toggle-probe");
  lines = await log();
  check("v-if removal runs disconnected()", JSON.stringify(lines) === '["disconnected vif"]', lines);
  await page.click("#tick");
  lines = await log();
  check("a removed component receives no store updates", lines.length === 4 && !lines.some((l) => l.includes("vif")), lines);

  check("no errors or Vue warnings in the console", messages.length === 0, messages);
} finally {
  await browser.close();
  await server.close();
}
if (failures.length) process.exit(1);
