import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright-core";
import type { Browser } from "playwright-core";

const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";

/** Start `vp dev` and return its URL once it accepts connections. */
export async function startServer(port: number): Promise<{ url: string; stop: () => void }> {
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
    env: { ...process.env, HOME: process.env.NATIVELE_CHROME_HOME ?? "/tmp/chome" } as Record<string, string>,
  });
}
