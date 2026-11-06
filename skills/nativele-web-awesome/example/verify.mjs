import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { createServer, preview } from "vite";

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

async function run(label, url) {
  const page = await browser.newPage();
  const messages = [];
  const outside = [];
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && !m.text().startsWith("Lit is in dev mode") && messages.push(m.text()));
  page.on("request", (r) => !r.url().startsWith(url) && outside.push(r.url()));
  await page.goto(url);
  await page.waitForSelector("signup-form wa-input");
  await page.evaluate(() => customElements.whenDefined("wa-select"));
  const status = () => page.$eval("signup-form > p", (p) => p.textContent);
  const settled = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 3000 }).then(() => true, () => false);
  const statusIs = (s) => settled((s) => document.querySelector("signup-form > p")?.textContent === s, s);

  const defined = await page.evaluate(() => ["wa-button", "wa-checkbox", "wa-dialog", "wa-input", "wa-option", "wa-select", "wa-tree"].map((t) => !!customElements.get(t)));
  check(`${label}: only the imported components are defined`, defined.join() === "true,true,true,true,true,true,false", defined);
  const bg = await page.$eval("signup-form wa-button[type=submit]", (b) => getComputedStyle(b.shadowRoot.querySelector("[part~=base]")).backgroundColor);
  check(`${label}: the theme styles the components`, bg === "rgb(0, 113, 236)", bg);

  const input = page.locator("signup-form wa-input input");
  await input.pressSequentially("ab");
  check(`${label}: data-on-input on <wa-input> runs and reads the value`, await statusIs("Email: ab"), await status());
  await page.$eval("signup-form wa-input", (el) => el.shadowRoot.querySelector("[part~=clear-button]").click());
  const note = await page.$eval("signup-form > small", (s) => s.textContent);
  check(`${label}: data-on-wa-clear runs, then input with the empty value`, note === "Cleared by wa-clear" && (await status()) === "Email: ", [note, await status()]);

  await page.click("signup-form form wa-select");
  await page.click("signup-form form wa-option[value=pro]");
  check(`${label}: data-on-change on <wa-select> runs`, await statusIs("Plan: pro"), await status());

  await page.click("signup-form wa-button[type=submit]");
  const blocked = !(await settled(() => document.querySelector("signup-form wa-dialog").open));
  check(`${label}: a required <wa-input> blocks the submit`, blocked, blocked);

  await input.fill("a@b.co");
  await page.click("signup-form wa-checkbox");
  await page.click("signup-form wa-button[type=submit]");
  check(`${label}: submit reads every control through FormData and opens the dialog`, await settled(() => document.querySelector("signup-form wa-dialog").open), null);
  const summary = await page.$eval("signup-form wa-dialog > p", (p) => p.textContent);
  check(`${label}: FormData holds the Web Awesome values`, summary === "a@b.co on pro, news: yes", summary);

  await page.waitForTimeout(400);
  const picker = await page.$eval("theme-picker", (tp) => {
    const sel = tp.shadowRoot.querySelector("wa-select");
    const hint = sel.shadowRoot.querySelector("slot[name=hint]").assignedElements({ flatten: true }).map((e) => e.textContent);
    return {
      options: [...sel.querySelectorAll("wa-option")].map((o) => `${o.value}:${o.textContent}`).join(),
      hint: hint.join(),
      stack: getComputedStyle(tp.shadowRoot.querySelector(".wa-stack")).display,
    };
  });
  check(`${label}: data-each fills <wa-option> items`, picker.options === "light:Light,dark:Dark", picker);
  check(`${label}: a slot forwarded with slot="hint" reaches the Web Awesome slot`, picker.hint === "Applies at once", picker);
  check(`${label}: the adopted utilities sheet styles .wa-stack in the shadow root`, picker.stack === "flex", picker);

  await page.$eval("signup-form > p", (p) => {
    globalThis.statusLog = [];
    new MutationObserver(() => globalThis.statusLog.push(p.textContent)).observe(p, { characterData: true, childList: true, subtree: true });
  });
  await page.click("theme-picker wa-select");
  await page.click("theme-picker wa-option[value=dark]");
  check(`${label}: the child component's typed event reaches the parent`, await statusIs("Theme: Dark"), await status());
  await page.waitForTimeout(400);
  const stillOpen = await page.$eval("signup-form wa-dialog", (d) => d.open);
  const seen = await page.evaluate(() => globalThis.statusLog);
  check(`${label}: the select's bubbling wa-hide does not count as the dialog closing`, stillOpen && !seen.includes("Dialog closed"), [stillOpen, seen]);

  await page.click("signup-form wa-dialog > wa-button");
  check(`${label}: wa-hide from the dialog itself runs the handler`, await statusIs("Dialog closed"), await status());

  check(`${label}: no errors or warnings in the console`, messages.length === 0, messages);
  check(`${label}: nothing is requested from another origin`, outside.length === 0, outside);
  await page.close();
}

const dev = await createServer({ server: { port: 5490, strictPort: true }, logLevel: "error" });
await dev.listen();
const built = await preview({ preview: { port: 4490, strictPort: true }, logLevel: "error" });
try {
  await run("dev", "http://localhost:5490/");
  await run("build", "http://localhost:4490/");
} finally {
  await browser.close();
  await dev.close();
  await built.close();
}
if (failures.length) {
  console.log(`${failures.length} failed`);
  process.exit(1);
}
console.log("all checks passed");
