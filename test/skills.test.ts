import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runDoctor } from "../src/lib/doctor.ts";
import { addSkill, inRange, listSkills, parseSkill, skillsRoot, skillsTarget, staleReason } from "../src/lib/skills.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "nativele-skills-"));
const skillText = (name: string, meta: string) => `---\nname: ${name}\ndescription: "Does a: thing."\nmetadata:\n${meta}\n---\n\n# ${name}\n`;

describe("Skills shipped with the package", () => {
  const skills = listSkills(skillsRoot());

  it("lists every skills/<name>/SKILL.md except the _-prefixed ones", () => {
    const dirs = readdirSync(skillsRoot()).filter((d) => !d.startsWith("_") && existsSync(join(skillsRoot(), d, "SKILL.md")));
    expect(skills.map((s) => s.name)).toEqual(dirs.sort());
    expect(dirs).toContain("nativele-core");
  });

  it.each(listSkills(skillsRoot()).map((s) => [s.name, s] as const))("%s follows the specification", (name, s) => {
    expect(s.dir.endsWith(name)).toBe(true);
    expect(s.description.length).toBeGreaterThan(40);
    expect(["official", "community", "experimental"]).toContain(s.tier);
    expect(s.nativele).toMatch(/^>=\d+\.\d+\.\d+ <\d+\.\d+\.\d+$/);
    expect(s.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.author).not.toBe("");
    expect(s.detects.length).toBeGreaterThan(0);
    const text = readFileSync(join(s.dir, "SKILL.md"), "utf8");
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    const required = ["When to use", "Versions", "Set-up", "Known limitations", "Verify", "Troubleshooting", "See also"];
    expect(headings.filter((h) => required.includes(h as string))).toEqual(required);
    for (const line of text.split("---")[1]?.split("\n") ?? []) {
      const value = /^\s*[\w-]+: (.*)$/.exec(line)?.[1];
      if (value && value.includes(": ")) expect(value.startsWith('"'), line).toBe(true);
    }
    const lowest = s.nativele.match(/^>=(\S+)/)?.[1];
    const row = text.match(/^\| @nativele\/ts-dom \| (.+) \|$/m)?.[1];
    expect(row, "the Versions row names the version of the last agent trial").toBe(`${lowest} (the last agent trial)`);
  });

  it("the shipped Skills cover the version in package.json", () => {
    const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
    for (const s of skills) expect(inRange(version, s.nativele), s.name).toBe(true);
  });
});

/** The `| \`name\` | ... |` rows of the Skill table in a README, with whether the row carries the Experimental marker. */
function readmeSkillRows(text: string, marker: string): Map<string, boolean> {
  const rows = new Map<string, boolean>();
  for (const m of text.matchAll(/^\| `([\w-]+)` \|(.*)\|$/gm)) rows.set(m[1]!, m[2]!.includes(marker));
  return rows;
}

/** A heading's anchor as GitHub makes it: the text without Markdown, lowercased, other punctuation removed, spaces as hyphens, repeats numbered. */
function headingSlugs(markdown: string): Set<string> {
  const slugs = new Set<string>();
  const seen = new Map<string, number>();
  for (const line of withoutCode(markdown).split("\n")) {
    const h = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (!h) continue;
    const text = h.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*~]|<[^>]+>/g, "");
    const base = text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "").replace(/ /g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    slugs.add(n ? `${base}-${n}` : base);
  }
  return slugs;
}

const withoutCode = (markdown: string) => markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");

/** Every link that does not resolve: a missing file, or an anchor that matches no heading of the target Markdown file. */
function brokenLinks(file: string, text: string, repo: string, exists: (f: string) => boolean = existsSync, read = (f: string) => readFileSync(f, "utf8")): string[] {
  const out: string[] = [];
  const prose = withoutCode(text).replace(/`[^`\n]*`/g, "");
  const targets = [
    ...[...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]!),
    ...[...prose.matchAll(/https:\/\/github\.com\/Pixmi\/nativele\/(?:blob|tree)\/main\/[^\s)>"'`]+/g)].map((m) => m[0]),
  ];
  for (const raw of new Set(targets.map((t) => t.replace(/[.,;:]+$/, "")))) {
    const gh = /^https:\/\/github\.com\/Pixmi\/nativele\/(?:blob|tree)\/main\/(.*)$/.exec(raw);
    if (!gh && /^[a-z]+:/i.test(raw)) continue;
    const [path = "", anchor] = (gh ? gh[1]! : raw).split("#");
    const target = path === "" ? file : gh ? join(repo, decodeURIComponent(path)) : resolve(dirname(file), decodeURIComponent(path));
    if (!exists(target)) {
      out.push(`${raw}: no such file`);
      continue;
    }
    if (anchor && target.endsWith(".md") && !headingSlugs(read(target)).has(anchor)) out.push(`${raw}: no heading with the anchor #${anchor}`);
  }
  return out;
}

describe("README Skill tables and links", () => {
  const repo = resolve(".");
  const skills = listSkills(skillsRoot());

  it.each([
    ["README.md", "(Experimental)"],
    ["README.zh-TW.md", "（Experimental）"],
  ])("%s lists every Skill, marked Experimental exactly when its tier is", (readme, marker) => {
    const rows = readmeSkillRows(readFileSync(readme, "utf8"), marker);
    expect([...rows.keys()].sort()).toEqual(skills.map((s) => s.name).sort());
    for (const s of skills) expect(rows.get(s.name), `${readme}: ${s.name} is ${s.tier}`).toBe(s.tier === "experimental");
  });

  it("finds a missing or wrong Experimental marker", () => {
    const rows = readmeSkillRows("| Skill | Covers |\n|---|---|\n| `nativele-a` | a (Experimental) |\n| `nativele-b` | b |", "(Experimental)");
    expect([...rows]).toEqual([["nativele-a", true], ["nativele-b", false]]);
  });

  it("every link in the READMEs, llms.txt, the guides and the Skills resolves", () => {
    const docs = readdirSync("docs").filter((f) => f.endsWith(".md")).map((f) => join("docs", f));
    const files = ["README.md", "README.zh-TW.md", "llms.txt", ...docs, "skills/README.md", ...skills.map((s) => join(s.dir, "SKILL.md"))];
    const broken = files.flatMap((f) => brokenLinks(resolve(f), readFileSync(f, "utf8"), repo).map((b) => `${f}: ${b}`));
    expect(broken).toEqual([]);
  });

  it("reports a missing file and an anchor with no heading, as GitHub makes anchors", () => {
    const files: Record<string, string> = { "/r/docs/a.md": "# Title\n\n## Data Flow: props Down, `events` Up\n\n## Same\n\n## Same\n\n```md\n## In code\n```\n" };
    const exists = (f: string) => f in files || f === "/r/docs";
    const read = (f: string) => files[f]!;
    const text = [
      "[ok](a.md#data-flow-props-down-events-up) [ok](#same-1) [ok](https://github.com/Pixmi/nativele/tree/main/docs) https://github.com/Pixmi/nativele/blob/main/docs/a.md#title.",
      "[gone](b.md) [bad](a.md#in-code) https://github.com/Pixmi/nativele/blob/main/docs/a.md#nope [web](https://example.com/x)",
      "`[skipped](c.md)`",
    ].join("\n");
    expect(brokenLinks("/r/docs/a.md", text, "/r", exists, read)).toEqual([
      "b.md: no such file",
      "a.md#in-code: no heading with the anchor #in-code",
      "https://github.com/Pixmi/nativele/blob/main/docs/a.md#nope: no heading with the anchor #nope",
    ]);
  });
});

describe("Skill helpers", () => {
  it("parses the frontmatter, quoted values and comments", () => {
    const s = parseSkill(skillText("x", '  tier: official # a comment\n  nativele: ">=0.5.0 <0.6.0"\n  detects: "react react-dom"'), "/d/x");
    expect(s).toMatchObject({ name: "x", description: "Does a: thing.", tier: "official", nativele: ">=0.5.0 <0.6.0", detects: ["react", "react-dom"] });
    expect(parseSkill("# no frontmatter", "/d")).toBeNull();
    expect(parseSkill(skillText("y", "  tier: gold"), "/d")?.tier).toBe("experimental");
  });

  it("checks version ranges", () => {
    expect(inRange("0.5.0", ">=0.5.0 <0.6.0")).toBe(true);
    expect(inRange("0.5.3", ">=0.5.0 <0.6.0")).toBe(true);
    expect(inRange("0.6.0", ">=0.5.0 <0.6.0")).toBe(false);
    expect(inRange("0.4.9", ">=0.5.0 <0.6.0")).toBe(false);
    expect(inRange("0.5.0", "nonsense")).toBe(false);
  });

  it("marks a Skill stale outside its range or six months after verification", () => {
    const s = parseSkill(skillText("x", '  nativele: ">=0.5.0 <0.6.0"\n  verified: "2026-11-05"'), "/d")!;
    expect(staleReason(s, "0.5.1", new Date("2027-01-01"))).toBeNull();
    expect(staleReason(s, "0.6.0", new Date("2027-01-01"))).toContain("installed 0.6.0");
    expect(staleReason(s, "0.5.1", new Date("2027-06-01"))).toContain("six months");
  });

  it("copies into .claude/skills when the project has .claude, otherwise .agents/skills", () => {
    const plain = tmp();
    expect(skillsTarget(plain)).toBe(join(plain, ".agents", "skills"));
    const claude = tmp();
    mkdirSync(join(claude, ".claude"));
    expect(skillsTarget(claude)).toBe(join(claude, ".claude", "skills"));
    expect(skillsTarget(claude, "tools/skills")).toBe(join(claude, "tools", "skills"));
    const react = listSkills(skillsRoot()).find((s) => s.name === "nativele-react")!;
    const dest = addSkill(react, skillsTarget(claude));
    expect(existsSync(join(dest, "SKILL.md"))).toBe(true);
  });
});

describe("ts-dom doctor and Skills", () => {
  const project = (pkg: object) => {
    const dir = tmp();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
    return dir;
  };
  const skillIssues = (cwd: string) => runDoctor({ dirs: ["src"], cwd }).filter((i) => i.rule.startsWith("skill-"));

  it("recommends the Skills whose dependencies the project has, as info", () => {
    const cwd = project({ dependencies: { "@nativele/ts-dom": "0.5.0", react: "19.3.1" } });
    const issues = skillIssues(cwd);
    expect(issues.map((i) => [i.rule, i.severity, i.file])).toEqual([
      ["skill-available", "info", "package.json"],
      ["skill-available", "info", "package.json"],
    ]);
    expect(issues[1]?.message).toContain("ts-dom skills add nativele-react");
    expect(skillIssues(project({ dependencies: { lodash: "4" } }))).toEqual([]);
    expect(skillIssues(project({ dependencies: { vue: "3" } }))[0]?.message).toContain("ts-dom skills add nativele-vue");
  });

  it("stops recommending a copied Skill, and reports a copy that differs from the shipped one", () => {
    const cwd = project({ dependencies: { "@nativele/ts-dom": "0.5.0" } });
    mkdirSync(join(cwd, ".claude"));
    const core = listSkills(skillsRoot()).find((s) => s.name === "nativele-core")!;
    const dest = addSkill(core, skillsTarget(cwd));
    expect(skillIssues(cwd)).toEqual([]);
    writeFileSync(join(dest, "SKILL.md"), "old copy");
    expect(skillIssues(cwd).map((i) => [i.rule, i.file])).toEqual([["skill-outdated", ".claude/skills/nativele-core/SKILL.md"]]);
  });
});
