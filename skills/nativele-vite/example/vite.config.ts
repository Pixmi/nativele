import { resolve } from "node:path";
import { defineConfig } from "vite";
import { tsDom } from "@nativele/ts-dom/vite";

const page = (file: string) => resolve(import.meta.dirname, "web", file);

export default defineConfig({
  root: "web",
  plugins: [tsDom({ dirs: ["src/nv"] })],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rolldownOptions: { input: { main: page("index.html"), about: page("about.html") } },
  },
});
