import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { tsDom } from "@nativele/ts-dom/vite";

const chrome = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";

export default defineConfig({
  plugins: [tsDom({ dirs: ["src"] })],
  server: { port: 5481, strictPort: true },
  preview: { port: 4481, strictPort: true },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts"], exclude: ["src/**/*.browser.test.ts"], environment: "happy-dom" },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          api: { port: 63481, strictPort: true },
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
