import { defineConfig } from "@playwright/test";

const chrome = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:4481",
    launchOptions: { executablePath: chrome, args: ["--no-sandbox", "--no-zygote", "--disable-gpu", "--disable-dev-shm-usage"] },
  },
  webServer: { command: "npx vite preview", url: "http://localhost:4481" },
});
