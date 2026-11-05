import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { tsDom } from "@nativele/ts-dom/vite";

export default defineConfig({
  plugins: [tsDom({ dirs: ["src/nv"] }), preact()],
});
