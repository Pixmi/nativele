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
  it("every line has file:line:col, also without a file", async () => {
    const { formatDoctorIssue } = await import("../src/lib/doctor.ts");
    expect(formatDoctorIssue({ rule: "runtime-not-installed", severity: "error", message: "m" })).toBe(".:1:1 error [runtime-not-installed] m");
    expect(formatDoctorIssue({ rule: "template-import-without-js", severity: "error", message: "m", file: "src/a.ts", line: 2 })).toBe("src/a.ts:2:1 error [template-import-without-js] m");
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

  it("a folder that does not exist is reported", () => {
    const cwd = project({ "tsconfig.json": `{ "compilerOptions": { ${strictPaths} } }` });
    expect(runDoctor({ dirs: ["app"], cwd }).map((i) => i.rule)).toContain("dir-not-found");
  });
});
