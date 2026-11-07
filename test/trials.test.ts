import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { A11Y_RULES } from "../src/lib/a11y.ts";
import { CHECK_RULES } from "../src/lib/check.ts";
import { CODEGEN_RULES } from "../src/lib/codegen.ts";
import { DOCTOR_RULES } from "../src/lib/doctor.ts";
import { DATA_FLOW_RULES, UNUSED_MARKUP_RULES } from "../src/lib/lint.ts";
import { listSkills, parseSkill, skillsRoot } from "../src/lib/skills.ts";
import type { Skill } from "../src/lib/skills.ts";
import {
  accept,
  affected,
  comment,
  fixtureFiles,
  globToRegExp,
  judge,
  nextRound,
  readFixture,
  renderPrompt,
  scanSandbox,
  sectionOf,
  skillDependencies,
  skillHash,
  stampSkill,
  TRIALS,
} from "../scripts/trial.ts";
import type { AffectedInput, Impact, TrialRecord } from "../scripts/trial.ts";

const fixtures = readdirSync(TRIALS, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
const skills = listSkills(skillsRoot());
const packageName = (spec: string) => spec.slice(0, spec.lastIndexOf("@"));

describe("Trial fixtures", () => {
  it("the trials folder holds the prompt, the impact map and one folder per Skill with a fixture", () => {
    expect(readdirSync(TRIALS).filter((f) => !fixtures.includes(f)).sort()).toEqual(["impact.json", "prompt.md"]);
    expect(fixtures).toContain("nativele-vue");
    for (const f of fixtures) expect(skills.map((s) => s.name), f).toContain(f);
  });

  it.each(fixtures)("%s holds only the fixture's own files: no expected project, file contents or golden diff", (name) => {
    const allowed = /^(fixture\.json|task\.md|checks\/[\w.-]+\.ts|probes\/[\w.-]+|results\/\d{4}-\d{2}-\d{2}-r\d+\.json|last-pass\/(agent\.patch|package\.json|package-lock\.json))$/;
    expect(fixtureFiles(join(TRIALS, name)).filter((f) => !allowed.test(f))).toEqual([]);
  });

  it.each(fixtures)("%s is complete and its task ends with the contract", (name) => {
    const fixture = readFixture(name);
    const dir = join(TRIALS, name);
    expect(fixture.skill).toBe(name);
    expect(fixture.skills).toContain(name);
    expect(fixture.start.command).toMatch(/@\d+\.\d+\.\d+/);
    expect(fixture.checks.length).toBeGreaterThan(0);
    for (const c of fixture.checks) expect(typeof c.exit, c.name).toBe("number");
    for (const p of fixture.probes) expect(existsSync(join(dir, p.from)), p.from).toBe(true);
    if (fixture.browser) expect(existsSync(join(dir, fixture.browser.script))).toBe(true);
    const task = readFileSync(join(dir, "task.md"), "utf8");
    const headings = [...task.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings.at(-1)).toBe("Contract");
    for (const tag of fixture.contract.tags) expect(task.slice(task.indexOf("## Contract")), tag).toContain(`\`${tag}\``);
  });

  it.each(fixtures)("%s pins exactly the tool versions its Skill lists", (name) => {
    const skill = skills.find((s) => s.name === name)!;
    expect([...readFixture(name).install].sort()).toEqual(skill.tools.split(/\s+/).filter(Boolean).sort());
  });

  it.each(fixtures)("%s checks and probes import only the library, the tools and the contract's entry", (name) => {
    const fixture = readFixture(name);
    const dir = join(TRIALS, name);
    const packages = new Set([...fixture.install.map(packageName), "playwright-core"]);
    const targets = new Map(fixture.probes.map((p) => [p.from, p.to]));
    const bad: string[] = [];
    for (const file of fixtureFiles(dir).filter((f) => /^(checks|probes)\//.test(f))) {
      const text = readFileSync(join(dir, file), "utf8");
      for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) {
        const spec = m[1]!;
        if (spec.startsWith(".")) {
          const to = targets.get(file);
          if (!to || posix.normalize(posix.join(posix.dirname(to), spec)) !== fixture.contract.entry) bad.push(`${file}: ${spec}`);
        } else if (!(spec === "@nativele/ts-dom" || spec.startsWith("@nativele/ts-dom/") || packages.has(spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/")))) bad.push(`${file}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("trials/ is not in the package", () => {
    const r = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    const [{ files }] = JSON.parse(r.stdout.slice(r.stdout.indexOf("["))) as [{ files: { path: string }[] }];
    expect(files.length).toBeGreaterThan(10);
    expect(files.filter((f) => f.path.startsWith("trials/") || f.path.startsWith("scripts/"))).toEqual([]);
  });
});

describe("The impact map", () => {
  const impact = JSON.parse(readFileSync(join(TRIALS, "impact.json"), "utf8")) as Impact;

  it("has an entry for every ts-dom command and nothing else", () => {
    const help = spawnSync(process.execPath, ["src/cli.ts", "--help"], { encoding: "utf8" }).stdout;
    const commands = [...help.slice(help.indexOf("Commands"), help.indexOf("Output format")).matchAll(/^ {2}([a-z]+)\b/gm)].map((m) => m[1]);
    expect(commands.length).toBeGreaterThan(4);
    expect(Object.keys(impact.commands).sort()).toEqual([...new Set(commands)].sort());
  });

  it("has an entry for every rule id and nothing else", () => {
    const ids = new Set([CODEGEN_RULES, CHECK_RULES, DOCTOR_RULES, UNUSED_MARKUP_RULES, DATA_FLOW_RULES, A11Y_RULES].flatMap((m) => Object.keys(m)));
    const missing = [...ids].filter((id) => !(id in impact.rules));
    expect(missing, `add these rule ids to trials/impact.json with the source files that implement them`).toEqual([]);
    expect(Object.keys(impact.rules).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("names the package's entry points and only globs that match a file", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { exports: Record<string, unknown> };
    const entries = Object.keys(pkg.exports)
      .filter((e) => e !== "." && e !== "./package.json")
      .map((e) => `@nativele/ts-dom/${e.slice(2)}`);
    expect(Object.keys(impact.imports).sort()).toEqual(entries.sort());
    const files = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src"], { encoding: "utf8" }).stdout.split("\n").filter(Boolean);
    const globs = [...Object.values(impact.commands), ...Object.values(impact.imports), ...Object.values(impact.rules)].flat();
    expect([...new Set(globs)].filter((g) => !files.some((f) => globToRegExp(g).test(f)))).toEqual([]);
  });
});

const skillText = (verified: string, version: string) =>
  `---\nname: nativele-x\ndescription: "x"\nmetadata:\n  tier: official\n  nativele: ">=0.7.0 <0.8.0"\n  verified: "${verified}"\n  tools: "vue@3.5.44"\n---\n\n## Versions\n\n| Tool | Verified version |\n|---|---|\n| @nativele/ts-dom | ${version} (the last agent trial) |\n\nVerified on ${verified} in Chrome.\n\nRun \`ts-dom check src\`; it reports [unused-ref]. See https://github.com/Pixmi/nativele/blob/main/docs/components.md#slots and docs/lists.md.\n`;

describe("Trial records", () => {
  it("stamps verified, the version row and the date line without changing the hash", () => {
    const text = skillText("2026-11-01", "0.7.0");
    const stamped = stampSkill(text, "2026-11-08", "0.7.1");
    expect(stamped).toContain('verified: "2026-11-08"');
    expect(stamped).toContain("| @nativele/ts-dom | 0.7.1 (the last agent trial) |");
    expect(stamped).toContain("Verified on 2026-11-08 in Chrome.");
    expect(skillHash(stamped)).toBe(skillHash(text));
    expect(skillHash(`${text}One more step.\n`)).not.toBe(skillHash(text));
    expect(parseSkill(stamped, "/d")?.verified).toBe("2026-11-08");
  });

  it("detects forbidden sources in tool calls and report sources", () => {
    const call = (input: object) => JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input }] } });
    const clean = [call({ file_path: ".claude/skills/nativele-vue/SKILL.md" }), call({ url: "https://github.com/Pixmi/nativele/blob/main/docs/components.md" })].join("\n");
    expect(scanSandbox(clean, [], "/repo/nativele")).toEqual({ sandbox: "clean", violations: [] });
    expect(scanSandbox(null, [], "/repo/nativele").sandbox).toBe("unchecked");
    expect(scanSandbox("not json\n", [], "/repo/nativele").sandbox).toBe("unchecked");
    const bad = [
      call({ file_path: "/repo/nativele/src/lib/component.ts" }),
      call({ command: "cat node_modules/@nativele/ts-dom/dist/index.mjs" }),
      call({ url: "https://github.com/Pixmi/nativele/blob/main/src/lib/list.ts" }),
    ].join("\n");
    expect(scanSandbox(bad, [], "/repo/nativele").violations).toEqual([
      "Read: the repository (/repo/nativele)",
      "Read: node_modules/@nativele/ts-dom/dist",
      "Read: github.com/Pixmi/nativele/blob/main/src/lib/list.ts",
    ]);
    expect(scanSandbox(clean, ["https://raw.githubusercontent.com/Pixmi/nativele/main/src/cli.ts"], "/repo/nativele").sandbox).toBe("violated");
  });

  const record = (over: Partial<TrialRecord>): TrialRecord => ({
    kind: "agent",
    skill: "nativele-vue",
    date: "2026-11-08",
    skillHash: "sha256:x",
    fixtureHash: "sha256:y",
    nativele: { version: "0.7.1", commit: "abc", tgz: "sha256:z" },
    tools: { node: "24.0.0", npm: "11.0.0", vue: "3.5.44" },
    agent: { harness: "Claude Code 2.1", model: "m" },
    sandbox: "clean",
    checks: [{ name: "build", pass: true }],
    guesses: [],
    errors: [],
    result: "pending",
    ...over,
  });

  it("numbers the round after the last accepted record, ordering r10 after r2", () => {
    const dir = mkdtempSync(join(tmpdir(), "trial-rounds-"));
    try {
      const put = (name: string, result: string) => writeFileSync(join(dir, name), JSON.stringify({ result }));
      put("2026-11-08-r1.json", "gaps");
      put("2026-11-08-r2.json", "accepted");
      for (let r = 3; r <= 10; r++) put(`2026-11-08-r${r}.json`, "gaps");
      put("2026-11-09-r1.json", "gaps");
      expect(nextRound(dir)).toBe(10);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes nothing when the output an accept needs is missing", () => {
    const work = mkdtempSync(join(tmpdir(), "trial-accept-"));
    try {
      const out = join(work, "app", ".trial", "out");
      mkdirSync(out, { recursive: true });
      writeFileSync(join(work, "trial.json"), JSON.stringify({ skill: "nativele-vue", kind: "agent", project: "app", nativele: {} }));
      writeFileSync(join(out, "record.json"), JSON.stringify(record({})));
      writeFileSync(join(out, "package.json"), "{}");
      const results = join(TRIALS, "nativele-vue", "results");
      const before = existsSync(results) ? readdirSync(results) : [];
      expect(() => accept(work)).toThrow(/agent\.patch is missing/);
      expect(existsSync(results) ? readdirSync(results) : []).toEqual(before);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it("accepts only when every check passed and nothing is a gap, after everything is classified", () => {
    expect(judge(record({}))).toBe("accepted");
    expect(judge(record({ guesses: [{ where: "step 3", what: "w", class: "tool" }] }))).toBe("accepted");
    expect(judge(record({ errors: [{ error: "e", fix: "f", class: "gap" }] }))).toBe("gaps");
    expect(judge(record({ checks: [{ name: "build", pass: false }] }))).toBe("gaps");
    expect(() => judge(record({ guesses: [{ where: "step 3", what: "w", class: "" }] }))).toThrow(/classify/);
  });

  it("prints the trial comment with the gaps", () => {
    const fixture = readFixture("nativele-vue");
    const text = comment(record({ round: 2, result: "gaps", guesses: [{ where: "Set-up step 4", what: "where the tag list goes", class: "gap" }] }), fixture, "Build a thing.\n\n## Contract\n");
    expect(text).toContain("  round: 2\n");
    expect(text).toContain("  tools: vue@3.5.44\n");
    expect(text).toContain("  task: Build a thing.\n");
    expect(text).toContain('  gaps:\n    - "Set-up step 4: where the tag list goes"\n');
    expect(text.endsWith("  result: gaps sent back")).toBe(true);
  });

  it("renders the prompt from the task and the installed Skills", () => {
    const prompt = renderPrompt(readFileSync(join(TRIALS, "prompt.md"), "utf8"), "Do the task.\n", [".claude/skills/nativele-vue/SKILL.md"]);
    expect(prompt).toContain("Do the task.");
    expect(prompt).toContain("`.claude/skills/nativele-vue/SKILL.md`");
    expect(prompt).toContain(".trial/out/report.json");
    expect(prompt).not.toMatch(/\{\{/);
  });
});

describe("Impact detection", () => {
  const impact: Impact = { commands: { check: ["src/lib/check.ts"], gen: ["src/lib/codegen.ts"] }, imports: { "@nativele/ts-dom/vite": ["src/lib/vite-plugin.ts"] }, rules: { "unused-ref": ["src/lib/lint.ts"] } };
  const guide = "# Components\n\n## Slots\n\nSlot text.\n\n### Sub\n\nMore.\n\n## Other\n\nOther text.\n";

  it("reads a heading's section, and the whole file without an anchor", () => {
    expect(sectionOf(guide, "slots")).toBe("## Slots\n\nSlot text.\n\n### Sub\n\nMore.\n");
    expect(sectionOf(guide, "other")).toBe("## Other\n\nOther text.\n");
    expect(sectionOf(guide, "nope")).toBeNull();
    expect(sectionOf(guide)).toBe(guide);
    expect(sectionOf(null, "slots")).toBeNull();
  });

  it("finds the guides, commands and rules a Skill names", () => {
    const deps = skillDependencies(skillText("2026-11-01", "0.7.0"), impact);
    expect(deps.docs).toEqual([{ file: "docs/components.md", anchor: "slots" }, { file: "docs/lists.md" }]);
    expect(deps.names.map((n) => n.label)).toEqual(["ts-dom check", "[unused-ref]"]);
  });

  it("matches globs", () => {
    expect(globToRegExp("src/lib/check*.ts").test("src/lib/check-x.ts")).toBe(true);
    expect(globToRegExp("src/**/*.ts").test("src/a/b/c.ts")).toBe(true);
    expect(globToRegExp("src/**/*.ts").test("src/c.ts")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/a/c.ts")).toBe(false);
  });

  const run = (changed: string[], files: Record<string, string>, base: Record<string, string> = files, verified = "2026-11-01") => {
    const skill: Skill = { ...parseSkill(skillText(verified, "0.7.0"), "/d/nativele-x")!, dir: "/d/nativele-x" };
    const input: AffectedInput = {
      changed,
      skills: [skill],
      impact,
      version: "0.7.1",
      now: new Date("2026-11-10"),
      base: (p) => base[p] ?? null,
      head: (p) => files[p] ?? null,
      headFiles: (d) =>
        Object.keys(files)
          .filter((f) => f.startsWith(`${d}/`))
          .map((f) => f.slice(d.length + 1)),
    };
    return affected(input)[0]!;
  };
  const text = skillText("2026-11-01", "0.7.0");
  const head = {
    "skills/nativele-x/SKILL.md": text,
    "trials/nativele-x/fixture.json": "{}",
    "trials/nativele-x/last-pass/agent.patch": "diff",
    "docs/components.md": guide,
  };

  it("replays on a library change and asks for no trial when nothing the Skill names changed", () => {
    expect(run(["src/lib/component.ts"], head)).toMatchObject({ replay: true, trial: [] });
    expect(run(["README.md"], head)).toMatchObject({ replay: false, trial: [] });
    expect(run(["src/lib/component.ts"], { ...head, "trials/nativele-x/last-pass/agent.patch": undefined } as unknown as Record<string, string>).replay).toBe(false);
  });

  it("asks for an agent trial for each kind of impact", () => {
    expect(run(["skills/nativele-x/SKILL.md"], { ...head, "skills/nativele-x/SKILL.md": `${text}A new step.\n` }, head).trial).toEqual(["SKILL.md changed"]);
    expect(run(["skills/nativele-x/SKILL.md"], { ...head, "skills/nativele-x/SKILL.md": stampSkill(text, "2026-11-08", "0.7.1") }, head).trial).toEqual([]);
    expect(run(["src/lib/check.ts"], head).trial).toEqual(["ts-dom check changed (src/lib/check.ts)"]);
    expect(run(["src/lib/lint.ts"], head).trial).toEqual(["[unused-ref] changed (src/lib/lint.ts)"]);
    const edited = guide.replace("Slot text.", "Slot text, changed.");
    expect(run(["docs/components.md"], { ...head, "docs/components.md": edited }, head).trial).toEqual(["docs/components.md#slots changed"]);
    expect(run(["docs/components.md"], { ...head, "docs/components.md": guide.replace("Other text.", "Changed.") }, head).trial).toEqual([]);
    expect(run(["trials/nativele-x/task.md"], head)).toMatchObject({ replay: true, trial: ["fixture.json or task.md changed"] });
    expect(run([], head, head, "2026-01-01").trial[0]).toMatch(/^stale: /);
  });

  it("reports whether the current SKILL.md has an accepted record for its verified date", () => {
    const rec = (hash: string, date: string) => JSON.stringify({ kind: "agent", result: "accepted", skillHash: hash, date });
    expect(run([], { ...head, "trials/nativele-x/results/2026-11-01-r1.json": rec(skillHash(text), "2026-11-01") }).accepted).toBe(true);
    expect(run([], { ...head, "trials/nativele-x/results/2026-11-01-r1.json": rec("sha256:old", "2026-11-01") }).accepted).toBe(false);
    expect(run([], { ...head, "trials/nativele-x/results/2026-10-01-r1.json": rec(skillHash(text), "2026-10-01") }).accepted).toBe(false);
  });
});
