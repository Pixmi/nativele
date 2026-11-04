import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { nativel } from "./src/lib/vite-plugin.ts";

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
  resolve: { alias: { "nativel": lib } },
  plugins: [nativel({ dirs: ["examples", "test", "browser"], a11y: true })],
  lint: {
    ignorePatterns: ["node_modules", "dist", "demo-dist", "**/*.html.ts", "**/nativel-tags.ts"],
    jsPlugins: [{ name: "nativel", specifier: "./src/lib/oxlint-plugin.ts" }],
    rules: {
      "nativel/unused-markup": "error",
      // ARIA / accessibility checks: off by default, enabled here as warnings; use ignore to turn individual checks off
      "nativel/a11y": ["warn", { ignore: [] }],
      // Data-flow suggestions: avoid passing props and events down or up level by level
      "nativel/data-flow": ["warn", { ignore: [] }],
    },
    // Tests use refs from outside the class through instances, so the "the component itself must use it" rule does not apply
    overrides: [{ files: ["test/**", "browser/**"], rules: { "nativel/unused-markup": "off", "nativel/a11y": "off", "nativel/data-flow": "off" } }],
  },
  test: { environment: "happy-dom" },
});
