import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { tsDom } from "@nativele/ts-dom/vite";

const chrome = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";
const unit = { include: ["test/**/*.test.ts"], exclude: ["test/**/*.browser.test.ts"] };

export default defineConfig({
  plugins: [tsDom({ dirs: ["src/nv"] })],
  test: {
    projects: [
      { extends: true, test: { name: "unit", ...unit, environment: "happy-dom" } },
      { extends: true, test: { name: "jsdom", ...unit, environment: "jsdom" } },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["test/**/*.browser.test.ts"],
          api: { port: 63432, strictPort: true },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { executablePath: chrome, args: ["--no-sandbox", "--no-zygote", "--disable-gpu", "--disable-dev-shm-usage"] } }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
