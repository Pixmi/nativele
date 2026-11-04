import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { staleGenerated } from "./codegen.ts";
import type { GenerateOptions } from "./codegen.ts";

export const DOCTOR_RULES = {
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
} as const;

export type DoctorRule = keyof typeof DOCTOR_RULES;

export interface DoctorIssue {
  rule: DoctorRule;
  severity: "error" | "warning";
  message: string;
  file?: string;
  line?: number;
}

export interface DoctorOptions {
  dirs: string[];
  generate?: GenerateOptions;
  cwd?: string;
}

const readText = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : null);

/** tsconfig is JSONC: drop comments and trailing commas before parsing. */
function parseJsonc(text: string): Record<string, unknown> {
  const noComments = text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str: string | undefined) => str ?? "");
  return JSON.parse(noComments.replace(/,(\s*[}\]])/g, "$1")) as Record<string, unknown>;
}

interface TsConfig {
  compilerOptions: Record<string, unknown>;
  /** include patterns made absolute against the folder of the config that declared them */
  include?: string[];
}

function resolveExtends(from: string, ext: string): string | null {
  const dir = dirname(from);
  if (ext.startsWith(".")) {
    const target = resolve(dir, ext);
    return existsSync(target) ? target : existsSync(`${target}.json`) ? `${target}.json` : null;
  }
  const req = createRequire(from);
  for (const spec of [ext, `${ext}.json`, `${ext}/tsconfig.json`]) {
    try {
      return req.resolve(spec);
    } catch {
      /* try the next form */
    }
  }
  return null;
}

/** Read a tsconfig and the ones it extends (a relative path, a package, or an array of them), the later and nearer one winning. */
function readTsConfig(file: string, depth = 0): TsConfig {
  const json = parseJsonc(readFileSync(file, "utf8"));
  let merged: TsConfig = { compilerOptions: {} };
  const exts = typeof json.extends === "string" ? [json.extends] : Array.isArray(json.extends) ? (json.extends as string[]) : [];
  for (const ext of depth < 5 ? exts : []) {
    const target = resolveExtends(file, ext);
    if (!target) continue;
    const base = readTsConfig(target, depth + 1);
    merged = { compilerOptions: { ...merged.compilerOptions, ...base.compilerOptions }, ...(base.include ?? merged.include ? { include: base.include ?? merged.include } : {}) };
  }
  const own = json.include as string[] | undefined;
  const include = own ? own.map((p) => resolve(dirname(file), p).split("\\").join("/")) : merged.include;
  return { compilerOptions: { ...merged.compilerOptions, ...(json.compilerOptions as Record<string, unknown> | undefined) }, ...(include ? { include } : {}) };
}

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

const templateFolders = (dir: string): string[] => {
  const out = new Set<string>();
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === "node_modules") continue;
      const f = join(d, n);
      if (statSync(f).isDirectory()) walk(f);
      else if (n.endsWith(".html")) out.add(d);
    }
  };
  walk(dir);
  return [...out];
};

function listTs(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === "node_modules" || n === "dist") return [];
    const f = join(dir, n);
    if (statSync(f).isDirectory()) return listTs(f);
    return n.endsWith(".ts") && !n.endsWith(".d.ts") && !n.endsWith(".html.ts") ? [f] : [];
  });
}

const hasHtml = (dir: string): boolean =>
  readdirSync(dir).some((n) => {
    if (n === "node_modules") return false;
    const f = join(dir, n);
    return statSync(f).isDirectory() ? hasHtml(f) : n.endsWith(".html");
  });

/** Check the project set-up an agent or a developer could get wrong; every issue names its rule and ends with a Fix hint. */
export function runDoctor(options: DoctorOptions): DoctorIssue[] {
  const cwd = options.cwd ?? process.cwd();
  const generate = options.generate ?? {};
  const runtime = generate.runtime ?? "@nativele/ts-dom";
  const dirs = options.dirs.map((d) => resolve(cwd, d)).filter((d) => existsSync(d));
  const rel = (f: string) => relative(cwd, f) || ".";
  const issues: DoctorIssue[] = [];
  const add = (rule: DoctorRule, severity: DoctorIssue["severity"], message: string, at: { file?: string; line?: number } = {}) => issues.push({ rule, severity, message, ...at });

  const tsconfigPath = join(cwd, "tsconfig.json");
  let paths: Record<string, unknown> = {};
  if (!existsSync(tsconfigPath)) {
    add("no-tsconfig", "error", 'There is no tsconfig.json. Fix: add one with "strict": true, "lib": ["ES2022", "DOM"] and "moduleResolution": "bundler" (or "NodeNext").');
  } else {
    const config = readTsConfig(tsconfigPath);
    const o = config.compilerOptions;
    const file = rel(tsconfigPath);
    paths = (o.paths as Record<string, unknown> | undefined) ?? {};
    if (o.strict !== true) add("tsconfig-not-strict", "warning", 'compilerOptions.strict is not true, so tsc lets wrong names and null values through. Fix: set "strict": true.', { file });
    const lib = o.lib as string[] | undefined;
    if (lib && !lib.some((l) => l.toLowerCase() === "dom")) add("tsconfig-no-dom-lib", "error", 'compilerOptions.lib leaves out DOM, so element types such as HTMLButtonElement are missing. Fix: add "DOM" to lib.', { file });
    if (String(o.moduleResolution ?? "").toLowerCase() === "classic") {
      add("tsconfig-classic-resolution", "error", 'moduleResolution "classic" cannot resolve ./x.html.js to the generated x.html.ts. Fix: use "bundler" or "NodeNext".', { file });
    }
    if (config.include) {
      const missed = new Set<string>();
      for (const d of dirs) for (const folder of templateFolders(d)) if (!config.include.some((p) => covers(p, folder))) missed.add(rel(folder));
      for (const folder of missed) {
        add("tsconfig-misses-templates", "error", `tsconfig include leaves out ${folder}, which has templates, so their generated types are never checked. Fix: add "${folder === "." ? "**/*" : `${folder}/**/*`}" to include.`, { file });
      }
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
  const collapsed = scripts.some((c) => c.includes("--whitespace=collapse")) || (vite !== null && /whitespace\s*:\s*["']collapse["']/.test(vite));
  if (formatter && !collapsed && dirs.some(hasHtml)) {
    add("formatter-whitespace", "warning", 'A formatter (oxfmt or Prettier) is set up, and templates keep their whitespace as written, so reformatting a template can change the spacing on the page. Fix: generate with whitespace "collapse" (ts-dom gen --whitespace=collapse, or tsDom({ whitespace: "collapse" })).');
  }
  return issues;
}

export function formatDoctorIssue(i: DoctorIssue): string {
  return `${i.file ?? "."}:${i.line ?? 1}:1 ${i.severity} [${i.rule}] ${i.message}`;
}
