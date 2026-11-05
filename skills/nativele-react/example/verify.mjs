import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({ server: { port: 5401, strictPort: true }, logLevel: "error" });
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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("http://localhost:5401/");
  await page.waitForSelector("#card button");

  const props = await page.$eval("#card", (el) => ({ attrs: el.getAttributeNames(), item: el.item, text: el.textContent }));
  check("props arrive as properties, not attributes", props.attrs.join() === "id" && props.item?.name === "apple", props);
  await page.click("#next");
  const settled = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 2000 }).then(() => true, () => false);
  check("changing React state re-renders the component", await settled(() => /1\s*pear/.test(document.querySelector("#card")?.textContent ?? "")), await page.textContent("#card"));

  await page.click("#card button");
  check("onitem-select fires once per click with a typed detail", await settled(() => document.querySelector("#picked")?.textContent === "2"), await page.textContent("#picked"));

  const order = (sel) => page.$$eval(`${sel} p`, (ps) => ps.map((p) => p.textContent).join(""));
  for (const step of ["#rotate", "#toggle-b", "#rotate", "#toggle-b", "#toggle-title", "#rotate", "#toggle-title"]) await page.click(step);
  const rows = await order("#shadow");
  check("shadow: true takes changing React children", rows.length === 3 && rows === (await order("#light")), rows);
  check("Light DOM with one stable wrapper per slot takes changing React children", (await order("#light")) === rows, await order("#light"));
  check("the title slot follows React", (await page.textContent("#light h2"))?.includes("Light"), await page.textContent("#light h2"));
  check("no errors on the page", errors.length === 0, errors);
} finally {
  await browser.close();
  await server.close();
}
if (failures.length) process.exit(1);
