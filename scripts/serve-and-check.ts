// Serve a project directory with a static server, load it in a real browser and check the page (verifies "no bundler needed").
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { launchChrome } from "../browser/server.ts";

const dir = process.argv[2];
if (!dir) throw new Error("usage: serve-and-check.ts <project directory>");
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };

const server = createServer(async (req, res) => {
  const raw = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
  const path = raw === "/" ? "/index.html" : raw;
  try {
    const body = await readFile(join(dir, path));
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;

const browser = await launchChrome();
const failures: string[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures.push(`${name}${detail === undefined ? "" : `(actual: ${JSON.stringify(detail)})`}`);
};
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => failures.push(`page error: ${e.message}`));
  page.on("requestfailed", (r) => failures.push(`request failed: ${r.url()}`));
  page.on("response", (r) => r.status() >= 400 && failures.push(`HTTP ${r.status()}：${r.url()}`));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector("x-hello h1", { timeout: 10_000 });

  check("hole is filled", (await page.textContent("x-hello h1")) === "Hi world", await page.textContent("x-hello h1"));
  check("slot content is assigned", (await page.textContent("x-hello .extra")) === "S");
  check("list starts with 1 item", (await page.$$("x-hello li")).length === 1);
  await page.click("x-hello button");
  check("list has 2 items after the click", (await page.$$("x-hello li")).length === 2);
  check("data-if is hidden by default and appears once shown", (await page.$$("x-hello li b")).length === 1);
  check("child component is imported and rendered (props flow down)", (await page.textContent("x-hello .kid")) === "k0", await page.textContent("x-hello .kid"));
  await page.click("x-hello x-kid button");
  check("child event flows up, then the parent updates the props again", (await page.textContent("x-hello .pings")) === "1" && (await page.textContent("x-hello .kid")) === "k1", [await page.textContent("x-hello .pings"), await page.textContent("x-hello .kid")]);
  check("scoped style is injected", (await page.$$("style[data-nativel='x-hello']")).length === 1);
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error(failures.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(1);
}
console.log("  ok: runs in the browser (no bundler)");
