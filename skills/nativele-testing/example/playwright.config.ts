import { defineConfig } from "@playwright/test";

const chrome = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:4432",
    launchOptions: { executablePath: chrome, args: ["--no-sandbox", "--no-zygote", "--disable-gpu", "--disable-dev-shm-usage"] },
  },
  webServer: { command: "npm run build && npx vite preview --port 4432 --strictPort", url: "http://localhost:4432" },
});
