import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { listHtml, listTs, staleGenerated } from "./codegen.ts";
import { installedCopies, listSkills, skillsRoot } from "./skills.ts";
import { projectConfigs, readTsConfig } from "./tsconfig.ts";
import type { GenerateOptions } from "./codegen.ts";

export const DOCTOR_RULES = {
  "dir-not-found": "a folder given on the command line does not exist, so nothing in it was checked",
  "no-tsconfig": "there is no tsconfig.json, so tsc cannot check the templates against the components",
  "tsconfig-not-strict": "strict is off, so tsc lets wrong names and null values through",
  "tsconfig-no-dom-lib": "lib leaves out DOM, so element types are missing",
  "tsconfig-classic-resolution": "moduleResolution classic cannot resolve ./x.html.js to the generated x.html.ts",
  "tsconfig-misses-templates": "include leaves out a folder with templates, so their generated types are not checked",
  "runtime-not-installed": "the runtime package the generated files import cannot be resolved",
  "template-import-without-js": "a template is imported as ./x.html instead of ./x.html.js",
  "stale-generated": "a generated file is missing, outdated or orphaned",
  "vite-plugin-missing": "the Vite config does not use the ts-dom plugin, so templates are not regenerated while the dev server runs",
  "oxlint-plugin-missing": "the lint config does not load the ts-dom oxlint plugin, so the template rules do not run in the editor",
  "formatter-whitespace": "a formatter is set up while templates keep their whitespace, so reformatting can change the rendered spacing",
  "skill-available": "the project uses a tool that a Nativele Skill covers, and the project has no copy of that Skill",
  "skill-outdated": "the project's copy of a Nativele Skill differs from the one shipped with the installed version",
} as const;

export type DoctorRule = keyof typeof DOCTOR_RULES;

export interface DoctorIssue {
  rule: DoctorRule;
  severity: "error" | "warning" | "info";
  message: string;
  file?: string;
  line?: number;
}

export interface DoctorOptions {
  dirs: string[];
  generate?: GenerateOptions;
  cwd?: string;
  /** The Skills to recommend from (default: the ones shipped with this package) */
  skillsDir?: string;
}

const readText = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : null);

/** Whether an include pattern (absolute, forward slashes) makes tsc read the files directly in `dir`. */
function covers(pattern: string, dir: string): boolean {
  const d = dir.split("\\").join("/");
  const star = pattern.indexOf("*");
  if (star === -1) return /\.[cm]?tsx?$/.test(pattern) ? false : d === pattern || d.startsWith(`${pattern}/`);
  const prefix = pattern.slice(0, star).replace(/\/$/, "");
  const rest = pattern.slice(star);
  if (rest.startsWith("**")) return d === prefix || d.startsWith(`${prefix}/`);
  return d === prefix;
}

const templateFolders = (dir: string): string[] => [...new Set(listHtml(dir).map((f) => dirname(f)))];
const hasTemplates = (dir: string): boolean => listHtml(dir).length > 0;

/** Check the project set-up an agent or a developer could get wrong; every issue names its rule and ends with a Fix hint. */
export function runDoctor(options: DoctorOptions): DoctorIssue[] {
  const cwd = options.cwd ?? process.cwd();
  const generate = options.generate ?? {};
  const runtime = generate.runtime ?? "@nativele/ts-dom";
  const rel = (f: string) => relative(cwd, f) || ".";
  const issues: DoctorIssue[] = [];
  const add = (rule: DoctorRule, severity: DoctorIssue["severity"], message: string, at: { file?: string; line?: number } = {}) => issues.push({ rule, severity, message, ...at });
  const dirs: string[] = [];
  for (const d of options.dirs.map((x) => resolve(cwd, x))) {
    if (existsSync(d)) dirs.push(d);
    else add("dir-not-found", "error", `The folder ${rel(d)} does not exist, so nothing in it was checked. Fix: pass the folder that holds the templates and components (default: src).`, { file: rel(d) });
  }

  const configs = projectConfigs(cwd);
  let paths: Record<string, unknown> = {};
  if (!configs.length) {
    add("no-tsconfig", "error", 'There is no tsconfig.json. Fix: add one with "strict": true, "lib": ["ES2022", "DOM"] and "moduleResolution": "bundler" (or "NodeNext").');
  }
  const includes: string[] = [];
  let everyConfigIncludes = true;
  const scanned = dirs.map((dir) => ({ dir, folders: templateFolders(dir) }));
  const targets = scanned.flatMap(({ dir, folders }) => (folders.length ? folders : [dir]));
  const read = configs.map((path) => ({ path, config: readTsConfig(path) }));
  const covering = read.filter(({ config: { include } }) => !include || targets.some((t) => include.some((p) => covers(p, t))));
  for (const { path: configPath, config } of read) {
    const o = config.compilerOptions;
    const file = rel(configPath);
    paths = { ...paths, ...(o.paths as Record<string, unknown> | undefined) };
    if (config.include) includes.push(...config.include);
    else everyConfigIncludes = false;
    if (covering.length && !covering.some((r) => r.path === configPath)) continue;
    if (o.strict !== true) add("tsconfig-not-strict", "warning", 'compilerOptions.strict is not true, so tsc lets wrong names and null values through. Fix: set "strict": true.', { file });
    const lib = o.lib as string[] | undefined;
    if (lib && !lib.some((l) => l.toLowerCase() === "dom")) add("tsconfig-no-dom-lib", "error", 'compilerOptions.lib leaves out DOM, so element types such as HTMLButtonElement are missing. Fix: add "DOM" to lib.', { file });
    if (String(o.moduleResolution ?? "").toLowerCase() === "classic") {
      add("tsconfig-classic-resolution", "error", 'moduleResolution "classic" cannot resolve ./x.html.js to the generated x.html.ts. Fix: use "bundler" or "NodeNext".', { file });
    }
  }
  if (configs.length && everyConfigIncludes) {
    const missed = new Set<string>();
    for (const folder of scanned.flatMap((s) => s.folders)) if (!includes.some((p) => covers(p, folder))) missed.add(rel(folder));
    for (const folder of missed) {
      add("tsconfig-misses-templates", "error", `No tsconfig include covers ${folder}, which has templates, so their generated types are never checked. Fix: add "${folder === "." ? "**/*" : `${folder}/**/*`}" to include.`, { file: rel(configs[0] as string) });
    }
  }

  let resolvable = Object.keys(paths).includes(runtime);
  if (!resolvable) {
    try {
      createRequire(join(cwd, "package.json")).resolve(`${runtime}/package.json`);
      resolvable = true;
    } catch {
      resolvable = false;
    }
  }
  if (!resolvable) add("runtime-not-installed", "error", `The generated files import "${runtime}", which cannot be resolved from this project. Fix: npm i ${runtime}.`);

  for (const d of dirs) {
    for (const f of listTs(d)) {
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((text, i) => {
        const m = /from\s+["'](\.{1,2}\/[^"']+\.html)["']/.exec(text);
        if (m) add("template-import-without-js", "error", `${m[1]} is imported without .js, which works only through a bundler plugin that Nativele does not provide. Fix: import "${m[1]}.js" (TypeScript maps it to the generated ${m[1]}.ts).`, { file: rel(f), line: i + 1 });
      });
    }
    for (const s of staleGenerated(d, generate)) {
      add("stale-generated", "warning", `The generated file is ${s.reason}. Fix: run ts-dom gen (or ts-dom check, which regenerates).`, { file: rel(s.file) });
    }
  }

  const viteConfig = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"].map((n) => join(cwd, n)).find((f) => existsSync(f));
  const vite = viteConfig ? (readText(viteConfig) as string) : null;
  if (viteConfig && vite !== null && !/@nativele\/ts-dom\/vite|vite-plugin(\.ts)?["']/.test(vite)) {
    add("vite-plugin-missing", "warning", 'The Vite config does not use the ts-dom plugin, so templates are not regenerated while the dev server runs. Fix: import { tsDom } from "@nativele/ts-dom/vite" and add tsDom() to plugins.', { file: rel(viteConfig) });
  }

  const oxlintrc = [".oxlintrc.json", "oxlintrc.json"].map((n) => join(cwd, n)).find((f) => existsSync(f));
  const lintConfigs = [oxlintrc ? readText(oxlintrc) : null, vite && /\blint\s*:/.test(vite) ? vite : null].filter((t): t is string => t !== null);
  if (lintConfigs.length && !lintConfigs.some((t) => /@nativele\/ts-dom\/oxlint|oxlint-plugin(\.ts)?["']/.test(t))) {
    add("oxlint-plugin-missing", "warning", 'The lint config does not load the ts-dom oxlint plugin, so unused markup, data flow and accessibility rules do not run in the editor. Fix: add { name: "ts-dom", specifier: "@nativele/ts-dom/oxlint" } to jsPlugins and enable "ts-dom/unused-markup".', { file: rel(oxlintrc ?? (viteConfig as string)) });
  }

  const pkgText = readText(join(cwd, "package.json"));
  const pkg = pkgText ? (JSON.parse(pkgText) as { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }) : {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = Object.values(pkg.scripts ?? {});
  const ignoredHtml = /(^|\n)\s*(\*\*\/)?\*\.html\s*($|\n)/.test(readText(join(cwd, ".prettierignore")) ?? "");
  const formatter =
    [".oxfmtrc.json", ".oxfmtrc.jsonc"].some((n) => existsSync(join(cwd, n))) ||
    ("oxfmt" in deps) ||
    scripts.some((c) => /(^|[\s;&|])(oxfmt|vp fmt)(\s|$)/.test(c)) ||
    (vite !== null && /\bfmt\s*:/.test(vite)) ||
    (!ignoredHtml &&
      ([".prettierrc", ".prettierrc.json", ".prettierrc.js", "prettier.config.js", "prettier.config.mjs"].some((n) => existsSync(join(cwd, n))) || "prettier" in deps || scripts.some((c) => /(^|[\s;&|])prettier(\s|$)/.test(c))));
  const collapsed =
    scripts.some((c) => c.includes("--whitespace=collapse")) ||
    (vite !== null && /whitespace\s*:\s*["']collapse["']/.test(vite)) ||
    dirs.some((d) => listHtml(d).some((f) => (readText(`${f}.ts`) ?? "").split("\n", 3).includes("// whitespace: collapse")));
  if (formatter && !collapsed && dirs.some(hasTemplates)) {
    add("formatter-whitespace", "warning", 'A formatter (oxfmt or Prettier) is set up, and templates keep their whitespace as written, so reformatting a template can change the spacing on the page. Fix: generate with whitespace "collapse" (ts-dom gen --whitespace=collapse, or tsDom({ whitespace: "collapse" })).');
  }

  for (const skill of listSkills(options.skillsDir ?? skillsRoot())) {
    const copies = installedCopies(cwd, skill.name);
    const shipped = readFileSync(join(skill.dir, "SKILL.md"), "utf8");
    for (const copy of copies) {
      if (readFileSync(join(copy, "SKILL.md"), "utf8") !== shipped) {
        add("skill-outdated", "info", `${rel(copy)} differs from the ${skill.name} Skill shipped with the installed Nativele. Fix: run ts-dom skills add ${skill.name} to replace it with the shipped version.`, { file: rel(join(copy, "SKILL.md")) });
      }
    }
    const found = skill.detects.filter((d) => d in deps);
    if (!copies.length && found.length) {
      add("skill-available", "info", `${found.join(", ")} ${found.length > 1 ? "are dependencies" : "is a dependency"}, and the ${skill.name} Skill covers it: ${skill.description} Fix: run ts-dom skills add ${skill.name}, or read it with ts-dom skills ${skill.name}.`, { file: "package.json" });
    }
  }
  return issues;
}

export function formatDoctorIssue(i: DoctorIssue): string {
  return `${i.file ?? "."}:${i.line ?? 1}:1 ${i.severity} [${i.rule}] ${i.message}`;
}
