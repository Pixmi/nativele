import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { build, createLogger, createServer, preview } from "vite";

const nv = "web/src/nv";
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
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, " ").trim());
const open = async (url, sel) => {
  const page = await browser.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && page.errors.push(m.text()));
  await page.goto(url);
  await page.waitForSelector(sel);
  return page;
};

const generated = () => readdirSync(nv).filter((f) => f.endsWith(".html.ts") || f === "ts-dom-tags.ts");
for (const f of generated()) rmSync(`${nv}/${f}`);
await build({ logLevel: "error" });
check("vite build alone writes the generated files", generated().sort().join() === "about-card.html.ts,hello-card.html.ts,ts-dom-tags.ts", generated());
check("vite build writes both pages", existsSync("dist/index.html") && existsSync("dist/about.html"), readdirSync("dist"));

const built = await preview({ preview: { port: 4403, strictPort: true }, logLevel: "error" });
try {
  const home = await open("http://localhost:4403/", "hello-card button");
  await home.click("hello-card button");
  check("built home page renders and runs its component", (await text(home, "hello-card")) === "Hello, home clicked 1", await text(home, "hello-card"));
  const about = await open("http://localhost:4403/about.html", "about-card h1");
  check("built about page renders its component", (await text(about, "about-card")) === "About Version 1", await text(about, "about-card"));
  check("no errors on the built pages", home.errors.length + about.errors.length === 0, [...home.errors, ...about.errors]);
  await home.close();
  await about.close();
} finally {
  await built.close();
}

const logged = [];
const logger = createLogger("error");
logger.error = (msg) => logged.push(msg);
const server = await createServer({ customLogger: logger, server: { port: 5403, strictPort: true } });
await server.listen();
const files = [`${nv}/hello-card.html`, `${nv}/hello-card.ts`, `${nv}/about-card.html`, `${nv}/about-card.ts`, "web/src/about.ts"];
const original = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
const edit = (f, fn) => writeFileSync(f, fn(readFileSync(f, "utf8")));
const restore = (f) => writeFileSync(f, original.get(f));
const mark = (page) => page.evaluate(() => (window.marker = true));
const marked = (page) => page.evaluate(() => window.marker === true);
const reloads = (page, ms) => page.waitForEvent("load", { timeout: ms }).then(() => true, () => false);
const loads = (page) => reloads(page, 5000);
const staysPut = async (page) => !(await reloads(page, 1500)) && (await marked(page));

try {
  const home = await open("http://localhost:5403/", "hello-card button");
  await home.click("hello-card button");
  await mark(home);
  let load = loads(home);
  edit(`${nv}/hello-card.html`, (s) => s.replace("Hello,", "Hi,"));
  check("dev: a template edit reloads the page", (await load) && !(await marked(home)), await marked(home));
  await home.waitForSelector("hello-card button");
  check("dev: the page shows the new template and the component state starts over", (await text(home, "hello-card")) === "Hi, home clicked 0", await text(home, "hello-card"));

  await mark(home);
  edit(`${nv}/hello-card.html`, (s) => s);
  check("dev: saving a template unchanged does not reload", await staysPut(home), "reloaded");

  edit(`${nv}/about-card.html`, (s) => s.replace("About", "About us"));
  check("dev: editing a template no open page has loaded does not reload", await staysPut(home), "reloaded");
  restore(`${nv}/about-card.html`);
  await staysPut(home);

  const about = await open("http://localhost:5403/about.html", "about-card h1");
  await mark(about);
  load = loads(about);
  edit(`${nv}/hello-card.html`, (s) => s.replace("Hi,", "Hey,"));
  check("dev: a template edit reloads every open page, also one that does not use it", (await load) && !(await marked(about)), await marked(about));
  await about.close();

  await home.waitForSelector("hello-card button");
  await mark(home);
  logged.length = 0;
  edit(`${nv}/hello-card.html`, (s) => `${s}<p data-ref="a"></p><p data-ref="a"></p>\n`);
  check("dev: a template that ts-dom gen rejects does not reload the page", await staysPut(home), "reloaded");
  check("dev: the page keeps the last good version", (await text(home, "hello-card")) === "Hey, home clicked 0", await text(home, "hello-card"));
  check("dev: the codegen error is printed in the terminal with its rule id", logged.some((m) => m.includes("[duplicate-ref]")), logged);
  edit(`${nv}/hello-card.html`, (s) => s.replace('<p data-ref="a"></p><p data-ref="a"></p>\n', ""));
  await staysPut(home);

  logged.length = 0;
  home.errors.length = 0;
  load = loads(home);
  edit(`${nv}/hello-card.html`, (s) => `${s}<p>{{ nope }}</p>\n`);
  check("dev: a template with a name the component lacks still reloads", await load, "no reload");
  await home.waitForSelector("hello-card button");
  check("dev: nothing reports the missing name, neither the terminal nor the page", logged.length === 0 && home.errors.length === 0, [...logged, ...home.errors]);
  load = loads(home);
  restore(`${nv}/hello-card.html`);
  await load;

  await home.waitForSelector("hello-card button");
  await mark(home);
  load = loads(home);
  edit(`${nv}/hello-card.ts`, (s) => s.replace("count + 1", "count + 2"));
  check("dev: a component .ts edit reloads the page", (await load) && !(await marked(home)), await marked(home));
  await home.waitForSelector("hello-card button");
  await home.click("hello-card button");
  check("dev: after the reload the new class runs", (await text(home, "hello-card")) === "Hello, home clicked 2", await text(home, "hello-card"));
  load = loads(home);
  restore(`${nv}/hello-card.ts`);
  await load;
  await home.close();

  edit("web/src/about.ts", (s) => `${s}import.meta.hot?.accept();\n`);
  const aboutAccepting = await open("http://localhost:5403/about.html", "about-card h1");
  await mark(aboutAccepting);
  edit(`${nv}/about-card.ts`, (s) => s.replace('version: "1"', 'version: "2"'));
  check("dev: under a module with import.meta.hot.accept(), a component .ts edit does not reload", await staysPut(aboutAccepting), "reloaded");
  check("dev: and the old class keeps running", (await text(aboutAccepting, "about-card")) === "About Version 1", await text(aboutAccepting, "about-card"));
  await aboutAccepting.close();
} finally {
  for (const f of files) restore(f);
  await browser.close();
  await server.close();
}
check("every edited file is restored", files.every((f) => readFileSync(f, "utf8") === original.get(f)), files);
if (failures.length) process.exit(1);
