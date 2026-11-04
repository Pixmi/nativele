import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    expect(rules(project({ "src/x.html": "<p></p>" }))).toEqual(["no-tsconfig", "runtime-not-installed", "stale-generated"]);
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
  });

  it("Vite, oxlint and formatter configuration", () => {
    const base = { "tsconfig.json": `{ "compilerOptions": { "strict": true, "paths": { "@nativele/ts-dom": ["x"] } } }`, "src/x.html": "<p></p>" };
    const missing = project({ ...base, "vite.config.ts": `export default { plugins: [], lint: {} }`, "package.json": `{ "scripts": { "fmt": "oxfmt ." } }` });
    expect(rules(missing).filter((r) => r !== "stale-generated")).toEqual(["formatter-whitespace", "oxlint-plugin-missing", "vite-plugin-missing"]);
    const fine = project({
      ...base,
      "vite.config.ts": `import { tsDom } from "@nativele/ts-dom/vite";\nexport default { plugins: [tsDom({ whitespace: "collapse" })], lint: { jsPlugins: [{ name: "ts-dom", specifier: "@nativele/ts-dom/oxlint" }] } }`,
      "package.json": `{ "scripts": { "fmt": "oxfmt ." } }`,
    });
    expect(rules(fine).filter((r) => r !== "stale-generated")).toEqual([]);
  });
});
