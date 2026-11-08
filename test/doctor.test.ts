import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runDoctor } from "../src/lib/doctor.ts";

const project = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "nativele-doctor-"));
  mkdirSync(join(dir, "src"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
};
const rules = (cwd: string) => runDoctor({ dirs: ["src"], cwd }).map((i) => i.rule).sort();

describe("ts-dom doctor", () => {
  it("a project without tsconfig and runtime package", () => {
    expect(rules(project({ "src/x.html": "<p></p>" }))).toEqual(["no-tsconfig", "runtime-not-installed"]);
  });

  it("tsconfig problems, read through extends and comments", () => {
    const cwd = project({
      "base.json": `{ "compilerOptions": { "strict": false, /* old */ "lib": ["ES2022"], } }`,
      "tsconfig.json": `{ "extends": "./base.json", "compilerOptions": { "moduleResolution": "classic", "paths": { "@nativele/ts-dom": ["x"] } }, "include": ["other"] }`,
      "src/x.html": "<p></p>",
      "src/x.html.ts": "",
    });
    expect(rules(cwd).filter((r) => r.startsWith("tsconfig"))).toEqual(["tsconfig-classic-resolution", "tsconfig-misses-templates", "tsconfig-no-dom-lib", "tsconfig-not-strict"]);
  });

  it("a template imported without .js, with its line", () => {
    const cwd = project({
      "tsconfig.json": `{ "compilerOptions": { "strict": true, "paths": { "@nativele/ts-dom": ["x"] } } }`,
      "src/a.ts": `import x from "./a.js";\nimport tpl from "./card.html";\n`,
    });
    const issue = runDoctor({ dirs: ["src"], cwd }).find((i) => i.rule === "template-import-without-js");
    expect(issue).toMatchObject({ file: "src/a.ts", line: 2 });
    expect(issue?.message).toContain("lint does not treat it as a Nativele template");
  });

  it("Vite, oxlint and formatter configuration", () => {
    const base = { "tsconfig.json": `{ "compilerOptions": { "strict": true, "paths": { "@nativele/ts-dom": ["x"] } } }`, "src/x.html": "<p></p>" };
    const missing = project({ ...base, "vite.config.ts": `export default { plugins: [], lint: {} }`, "package.json": `{ "scripts": { "fmt": "oxfmt ." } }` });
    expect(rules(missing)).toEqual(["formatter-whitespace", "oxlint-plugin-missing", "vite-plugin-missing"]);
    const fine = project({
      ...base,
      "vite.config.ts": `import { tsDom } from "@nativele/ts-dom/vite";\nexport default { plugins: [tsDom({ whitespace: "collapse" })], lint: { jsPlugins: [{ name: "ts-dom", specifier: "@nativele/ts-dom/oxlint" }] } }`,
      "package.json": `{ "scripts": { "fmt": "oxfmt ." } }`,
    });
    expect(rules(fine)).toEqual([]);
  });
});

describe("ts-dom doctor: tsconfig extends and include", () => {
  const strictPaths = `"strict": true, "paths": { "@nativele/ts-dom": ["x"] }`;
  it("follows package and array extends", () => {
    const cwd = project({
      "a.json": `{ "compilerOptions": { "lib": ["ES2022", "DOM"] } }`,
      "tsconfig.json": `{ "extends": ["@cfg/strict/tsconfig.json", "./a.json"], "compilerOptions": { "paths": { "@nativele/ts-dom": ["x"] } } }`,
      "src/x.html": "<p></p>",
    });
    mkdirSync(join(cwd, "node_modules/@cfg/strict"), { recursive: true });
    writeFileSync(join(cwd, "node_modules/@cfg/strict/package.json"), `{ "name": "@cfg/strict" }`);
    writeFileSync(join(cwd, "node_modules/@cfg/strict/tsconfig.json"), `{ "compilerOptions": { "strict": true } }`);
    expect(rules(cwd).filter((r) => r.startsWith("tsconfig"))).toEqual([]);
  });

  it("an include inherited from a base in another folder is read from that folder", () => {
    const cwd = project({ "tsconfig.json": `{ "extends": "./configs/base.json", "compilerOptions": { ${strictPaths} } }`, "src/x.html": "<p></p>" });
    mkdirSync(join(cwd, "configs"));
    writeFileSync(join(cwd, "configs/base.json"), `{ "include": ["../src"] }`);
    expect(rules(cwd)).not.toContain("tsconfig-misses-templates");
  });

  it("checks the folders that hold templates, also when the scanned dir is the project root", () => {
    const cwd = project({ "tsconfig.json": `{ "compilerOptions": { ${strictPaths} }, "include": ["src/*.ts"] }`, "src/top.html": "<p></p>" });
    mkdirSync(join(cwd, "src/deep"));
    writeFileSync(join(cwd, "src/deep/x.html"), "<p></p>");
    const issues = runDoctor({ dirs: ["."], cwd }).filter((i) => i.rule === "tsconfig-misses-templates");
    expect(issues.map((i) => i.message)).toEqual([expect.stringContaining("src/deep")]);
    const fine = project({ "tsconfig.json": `{ "compilerOptions": { ${strictPaths} }, "include": ["src"] }`, "src/x.html": "<p></p>" });
    expect(runDoctor({ dirs: ["."], cwd: fine }).map((i) => i.rule)).not.toContain("tsconfig-misses-templates");
  });

  it("a package whose name only contains prettier is not a formatter set-up", () => {
    const cwd = project({
      "tsconfig.json": `{ "compilerOptions": { ${strictPaths} } }`,
      "src/x.html": "<p></p>",
      "package.json": `{ "devDependencies": { "eslint-config-prettier": "1" } }`,
    });
    expect(rules(cwd)).not.toContain("formatter-whitespace");
  });
});

describe("ts-dom doctor output", () => {
  it("every issue has a file, line and column, also when it is about the project as a whole", () => {
    expect(runDoctor({ dirs: ["src"], cwd: project({ "src/x.html": "<p></p>" }) }).map((i) => [i.file, i.line, i.col])).toEqual([
      [".", 1, 1],
      [".", 1, 1],
    ]);
  });
});

describe("ts-dom doctor: pages, solution configs and missing folders", () => {
  const strictPaths = `"strict": true, "paths": { "@nativele/ts-dom": ["x"] }`;
  it("a page entry and built files are not templates", () => {
    const cwd = project({ "tsconfig.json": `{ "compilerOptions": { ${strictPaths} }, "include": ["src"] }`, "index.html": "<!doctype html><html><body></body></html>", "src/x.html": "<p></p>" });
    mkdirSync(join(cwd, "dist"));
    writeFileSync(join(cwd, "dist/page.html"), "<p></p>");
    expect(runDoctor({ dirs: ["."], cwd }).map((i) => i.rule)).not.toContain("tsconfig-misses-templates");
  });

  it("a solution-style tsconfig is checked through its references", () => {
    const cwd = project({
      "tsconfig.json": `{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }`,
      "tsconfig.app.json": `{ "compilerOptions": { "strict": false, "paths": { "@nativele/ts-dom": ["x"] } }, "include": ["src"] }`,
      "src/x.html": "<p></p>",
    });
    const issues = runDoctor({ dirs: ["src"], cwd });
    expect(issues.filter((i) => i.rule === "tsconfig-not-strict").map((i) => i.file)).toEqual(["tsconfig.app.json"]);
    expect(issues.map((i) => i.rule)).not.toContain("tsconfig-misses-templates");
  });

  it("a referenced config that covers no component folder is not checked", () => {
    const cwd = project({
      "tsconfig.json": `{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }`,
      "tsconfig.app.json": `{ "compilerOptions": { ${strictPaths}, "lib": ["ES2023", "DOM"] }, "include": ["src"] }`,
      "tsconfig.node.json": `{ "compilerOptions": { "lib": ["ES2023"] }, "include": ["vite.config.ts"] }`,
      "vite.config.ts": "",
      "src/x.html": "<p></p>",
    });
    const rules = runDoctor({ dirs: ["src"], cwd }).map((i) => i.rule);
    expect(rules).not.toContain("tsconfig-no-dom-lib");
    expect(rules).not.toContain("tsconfig-not-strict");
  });

  it("a referenced config whose files cover no component folder is not checked", () => {
    const cwd = project({
      "tsconfig.json": `{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }`,
      "tsconfig.app.json": `{ "compilerOptions": { ${strictPaths}, "lib": ["ES2023", "DOM"] }, "include": ["src"] }`,
      "tsconfig.node.json": `{ "compilerOptions": { "lib": ["ES2023"] }, "files": ["vite.config.ts"] }`,
      "vite.config.ts": "",
      "src/x.html": "<p></p>",
    });
    const rules = runDoctor({ dirs: ["src"], cwd }).map((i) => i.rule);
    expect(rules).not.toContain("tsconfig-no-dom-lib");
    expect(rules).not.toContain("tsconfig-not-strict");
    expect(rules).not.toContain("tsconfig-misses-templates");
  });

  it("a folder that does not exist is reported", () => {
    const cwd = project({ "tsconfig.json": `{ "compilerOptions": { ${strictPaths} } }` });
    expect(runDoctor({ dirs: ["app"], cwd }).map((i) => i.rule)).toContain("dir-not-found");
  });
});

describe("ts-dom doctor: a Vitest config without the plugin", () => {
  const base = {
    "tsconfig.json": `{ "compilerOptions": { "strict": true, "paths": { "@nativele/ts-dom": ["x"] } } }`,
    "src/x.html": "<p></p>",
    "vite.config.ts": `import { tsDom } from "@nativele/ts-dom/vite";\nexport default { plugins: [tsDom()] };`,
  };
  const missing = (cwd: string) => runDoctor({ dirs: ["src"], cwd }).filter((i) => i.rule === "vite-plugin-missing");

  it("is reported when it neither uses tsDom nor merges ./vite.config", () => {
    const issues = missing(project({ ...base, "vitest.config.ts": `import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { environment: "happy-dom" } });` }));
    expect(issues).toMatchObject([{ severity: "warning", file: "vitest.config.ts" }]);
    expect(issues[0]?.message).toMatch(/replaces the Vite config for Vitest.* Fix: add tsDom\(\) to its plugins, or merge the Vite config/);
  });

  it("is fine when it uses tsDom or merges ./vite.config", () => {
    expect(missing(project({ ...base, "vitest.config.mts": `import { tsDom } from "@nativele/ts-dom/vite";\nexport default { plugins: [tsDom()], test: {} };` }))).toEqual([]);
    expect(missing(project({ ...base, "vitest.config.ts": `import { defineConfig, mergeConfig } from "vitest/config";\nimport viteConfig from "./vite.config";\nexport default mergeConfig(viteConfig, defineConfig({ test: {} }));` }))).toEqual([]);
    expect(missing(project(base))).toEqual([]);
  });
});

describe("ts-dom doctor: whitespace asked for and whitespace on disk", () => {
  const base = { "tsconfig.json": `{ "compilerOptions": { "strict": true, "paths": { "@nativele/ts-dom": ["x"] } } }`, "src/x.html": "<p>\n  hi\n</p>" };
  const whitespace = (cwd: string) => runDoctor({ dirs: ["src"], cwd }).filter((i) => i.rule === "formatter-whitespace");

  it("a script asks for collapse while the generated files were written with preserve", async () => {
    const { generateAll } = await import("../src/lib/codegen.ts");
    const cwd = project({ ...base, "package.json": JSON.stringify({ scripts: { gen: "ts-dom gen src --whitespace=collapse" } }) });
    generateAll(join(cwd, "src"));
    const [issue, ...rest] = whitespace(cwd);
    expect(rest).toEqual([]);
    expect(issue).toMatchObject({ severity: "warning", file: "src/x.html.ts" });
    expect(issue?.message).toMatch(/^The script "gen" asks for whitespace "collapse", but this generated file was written with "preserve".* Fix: regenerate with the flag once: npm run gen\.$/);
    generateAll(join(cwd, "src"), { whitespace: "collapse" });
    expect(whitespace(cwd)).toEqual([]);
  });

  it("the Vite config asks for collapse while the generated files were written with preserve", async () => {
    const { generateAll } = await import("../src/lib/codegen.ts");
    const cwd = project({ ...base, "vite.config.ts": `import { tsDom } from "@nativele/ts-dom/vite";\nexport default { plugins: [tsDom({ whitespace: "collapse" })] };` });
    generateAll(join(cwd, "src"));
    expect(whitespace(cwd).map((i) => i.message)).toEqual([expect.stringMatching(/^The Vite config asks .* Fix: regenerate with the flag once: ts-dom gen src --whitespace=collapse\.$/)]);
  });
});

describe("ts-dom doctor: another framework's templates in a scanned folder", () => {
  it("an .html named as an Angular templateUrl is reported once, as an error at the template", () => {
    const cwd = project({ "tsconfig.json": `{ "compilerOptions": { "strict": true, "paths": { "@nativele/ts-dom": ["x"] } } }`, "src/app.html": "<p>{{ user.name }}</p>", "src/card.html": "<p>{{ name }}</p>" });
    writeFileSync(join(cwd, "src/app.ts"), `@Component({ selector: "app-root", templateUrl: './app.html' })\nexport class App {}\n`);
    writeFileSync(join(cwd, "src/other.ts"), `@Component({ templateUrl: "./app.html" })\nexport class Other {}\n`);
    const issues = runDoctor({ dirs: ["src"], cwd }).filter((i) => i.rule === "framework-template");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "error", file: "src/app.html" });
    expect(issues[0]?.message).toMatch(/Angular template of src\/(app|other)\.ts.* Fix: scan only the folder with the Nativele templates/);
  });

  it("the invalid-hole and no-importer hints mention a folder that is not meant to be scanned", async () => {
    const { analyze } = await import("../src/lib/codegen.ts");
    const { lintUsage } = await import("../src/lib/lint.ts");
    expect(analyze("<p>{{ user.name }}</p>").diagnostics[0]?.message).toContain("this folder is not meant to be scanned");
    const cwd = project({ "src/lone.html": "<p></p>" });
    const lone = lintUsage([join(cwd, "src")], []).find((i) => i.rule === "no-importer");
    expect(lone?.message).toContain("this folder is not meant to be scanned");
  });
});

describe("ts-dom doctor: a type check that runs before gen", () => {
  const base = { "tsconfig.json": `{ "compilerOptions": { "strict": true, "paths": { "@nativele/ts-dom": ["x"] } }, "include": ["src"] }`, "src/x.html": "<p></p>", ".gitignore": "node_modules\n*.html.ts\n" };
  const scripts = (s: Record<string, string>, extra: Record<string, string> = {}) => project({ ...base, ...extra, "package.json": JSON.stringify({ scripts: s }, null, 2) });
  const flagged = (cwd: string) => runDoctor({ dirs: ["src"], cwd }).filter((i) => i.rule === "typecheck-before-gen");

  it("reports tsc, vue-tsc, svelte-check and ng build in a script, or its pre script, before ts-dom gen", () => {
    const cwd = scripts({ build: "tsc && vite build", dev: "vite", typecheck: "vue-tsc --noEmit", check: "svelte-check", "build:ng": "ng build", pretest: "tsc --noEmit", test: "vitest" });
    const issues = flagged(cwd);
    expect(issues.map((i) => i.message.match(/script "([^"]+)"/)?.[1]).sort()).toEqual(["build", "build:ng", "check", "test", "typecheck"]);
    expect(issues.find((i) => i.message.includes('"build"'))).toMatchObject({ severity: "warning", file: "package.json", line: 3 });
    expect(issues[0]?.message).toMatch(/TS2307.* Fix: put "ts-dom gen src && " in front of it, or use "ts-dom check src"/);
  });

  it("a gen first in the chain, through npm run or a pre script, or ts-dom check, is fine", () => {
    const cwd = scripts({ gen: "ts-dom gen src", build: "npm run gen && tsc && vite build", pretypecheck: "npx ts-dom gen src", typecheck: "tsc --noEmit", check: "ts-dom check src" });
    expect(flagged(cwd)).toEqual([]);
  });

  it("is quiet when *.html.ts is committed, or when tsc -p names a config that covers no scanned folder", () => {
    expect(flagged(scripts({ build: "tsc" }, { ".gitignore": "node_modules\n" }))).toEqual([]);
    const node = scripts({ build: "tsc -p tsconfig.node.json && ts-dom gen src && tsc" }, { "tsconfig.node.json": `{ "include": ["vite.config.ts"] }` });
    expect(flagged(node)).toEqual([]);
    const app = scripts({ build: "tsc -p tsconfig.app.json && vite build" }, { "tsconfig.app.json": `{ "include": ["src"] }` });
    expect(flagged(app)).toHaveLength(1);
  });
});

const tree = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "nativele-doctor-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
};
const withTypeScript = (version: string) => ({ "node_modules/typescript/package.json": JSON.stringify({ name: "typescript", version }) });
const issuesOf = (cwd: string, rule: string, extra: { project?: string } = {}) => runDoctor({ dirs: ["src"], cwd, ...extra }).filter((i) => i.rule === rule);
const paths = `"paths": { "@nativele/ts-dom": ["x"] }`;

describe("ts-dom doctor: what the installed TypeScript does by default", () => {
  const config = (options: string) => ({ "tsconfig.json": `{ "compilerOptions": { ${paths}${options} } }`, "src/x.html": "<p></p>" });

  it("strict left out is a warning on TypeScript 5 and when the version cannot be determined; strict false is one on every version", () => {
    expect(issuesOf(tree({ ...config(""), ...withTypeScript("6.0.3") }), "tsconfig-not-strict")).toEqual([]);
    expect(issuesOf(tree({ ...config(""), ...withTypeScript("7.0.2") }), "tsconfig-not-strict")).toEqual([]);
    const [five] = issuesOf(tree({ ...config(""), ...withTypeScript("5.9.3") }), "tsconfig-not-strict");
    expect(five?.message).toMatch(/^compilerOptions\.strict is not set, and TypeScript 5\.9\.3 leaves it off by default .* Fix: set "strict": true\.$/);
    const [unknown] = issuesOf(tree(config("")), "tsconfig-not-strict");
    expect(unknown).toMatchObject({ severity: "warning", file: "tsconfig.json" });
    expect(unknown?.message).toMatch(/^compilerOptions\.strict is not set, and the TypeScript version could not be determined .*TypeScript 5 leaves strict off by default.* Fix: set "strict": true\.$/);
    const [off] = issuesOf(tree({ ...config(`, "strict": false`), ...withTypeScript("7.0.2") }), "tsconfig-not-strict");
    expect(off?.message).toMatch(/^compilerOptions\.strict is false, so tsc does not report values that may be null .*implicitly any/);
    expect(off?.message).not.toContain("wrong names");
  });

  it("moduleResolution classic: what fails depends on the version", () => {
    const classic = `, "strict": true, "moduleResolution": "classic"`;
    expect(issuesOf(tree({ ...config(classic), ...withTypeScript("5.9.3") }), "tsconfig-classic-resolution")[0]?.message).toMatch(/cannot resolve the package "@nativele\/ts-dom" that every generated file imports \(TS2792/);
    expect(issuesOf(tree({ ...config(classic), ...withTypeScript("6.0.3") }), "tsconfig-classic-resolution")[0]?.message).toContain("TS5107");
    expect(issuesOf(tree({ ...config(classic), ...withTypeScript("7.0.2") }), "tsconfig-classic-resolution")[0]?.message).toContain("TS5108");
    expect(issuesOf(tree(config(classic)), "tsconfig-classic-resolution")[0]?.message).not.toContain("./x.html.js");
  });

  it("module ESNext without moduleResolution resolves the classic way on TypeScript 5 only", () => {
    const esnext = `, "strict": true, "module": "ESNext"`;
    const [five] = issuesOf(tree({ ...config(esnext), ...withTypeScript("5.9.3") }), "tsconfig-classic-resolution");
    expect(five).toMatchObject({ severity: "error", file: "tsconfig.json" });
    expect(five?.message).toMatch(/^"module": "ESNext" without "moduleResolution" makes TypeScript 5\.9\.3 resolve modules the classic way.* Fix: add "moduleResolution": "bundler"/);
    expect(issuesOf(tree({ ...config(`, "strict": true, "target": "ES2022"`), ...withTypeScript("5.9.3") }), "tsconfig-classic-resolution")).toHaveLength(1);
    expect(issuesOf(tree({ ...config(`, "strict": true, "module": "CommonJS"`), ...withTypeScript("5.9.3") }), "tsconfig-classic-resolution")).toEqual([]);
    expect(issuesOf(tree({ ...config(`${esnext}, "moduleResolution": "bundler"`), ...withTypeScript("5.9.3") }), "tsconfig-classic-resolution")).toEqual([]);
    expect(issuesOf(tree({ ...config(esnext), ...withTypeScript("6.0.3") }), "tsconfig-classic-resolution")).toEqual([]);
  });
});

describe("ts-dom doctor: ts-dom-tags.ts left out of the program", () => {
  const files = (tsconfig: string) => ({
    "tsconfig.json": tsconfig,
    "src/card.html": "<p></p>",
    "src/card.ts": `import tpl from "./card.html.js";\nexport class Card extends Component(tpl) {}\ndefine("x-card", Card);\n`,
  });
  const options = `"compilerOptions": { "strict": true, ${paths} }`;

  it("an exclude that matches it, or an include that matches only .tsx, is an error", () => {
    const [excluded] = issuesOf(tree(files(`{ ${options}, "include": ["src"], "exclude": ["**/ts-dom-tags.ts"] }`)), "tsconfig-misses-tag-map");
    expect(excluded).toMatchObject({ severity: "error", file: "tsconfig.json" });
    expect(excluded?.message).toMatch(/^The exclude pattern "\*\*\/ts-dom-tags\.ts" in tsconfig\.json removes src\/ts-dom-tags\.ts .*<x-card>.* Fix: .*add "src\/ts-dom-tags\.ts" to files/);
    const [tsx] = issuesOf(tree(files(`{ ${options}, "include": ["src/**/*.tsx"] }`)), "tsconfig-misses-tag-map");
    expect(tsx?.message).toMatch(/^The include of tsconfig\.json does not match src\/ts-dom-tags\.ts.* Fix: add "src\/ts-dom-tags\.ts" to include\.$/);
    expect(issuesOf(tree(files(`{ ${options}, "include": ["src"], "exclude": ["src/gen"] }`)), "tsconfig-misses-tag-map")).toEqual([]);
  });

  it("the generated x.html.ts can be excluded, as their components import them; files keeps an excluded tag map in", () => {
    expect(issuesOf(tree(files(`{ ${options}, "include": ["src"], "exclude": ["**/*.html.ts"] }`)), "tsconfig-misses-tag-map")).toEqual([]);
    expect(issuesOf(tree(files(`{ ${options}, "include": ["src/**/*.tsx"], "files": ["src/ts-dom-tags.ts"] }`)), "tsconfig-misses-tag-map")).toEqual([]);
    expect(issuesOf(tree(files(`{ ${options} }`)), "tsconfig-misses-tag-map")).toEqual([]);
  });

  it("an exclude inherited through extends counts", () => {
    const cwd = tree({ ...files(`{ "extends": "./configs/base.json", ${options} }`), "configs/base.json": `{ "include": ["../src"], "exclude": ["../src/ts-dom-tags.ts"] }` });
    expect(issuesOf(cwd, "tsconfig-misses-tag-map")).toHaveLength(1);
  });

  it("a file that imports or re-exports it brings it into the program", () => {
    const leftOut = files(`{ ${options}, "include": ["src"], "exclude": ["**/ts-dom-tags.ts"] }`);
    for (const line of [`export type {} from "./ts-dom-tags.js";`, `import type {} from "./ts-dom-tags.js";`, `import "./ts-dom-tags.js";`, `/// <reference path="./ts-dom-tags.ts" />`]) {
      expect(issuesOf(tree({ ...leftOut, "src/index.ts": `${line}\nexport { Card } from "./card.js";\n` }), "tsconfig-misses-tag-map"), line).toEqual([]);
    }
    expect(issuesOf(tree({ ...leftOut, "lib/index.ts": `export type {} from "../src/ts-dom-tags.js";\n`, "tsconfig.json": `{ ${options}, "include": ["src", "lib"], "exclude": ["**/ts-dom-tags.ts"] }` }), "tsconfig-misses-tag-map")).toEqual([]);
    expect(issuesOf(tree({ ...leftOut, "src/index.ts": `export type {} from "./other/ts-dom-tags.js";\n` }), "tsconfig-misses-tag-map")).toHaveLength(1);
  });

  it("include and files are each inherited from the base that sets them, as tsc does", () => {
    const bases = (include: string) => ({ "configs/a.json": `{ "include": ["${include}"] }`, "configs/b.json": `{ "files": ["../src/main.ts"] }`, "src/main.ts": "export {};\n" });
    const both = files(`{ "extends": ["./configs/a.json", "./configs/b.json"], ${options} }`);
    const covered = tree({ ...both, ...bases("../src") });
    expect(issuesOf(covered, "tsconfig-misses-templates")).toEqual([]);
    expect(issuesOf(covered, "tsconfig-misses-tag-map")).toEqual([]);
    expect(issuesOf(tree({ ...both, ...bases("../src/**/*.tsx") }), "tsconfig-misses-tag-map")).toHaveLength(1);
  });
});

describe("ts-dom doctor: configuration files in their other formats", () => {
  const base = { "tsconfig.json": `{ "compilerOptions": { "strict": true, ${paths} } }`, "src/x.html": "<p></p>" };

  it("an .oxlintrc.jsonc without the plugin", () => {
    expect(issuesOf(tree({ ...base, ".oxlintrc.jsonc": `{ // comment\n "rules": {} }` }), "oxlint-plugin-missing")).toMatchObject([{ file: ".oxlintrc.jsonc" }]);
  });

  it("Prettier and oxfmt configured through any of their config files or the package.json key", () => {
    const extras: Record<string, string>[] = [
      { ".prettierrc.yaml": "semi: false\n" },
      { ".prettierrc.yml": "semi: false\n" },
      { ".prettierrc.json5": "{}" },
      { ".prettierrc.toml": "semi = false\n" },
      { ".prettierrc.mjs": "export default {};\n" },
      { "prettier.config.ts": "export default {};\n" },
      { "package.json": JSON.stringify({ prettier: { semi: false } }) },
      { "oxfmt.config.ts": "export default {};\n" },
    ];
    for (const extra of extras) {
      expect(issuesOf(tree({ ...base, ...extra }), "formatter-whitespace"), Object.keys(extra)[0]).toHaveLength(1);
    }
  });
});

describe("ts-dom doctor in a package of a workspace", () => {
  const pkg = "packages/app";
  const app = {
    [`${pkg}/package.json`]: JSON.stringify({ scripts: { build: "tsc" }, dependencies: { "@nativele/ts-dom": "0.5.0" } }, null, 2),
    [`${pkg}/tsconfig.json`]: `{ "compilerOptions": { "strict": true, ${paths} }, "include": ["src"] }`,
    [`${pkg}/src/x.html`]: "<p></p>",
  };

  it("reads the .gitignore and the Skill copies of the folders up to the workspace root", () => {
    const markers: Record<string, string>[] = [{ "package.json": JSON.stringify({ workspaces: ["packages/*"] }) }, { "pnpm-workspace.yaml": "packages:\n  - packages/*\n" }, { ".git/HEAD": "ref: refs/heads/main\n" }];
    for (const marker of markers) {
      const root = tree({ ...app, ...marker, ".gitignore": "node_modules\n*.html.ts\n", ".claude/skills/nativele-core/SKILL.md": "an older copy" });
      const issues = runDoctor({ dirs: ["src"], cwd: join(root, pkg) });
      const name = Object.keys(marker)[0];
      expect(issues.filter((i) => i.rule === "typecheck-before-gen"), name).toHaveLength(1);
      expect(issues.filter((i) => i.rule === "skill-outdated").map((i) => i.file), name).toEqual(["../../.claude/skills/nativele-core/SKILL.md"]);
    }
  });

  it("finds the formatter and the oxlint config set up at the workspace root, nearest first", () => {
    const marker = { "package.json": JSON.stringify({ workspaces: ["packages/*"] }) };
    const inPackage = (root: Record<string, string>, rule: string) => runDoctor({ dirs: ["src"], cwd: join(tree({ ...app, ...marker, ...root }), pkg) }).filter((i) => i.rule === rule);
    const formatter = (root: Record<string, string>) => inPackage(root, "formatter-whitespace");
    expect(formatter({ ".prettierrc.json": "{}" })).toMatchObject([{ file: "../../.prettierrc.json" }]);
    expect(formatter({ "oxfmt.config.ts": "export default {};\n" })).toMatchObject([{ file: "../../oxfmt.config.ts" }]);
    expect(formatter({ "package.json": JSON.stringify({ workspaces: ["packages/*"], devDependencies: { prettier: "3.9.10" } }) })).toMatchObject([{ file: "../../package.json" }]);
    expect(formatter({ "package.json": JSON.stringify({ workspaces: ["packages/*"], prettier: {} }) })).toMatchObject([{ file: "../../package.json" }]);
    expect(formatter({ ".prettierrc.json": "{}", ".prettierignore": "*.html\n" })).toEqual([]);
    expect(formatter({ ".prettierrc.json": "{}", [`${pkg}/.prettierrc.yaml`]: "semi: false\n" })).toMatchObject([{ file: ".prettierrc.yaml" }]);
    const oxlint = (root: Record<string, string>) => inPackage(root, "oxlint-plugin-missing");
    expect(oxlint({ ".oxlintrc.json": `{ "rules": {} }` })).toMatchObject([{ file: "../../.oxlintrc.json" }]);
    expect(oxlint({ ".oxlintrc.json": `{ "rules": {} }`, [`${pkg}/.oxlintrc.json`]: `{ "jsPlugins": [{ "name": "ts-dom", "specifier": "@nativele/ts-dom/oxlint" }] }` })).toEqual([]);
  });

  it("does not climb to a home directory managed as a git repository", () => {
    const home = tree({ ".git/HEAD": "ref: refs/heads/main\n", ".gitignore": "*.html.ts\n", ".claude/skills/nativele-core/SKILL.md": "an older copy", ".prettierrc.json": "{}", ...app });
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const issues = runDoctor({ dirs: ["src"], cwd: join(home, pkg) }).map((i) => i.rule);
      expect(issues).not.toContain("typecheck-before-gen");
      expect(issues).not.toContain("skill-outdated");
      expect(issues).not.toContain("formatter-whitespace");
      expect(runDoctor({ dirs: [], cwd: home }).filter((i) => i.rule === "skill-outdated")).toHaveLength(1);
    } finally {
      process.env.HOME = before;
    }
  });

  it("stops at the workspace root", () => {
    const outer = tree({ ".gitignore": "*.html.ts\n", "repo/package.json": JSON.stringify({ workspaces: ["packages/*"] }) });
    cpSync(join(tree(app), "packages"), join(outer, "repo/packages"), { recursive: true });
    expect(runDoctor({ dirs: ["src"], cwd: join(outer, "repo", pkg) }).filter((i) => i.rule === "typecheck-before-gen")).toEqual([]);
  });
});

describe("ts-dom doctor --project", () => {
  it("checks the tsconfig given instead of tsconfig.json", () => {
    const cwd = tree({ "tsconfig.json": `{ "compilerOptions": { "strict": true, ${paths} } }`, "tsconfig.app.json": `{ "compilerOptions": { "strict": false, ${paths} } }`, "src/x.html": "<p></p>" });
    expect(issuesOf(cwd, "tsconfig-not-strict")).toEqual([]);
    expect(issuesOf(cwd, "tsconfig-not-strict", { project: "tsconfig.app.json" })).toMatchObject([{ file: "tsconfig.app.json" }]);
    expect(issuesOf(cwd, "no-tsconfig", { project: "tsconfig.missing.json" })[0]?.message).toContain("tsconfig.missing.json");
  });
});

describe("ts-dom doctor on the command line", () => {
  const cli = join(process.cwd(), "src/cli.ts");
  const warningsOnly = () => tree({ "tsconfig.json": `{ "compilerOptions": { "strict": false, ${paths} } }`, "tsconfig.app.json": `{ "compilerOptions": { "strict": true, ${paths} } }`, "src/a.ts": "export {};\n" });

  it("--strict exits with 1 on warnings, like check --strict", () => {
    const cwd = warningsOnly();
    expect(spawnSync(process.execPath, [cli, "doctor", "src"], { cwd, encoding: "utf8" }).status).toBe(0);
    const strict = spawnSync(process.execPath, [cli, "doctor", "src", "--strict"], { cwd, encoding: "utf8" });
    expect(strict.stderr).toContain("[tsconfig-not-strict]");
    expect(strict.status).toBe(1);
  }, 30_000);

  it("--project picks the tsconfig", () => {
    const run = spawnSync(process.execPath, [cli, "doctor", "src", "--project=tsconfig.app.json", "--strict"], { cwd: warningsOnly(), encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  }, 30_000);
});
