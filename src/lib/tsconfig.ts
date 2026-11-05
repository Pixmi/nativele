import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

/** tsconfig is JSONC: drop comments and trailing commas before parsing. */
export function parseJsonc(text: string): Record<string, unknown> {
  const noComments = text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str: string | undefined) => str ?? "");
  return JSON.parse(noComments.replace(/,(\s*[}\]])/g, "$1")) as Record<string, unknown>;
}

export interface TsConfig {
  compilerOptions: Record<string, unknown>;
  /** include patterns made absolute against the folder of the config that declared them; empty when only `files` is given, as tsc then includes nothing else */
  include?: string[];
  /** exclude patterns, made absolute the same way */
  exclude?: string[];
  /** files, made absolute the same way */
  files?: string[];
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
export function readTsConfig(file: string, depth = 0): TsConfig {
  const json = parseJsonc(readFileSync(file, "utf8"));
  let merged: TsConfig = { compilerOptions: {} };
  const exts = typeof json.extends === "string" ? [json.extends] : Array.isArray(json.extends) ? (json.extends as string[]) : [];
  for (const ext of depth < 5 ? exts : []) {
    const target = resolveExtends(file, ext);
    if (!target) continue;
    const base = readTsConfig(target, depth + 1);
    merged = { ...merged, ...base, compilerOptions: { ...merged.compilerOptions, ...base.compilerOptions } };
  }
  const own = (key: "include" | "exclude" | "files") => (Array.isArray(json[key]) ? (json[key] as string[]).map((p) => resolve(dirname(file), p).split("\\").join("/")) : merged[key]);
  const files = own("files");
  const exclude = own("exclude");
  const include = Array.isArray(json.include) ? own("include") : (merged.include ?? (Array.isArray(json.files) ? [] : undefined));
  return { compilerOptions: { ...merged.compilerOptions, ...(json.compilerOptions as Record<string, unknown> | undefined) }, ...(include ? { include } : {}), ...(exclude ? { exclude } : {}), ...(files ? { files } : {}) };
}

/** A tsconfig include or exclude pattern (absolute, forward slashes) as tsc matches it: `**` crosses folders, `*` and `?` stay within one, a last segment without a wildcard or an extension names a folder, and an exclude also removes everything under a folder it matches. */
function globRegExp(pattern: string, exclude: boolean): RegExp {
  const last = pattern.slice(pattern.lastIndexOf("/") + 1);
  const full = !exclude && !/[*?]/.test(last) && !/\.[^.]+$/.test(last) ? `${pattern.replace(/\/$/, "")}/**/*` : pattern;
  const segments = full.split("/");
  const body = segments
    .map((seg, i) => {
      const end = i === segments.length - 1;
      if (seg === "**") return end ? ".*" : "(?:[^/]+/)*";
      const text = seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
      return end ? text : `${text}/`;
    })
    .join("");
  return new RegExp(`^${body}${exclude ? "(?:$|/)" : "$"}`);
}

/**
 * Why tsc leaves `file` out of the program of a config whose folder is `configDir`, unless another file imports it: include does not match it, or an exclude pattern removes it.
 * null when files, or include without a matching exclude, take it in.
 */
export function leftOutBy(config: TsConfig, configDir: string, file: string): { by: "include" } | { by: "exclude"; pattern: string } | null {
  const f = file.split("\\").join("/");
  if (config.files?.includes(f)) return null;
  const include = config.include ?? [`${configDir.split("\\").join("/")}/**/*`];
  if (!include.some((p) => globRegExp(p, false).test(f))) return { by: "include" };
  const pattern = config.exclude?.find((p) => globRegExp(p, true).test(f));
  return pattern === undefined ? null : { by: "exclude", pattern };
}

/**
 * The tsconfig files tsc would check for a project: `project`, or tsconfig.json in `cwd`.
 * A solution-style config (`"files": []` with `references`) checks nothing itself, so its referenced projects are returned instead.
 */
export function projectConfigs(cwd: string, project?: string): string[] {
  const root = resolve(cwd, project ?? "tsconfig.json");
  if (!existsSync(root)) return [];
  const json = parseJsonc(readFileSync(root, "utf8"));
  const refs = Array.isArray(json.references) ? (json.references as { path?: string }[]).map((r) => r.path).filter((p): p is string => typeof p === "string") : [];
  const solution = refs.length > 0 && Array.isArray(json.files) && json.files.length === 0 && json.include === undefined;
  if (!solution) return [root];
  return refs
    .map((ref) => {
      const abs = resolve(dirname(root), ref);
      return existsSync(abs) && statSync(abs).isDirectory() ? join(abs, "tsconfig.json") : abs;
    })
    .filter((f) => existsSync(f));
}
