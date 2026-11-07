import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface Skill {
  name: string;
  description: string;
  tier: "official" | "community" | "experimental";
  nativele: string;
  verified: string;
  tools: string;
  author: string;
  detects: string[];
  dir: string;
}

const STALE_DAYS = 183;

export function skillsRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "package.json")) || !existsSync(join(dir, "skills"))) {
    const up = dirname(dir);
    if (up === dir) return join(dirname(fileURLToPath(import.meta.url)), "skills");
    dir = up;
  }
  return join(dir, "skills");
}

const unquote = (v: string) => v.trim().replace(/^(["'])(.*)\1$/, "$2");

/** Read the frontmatter fields Nativele uses; returns null when the file has none. */
export function parseSkill(text: string, dir: string): Skill | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const top: Record<string, string> = {};
  const meta: Record<string, string> = {};
  for (const line of (m[1] as string).split(/\r?\n/)) {
    const kv = /^(\s*)([\w-]+):\s?(.*)$/.exec(line);
    if (!kv) continue;
    const value = unquote((kv[3] as string).replace(/\s+#.*$/, ""));
    (kv[1] ? meta : top)[kv[2] as string] = value;
  }
  if (!top.name) return null;
  const tier = meta.tier === "official" || meta.tier === "community" ? meta.tier : "experimental";
  return {
    name: top.name,
    description: top.description ?? "",
    tier,
    nativele: meta.nativele ?? "",
    verified: meta.verified ?? "",
    tools: meta.tools ?? "",
    author: meta.author ?? "",
    detects: (meta.detects ?? "").split(/[\s,]+/).filter(Boolean),
    dir,
  };
}

export function listSkills(root = skillsRoot()): Skill[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_") && existsSync(join(root, e.name, "SKILL.md")))
    .map((e) => parseSkill(readFileSync(join(root, e.name, "SKILL.md"), "utf8"), join(root, e.name)))
    .filter((s): s is Skill => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const parts = (v: string) => v.split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
const compare = (a: string, b: string) => {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) if ((x[i] as number) !== (y[i] as number)) return (x[i] as number) - (y[i] as number);
  return 0;
};

/** Whether `version` satisfies a range of space-separated comparators such as ">=0.5.0 <0.6.0". */
export function inRange(version: string, range: string): boolean {
  return range
    .split(/\s+/)
    .filter(Boolean)
    .every((c) => {
      const m = /^(>=|<=|>|<|=)?v?(\d[\w.-]*)$/.exec(c);
      if (!m) return false;
      const d = compare(version, m[2] as string);
      return m[1] === ">=" ? d >= 0 : m[1] === "<=" ? d <= 0 : m[1] === ">" ? d > 0 : m[1] === "<" ? d < 0 : d === 0;
    });
}

/** Why a Skill should not be trusted as verified for this version, or null when it is current. */
export function staleReason(skill: Skill, version: string, today = new Date()): string | null {
  if (!skill.nativele || !inRange(version, skill.nativele)) return `verified for Nativele ${skill.nativele || "(no range)"}, installed ${version}`;
  const verified = Date.parse(skill.verified);
  if (Number.isNaN(verified)) return "no verification date";
  if ((today.getTime() - verified) / 86_400_000 > STALE_DAYS) return `last verified ${skill.verified}, more than six months ago`;
  return null;
}

export function skillsTarget(cwd: string, to?: string): string {
  if (to) return resolve(cwd, to);
  return existsSync(join(cwd, ".claude")) ? join(cwd, ".claude", "skills") : join(cwd, ".agents", "skills");
}

export function installedCopies(cwd: string, name: string): string[] {
  return [join(cwd, ".claude", "skills", name), join(cwd, ".agents", "skills", name)].filter((d) => existsSync(join(d, "SKILL.md")));
}

export function addSkill(skill: Skill, target: string): string {
  const dest = join(target, skill.name);
  cpSync(skill.dir, dest, { recursive: true });
  return dest;
}

export function libraryVersion(root = skillsRoot()): string {
  const pkg = JSON.parse(readFileSync(join(dirname(root), "package.json"), "utf8")) as { version?: string };
  return pkg.version ?? "0.0.0";
}
