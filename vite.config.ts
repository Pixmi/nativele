import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { configDefaults } from "vitest/config";
import { tsDom } from "./src/lib/vite-plugin.ts";

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
  resolve: { alias: { "@nativele/ts-dom": lib } },
  plugins: [tsDom({ dirs: ["examples", "test", "browser"], a11y: true })],
  lint: {
    ignorePatterns: ["node_modules", "dist", "demo-dist", "**/*.html.ts", "**/ts-dom-tags.ts", ".claude/worktrees"],
    jsPlugins: [{ name: "ts-dom", specifier: "./src/lib/oxlint-plugin.ts" }],
    rules: {
      "ts-dom/unused-markup": "error",
      // ARIA / accessibility checks: off by default, enabled here as warnings; use ignore to turn individual checks off
      "ts-dom/a11y": ["warn", { ignore: [] }],
      // Data-flow suggestions: avoid passing props and events down or up level by level
      "ts-dom/data-flow": ["warn", { ignore: [] }],
      "typescript/no-explicit-any": "error",
    },
    // Tests use refs from outside the class through instances, so the "the component itself must use it" rule does not apply
    overrides: [
      { files: ["test/**", "browser/**"], rules: { "ts-dom/unused-markup": "off", "ts-dom/a11y": "off", "ts-dom/data-flow": "off" } },
      // These type tests write any on purpose, to check how the library treats it
      { files: ["test/any-types.ts", "test/any-contract-types.ts"], rules: { "typescript/no-explicit-any": "off" } },
    ],
  },
  // The Skill examples are separate projects with their own tests, run by their `npm run verify`; agent worktrees are copies of this repository.
  test: { environment: "happy-dom", exclude: [...configDefaults.exclude, "skills/**", ".claude/worktrees/**"] },
});
