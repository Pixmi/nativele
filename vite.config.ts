import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { nativele } from "./src/lib/vite-plugin.ts";

const lib = fileURLToPath(new URL("./src/lib/index.ts", import.meta.url));

export default defineConfig({
  pack: {
    entry: {
      index: "src/lib/index.ts",
      "vite-plugin": "src/lib/vite-plugin.ts",
      "oxlint-plugin": "src/lib/oxlint-plugin.ts",
      cli: "src/cli.ts",
    },
    format: "esm",
    platform: "node",
    dts: true,
    clean: true,
  },
  build: { outDir: "demo-dist" },
  resolve: { alias: { "nativele": lib } },
  plugins: [nativele({ dirs: ["examples", "test", "browser"], a11y: true })],
  lint: {
    ignorePatterns: ["node_modules", "dist", "demo-dist", "**/*.html.ts", "**/nativele-tags.ts"],
    jsPlugins: [{ name: "nativele", specifier: "./src/lib/oxlint-plugin.ts" }],
    rules: {
      "nativele/unused-markup": "error",
      // ARIA / accessibility checks: off by default, enabled here as warnings; use ignore to turn individual checks off
      "nativele/a11y": ["warn", { ignore: [] }],
      // Data-flow suggestions: avoid passing props and events down or up level by level
      "nativele/data-flow": ["warn", { ignore: [] }],
    },
    // Tests use refs from outside the class through instances, so the "the component itself must use it" rule does not apply
    overrides: [{ files: ["test/**", "browser/**"], rules: { "nativele/unused-markup": "off", "nativele/a11y": "off", "nativele/data-flow": "off" } }],
  },
  test: { environment: "happy-dom" },
});
