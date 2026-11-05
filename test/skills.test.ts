import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    if (s.tier === "official" && name !== "nativele-core") expect(existsSync(join(s.dir, "example", "package.json"))).toBe(true);
  });

  it("the shipped Skills cover the version in package.json", () => {
    const version = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
    for (const s of skills) expect(inRange(version, s.nativele), s.name).toBe(true);
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

  it("copies into .claude/skills when the project has .claude, otherwise .agents/skills, without the example", () => {
    const plain = tmp();
    expect(skillsTarget(plain)).toBe(join(plain, ".agents", "skills"));
    const claude = tmp();
    mkdirSync(join(claude, ".claude"));
    expect(skillsTarget(claude)).toBe(join(claude, ".claude", "skills"));
    expect(skillsTarget(claude, "tools/skills")).toBe(join(claude, "tools", "skills"));
    const react = listSkills(skillsRoot()).find((s) => s.name === "nativele-react")!;
    const dest = addSkill(react, skillsTarget(claude));
    expect(existsSync(join(dest, "SKILL.md"))).toBe(true);
    expect(existsSync(join(dest, "example"))).toBe(false);
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
