import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { chromium, firefox, webkit } from "playwright-core";
import type { Browser, Page } from "playwright-core";

const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer().once("error", reject);
    probe.listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

/** Start `vp dev` and return its URL once it accepts connections. Port 0 picks a free port. */
export async function startServer(requested: number): Promise<{ url: string; stop: () => void }> {
  const port = requested || (await freePort());
  const child: ChildProcess = spawn("npx", ["vp", "dev", "--port", String(port), "--strictPort"], {
    stdio: ["ignore", "ignore", "ignore"],
    detached: true, // its own process group: npx starts vp dev underneath, so the whole group must be stopped together
  });
  const kill = () => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already finished */
    }
  };
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: kill };
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  kill();
  throw new Error("vp dev did not start in time");
}

export type BrowserName = "chromium" | "firefox" | "webkit";
export const browserName = (process.env.BROWSER ?? "chromium") as BrowserName;

/**
 * Launch the browser chosen by the BROWSER environment variable (chromium, firefox or webkit; default chromium).
 * chromium prefers the system Chrome (CHROME_BIN or /usr/bin/google-chrome) and falls back to Playwright's download;
 * firefox / webkit use Playwright's download (`npx playwright-core install firefox webkit`).
 */
export function launchChrome(): Promise<Browser> {
  if (browserName === "firefox") return firefox.launch({ headless: true });
  if (browserName === "webkit") return webkit.launch({ headless: true });
  return chromium.launch({
    ...(existsSync(CHROME) ? { executablePath: CHROME } : {}),
    headless: true,
    // WSL or sandboxed environments: point HOME at a writable place and pass --no-zygote, otherwise crashpad fails to write and Chrome crashes
    args: ["--no-sandbox", "--no-zygote", "--disable-gpu", "--disable-dev-shm-usage", "--disable-crash-reporter"],
    env: { ...process.env, HOME: process.env.TSDOM_CHROME_HOME ?? "/tmp/chome" } as Record<string, string>,
  });
}

/**
 * Start a dev server and a browser, open `path`, and wait until `ready` (a selector or a function run in the page) holds.
 * `before` runs on the new page before it navigates (routes, listeners; it gets the `errors` list); `errors` collects the page errors unless `collectErrors` is false.
 */
export async function openPage({
  path,
  ready,
  collectErrors = true,
  before,
}: {
  path: string;
  ready?: string | (() => unknown);
  collectErrors?: boolean;
  before?: (page: Page, errors: string[]) => Promise<void> | void;
}): Promise<{
  page: Page;
  browser: Browser;
  url: string;
  errors: string[];
  close: () => Promise<void>;
}> {
  const server = await startServer(0);
  let browser: Browser | undefined;
  const close = async () => {
    await browser?.close();
    server.stop();
  };
  try {
    browser = await launchChrome();
    const page = await browser.newPage();
    const errors: string[] = [];
    if (collectErrors) page.on("pageerror", (e) => errors.push(e.message));
    await before?.(page, errors);
    await page.goto(`${server.url}${path}`);
    if (typeof ready === "string") await page.waitForSelector(ready);
    else if (ready) await page.waitForFunction(ready);
    return { page, browser, url: server.url, errors, close };
  } catch (e) {
    await close();
    throw e;
  }
}
