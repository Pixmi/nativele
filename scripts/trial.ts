// Skill trials: a fixed project, a fixed task and independent checks around one agent run (skills/README.md, "How a Skill pull request is accepted").
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inRange, listSkills, parseSkill, skillsRoot, staleReason } from "../src/lib/skills.ts";
import type { Skill } from "../src/lib/skills.ts";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TRIALS = join(REPO, "trials");

const USAGE = `npm run trial -- <command>

  prepare <skill> [--work=<dir>]   pack the library, build the fixture's starter project, install the pinned tools,
                                   the package and the Skill, render .trial/prompt.md, commit the baseline
  agent <work>                     run the agent in the prepared project (TRIAL_AGENT_CMD, default Claude Code)
  check <work>                     save the agent's output, copy the probes, run the checks and the browser check,
                                   scan the transcript, write .trial/out/record.json
  run <skill> [--work=<dir>]       prepare, agent and check
  replay <skill> [--work=<dir>]    the fixture's last accepted agent output on a fresh project with the current package
  accept <work>                    after classifying every guess and error in the record: store it under
                                   trials/<skill>/results/, and when accepted, last-pass/ and the Skill's verified date
  comment <record>                 print a record as the trial comment for the pull request
  affected --base=<sha> --head=<sha> [--json]   the Skills that need a replay or an agent trial`;

export interface Fixture {
  skill: string;
  node: string;
  start: { command: string; dir: string; buildOnce: string };
  install: string[];
  skills: string[];
  contract: { tags: string[]; entry: string };
  probes: { from: string; to: string }[];
  checks: { name: string; run: string; exit: number; stdout?: string }[];
  browser?: { serve: string; url: string; script: string; failOn: string[] };
}

export interface TrialCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface Classified {
  class: "" | "covered" | "tool" | "gap";
}

export interface TrialRecord {
  kind: "agent" | "replay";
  skill: string;
  round?: number;
  date: string;
  skillHash: string;
  fixtureHash: string;
  nativele: { version: string; commit: string; tgz: string };
  tools: Record<string, string>;
  agent?: { harness: string; model: string };
  sandbox: "clean" | "violated" | "unchecked";
  violations?: string[];
  checks: TrialCheck[];
  guesses: ({ where: string; what: string; source?: string } & Classified)[];
  errors: ({ error: string; fix: string } & Classified)[];
  result: "accepted" | "gaps" | "pending";
}

interface WorkState {
  skill: string;
  kind: "agent" | "replay";
  project: string;
  nativele: TrialRecord["nativele"];
  agent?: TrialRecord["agent"];
}

const sha256 = (data: string | Buffer) => `sha256:${createHash("sha256").update(data).digest("hex")}`;
const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
const writeJson = (file: string, value: unknown) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const say = (text: string) => console.log(`trial: ${text}`);

function sh(command: string, cwd: string, options: { capture?: boolean; env?: Record<string, string> } = {}): { status: number; output: string } {
  if (!options.capture) say(`$ ${command}`);
  const r = spawnSync("bash", ["-c", command], {
    cwd,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status ?? 1, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function must(command: string, cwd: string): void {
  if (sh(command, cwd).status !== 0) throw new Error(`failed: ${command} (in ${cwd})`);
}

const git = (cwd: string, args: string) => sh(`git -c user.name=trial -c user.email=trial@localhost -c commit.gpgsign=false ${args}`, cwd, { capture: true });

export function fixtureDir(skill: string): string {
  return join(TRIALS, skill);
}

export function readFixture(skill: string): Fixture {
  const file = join(fixtureDir(skill), "fixture.json");
  if (!existsSync(file)) throw new Error(`${skill} has no fixture: ${relative(REPO, file)} does not exist`);
  return readJson<Fixture>(file);
}

/** Every file of a fixture folder, relative to it, sorted. */
export function fixtureFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (sub: string) => {
    for (const e of readdirSync(join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel);
      else out.push(rel);
    }
  };
  walk("");
  return out.sort();
}

/** The fixture's own material, without its records and stored agent output. */
export function fixtureHash(dir: string): string {
  const files = fixtureFiles(dir).filter((f) => !/^(results|last-pass)\//.test(f));
  return sha256(files.map((f) => `${f}\0${readFileSync(join(dir, f), "utf8")}\0`).join(""));
}

const VERIFIED_LINE = /^(\s*verified:\s*)"?\d{4}-\d{2}-\d{2}"?\s*$/m;
const VERSION_ROW = /^\| @nativele\/ts-dom \| \S+ \(the last agent trial\) \|$/m;
const VERIFIED_ON = /Verified on \d{4}-\d{2}-\d{2}/;

/** The Skill text a trial tested, without what `accept` stamps into it, so stamping does not change the hash. */
export function skillHash(text: string): string {
  return sha256(text.replace(VERIFIED_LINE, "$1").replace(VERSION_ROW, "| @nativele/ts-dom |").replace(VERIFIED_ON, "Verified on"));
}

export function stampSkill(text: string, date: string, version: string): string {
  return text
    .replace(VERIFIED_LINE, `$1"${date}"`)
    .replace(VERSION_ROW, `| @nativele/ts-dom | ${version} (the last agent trial) |`)
    .replace(VERIFIED_ON, `Verified on ${date}`);
}

export function renderPrompt(template: string, task: string, skillPaths: string[]): string {
  return template.replace("{{task}}", task.trim()).replace("{{skills}}", skillPaths.map((p) => `\`${p}\``).join(", "));
}

const FORBIDDEN_DIST = /@nativele\/ts-dom\/dist\b/;
const GITHUB = /(?:github\.com|githubusercontent\.com)\/Pixmi\/nativele\b[^\s"'\\)]*/gi;
const GITHUB_ALLOWED = /\/Pixmi\/nativele\/(?:(?:blob|tree|raw)\/)?[^/\s]+\/(?:docs|skills)\//i;

/** The forbidden sources a tool call's arguments name: the repository, the packed build, Nativele on GitHub outside docs/ and skills/. */
export function forbiddenIn(text: string, repo: string): string[] {
  const hits: string[] = [];
  if (text.includes(repo)) hits.push(`the repository (${repo})`);
  if (FORBIDDEN_DIST.test(text)) hits.push("node_modules/@nativele/ts-dom/dist");
  for (const m of text.matchAll(GITHUB)) if (!GITHUB_ALLOWED.test(m[0])) hits.push(m[0]);
  return hits;
}

/** Tool calls in a transcript: Claude Code's stream-json `tool_use` blocks, or any line object with a tool name and input. */
export function toolCalls(transcript: string): { name: string; input: string }[] {
  const calls: { name: string; input: string }[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const name = o.type === "tool_use" ? o.name : (o.tool_name ?? o.tool);
    const input = o.input ?? o.arguments ?? o.tool_input;
    if (typeof name === "string" && input !== undefined) calls.push({ name, input: typeof input === "string" ? input : JSON.stringify(input) });
    else Object.values(o).forEach(visit);
  };
  for (const line of transcript.split("\n")) {
    if (!line.trim()) continue;
    try {
      visit(JSON.parse(line));
    } catch {
      /* not a JSON line */
    }
  }
  return calls;
}

export function scanSandbox(transcript: string | null, sources: string[], repo: string): { sandbox: TrialRecord["sandbox"]; violations: string[] } {
  const violations = sources.flatMap((s) => forbiddenIn(s, repo).map((h) => `report sources: ${h}`));
  const calls = transcript ? toolCalls(transcript) : [];
  for (const c of calls) for (const h of forbiddenIn(c.input, repo)) violations.push(`${c.name}: ${h}`);
  if (violations.length) return { sandbox: "violated", violations };
  return { sandbox: calls.length ? "clean" : "unchecked", violations };
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const s = createServer();
    s.on("error", fail);
    s.listen(0, () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => done(port));
    });
  });
}

function workState(work: string): WorkState {
  const file = join(work, "trial.json");
  if (!existsSync(file)) throw new Error(`${work} is not a prepared trial folder (no trial.json); run prepare first`);
  return readJson<WorkState>(file);
}

function pack(work: string): TrialRecord["nativele"] {
  must("npm run build:lib", REPO);
  const out = sh(`npm pack --ignore-scripts --json --pack-destination ${JSON.stringify(work)}`, REPO, { capture: true });
  if (out.status !== 0) throw new Error(`npm pack failed:\n${out.output}`);
  const [{ filename, version }] = JSON.parse(out.output.slice(out.output.indexOf("["))) as [{ filename: string; version: string }];
  const tgz = join(work, "nativele-ts-dom.tgz");
  renameSync(join(work, filename), tgz);
  const dirty = git(REPO, "status --porcelain").output.trim() !== "";
  return { version, commit: `${git(REPO, "rev-parse --short HEAD").output.trim()}${dirty ? "-dirty" : ""}`, tgz: sha256(readFileSync(tgz)) };
}

/** What every trial project has besides the starter and its packages: the Skills, the agent's settings, the prompt, the baseline commit. */
function finishProject(project: string, fixture: Fixture): void {
  mkdirSync(join(project, ".claude"), { recursive: true });
  const repoGlob = `/${REPO}/**`;
  writeJson(join(project, ".claude", "settings.json"), {
    permissions: {
      allow: ["Bash", "Read", "Edit", "Write", "Glob", "Grep", "WebFetch", "WebSearch"],
      deny: [`Read(${repoGlob})`, `Edit(${repoGlob})`, "Read(./node_modules/@nativele/ts-dom/dist/**)"],
    },
  });
  must(`npx ts-dom skills add ${fixture.skills.join(" ")}`, project);
  mkdirSync(join(project, ".trial", "out"), { recursive: true });
  const task = readFileSync(join(fixtureDir(fixture.skill), "task.md"), "utf8");
  const prompt = renderPrompt(readFileSync(join(TRIALS, "prompt.md"), "utf8"), task, fixture.skills.map((s) => `.claude/skills/${s}/SKILL.md`));
  writeFileSync(join(project, ".trial", "prompt.md"), prompt);
  if (!existsSync(join(project, ".git"))) git(project, "init -q");
  writeFileSync(join(project, ".git", "info", "exclude"), ".trial/\nnode_modules/\ndist/\n");
  git(project, "add -A");
  const commit = git(project, "commit -q -m baseline");
  if (commit.status !== 0) throw new Error(`baseline commit failed:\n${commit.output}`);
  git(project, "tag baseline");
}

function newWork(skill: string, flag: string | undefined): string {
  const work = resolve(flag ?? join(tmpdir(), "nativele-trials", `${skill}-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}`));
  if (existsSync(work) && readdirSync(work).length) throw new Error(`${work} is not empty`);
  if (work.startsWith(`${REPO}/`)) throw new Error("the trial folder must be outside the repository, so the agent cannot reach it by relative paths");
  mkdirSync(work, { recursive: true });
  return work;
}

export function prepare(skill: string, workFlag?: string): string {
  const fixture = readFixture(skill);
  const work = newWork(skill, workFlag);
  const nativele = pack(work);
  must(fixture.start.command, work);
  const project = join(work, fixture.start.dir);
  must("npm install", project);
  must(fixture.start.buildOnce, project);
  const deps = readJson<{ dependencies?: Record<string, string> }>(join(project, "package.json")).dependencies ?? {};
  const pinned = fixture.install.filter((spec) => spec.slice(0, spec.lastIndexOf("@")) in deps);
  const dev = fixture.install.filter((spec) => !pinned.includes(spec));
  if (pinned.length) must(`npm i -E ${pinned.join(" ")}`, project);
  if (dev.length) must(`npm i -E -D ${dev.join(" ")}`, project);
  must("npm i ../nativele-ts-dom.tgz", project);
  finishProject(project, fixture);
  writeJson(join(work, "trial.json"), { skill, kind: "agent", project: fixture.start.dir, nativele } satisfies WorkState);
  say(`prepared ${work}`);
  say(`the agent works in ${project} with the prompt in .trial/prompt.md; then: npm run trial -- check ${work}`);
  return work;
}

export function replayPrepare(skill: string, workFlag?: string): string {
  const fixture = readFixture(skill);
  const last = join(fixtureDir(skill), "last-pass");
  for (const f of ["agent.patch", "package.json", "package-lock.json"]) if (!existsSync(join(last, f))) throw new Error(`${skill} has no accepted agent output to replay (${relative(REPO, last)}/${f} is missing)`);
  const work = newWork(skill, workFlag);
  const nativele = pack(work);
  must(fixture.start.command, work);
  const project = join(work, fixture.start.dir);
  copyFileSync(join(last, "package.json"), join(project, "package.json"));
  const lock = readJson<{ packages: Record<string, { version?: string; integrity?: string }> }>(join(last, "package-lock.json"));
  const entry = lock.packages["node_modules/@nativele/ts-dom"];
  if (entry) {
    delete entry.integrity;
    entry.version = nativele.version;
  }
  writeJson(join(project, "package-lock.json"), lock);
  must("npm ci", project);
  finishProject(project, fixture);
  const applied = git(project, `apply --whitespace=nowarn ${JSON.stringify(join(last, "agent.patch"))}`);
  if (applied.status !== 0) throw new Error(`the stored agent output no longer applies to the starter (a fixture change: run an agent trial):\n${applied.output}`);
  writeJson(join(work, "trial.json"), { skill, kind: "replay", project: fixture.start.dir, nativele } satisfies WorkState);
  return work;
}

export function agent(work: string): number {
  const state = workState(work);
  const project = join(work, state.project);
  const custom = process.env.TRIAL_AGENT_CMD;
  const model = process.env.TRIAL_MODEL;
  const command = custom ?? `claude -p${model ? ` --model ${JSON.stringify(model)}` : ""} --output-format stream-json --verbose`;
  const harness =
    process.env.TRIAL_HARNESS ?? (custom ? `custom: ${custom}` : `Claude Code ${sh("claude --version", project, { capture: true }).output.trim().replace(/ \(Claude Code\)$/, "")}`);
  state.agent = { harness, model: model ?? "default" };
  writeJson(join(work, "trial.json"), state);
  say(`$ ${command} < .trial/prompt.md > .trial/out/transcript.jsonl`);
  const stdin = openSync(join(project, ".trial", "prompt.md"), "r");
  const stdout = openSync(join(project, ".trial", "out", "transcript.jsonl"), "w");
  const r = spawnSync("bash", ["-c", command], { cwd: project, stdio: [stdin, stdout, "inherit"], env: { ...process.env, TRIAL_PROJECT: project } });
  closeSync(stdin);
  closeSync(stdout);
  say(`the agent exited with ${r.status}`);
  return r.status ?? 1;
}

const PATCH_EXCLUDES = ["package.json", "package-lock.json", ".claude", "node_modules", "dist", "**/*.html.ts", "**/ts-dom-tags.ts"];

function saveOutput(project: string): void {
  const out = join(project, ".trial", "out");
  git(project, "add -A");
  const diff = git(project, `diff --cached --binary baseline -- . ${PATCH_EXCLUDES.map((p) => `':(exclude,glob)${p}'`).join(" ")}`);
  writeFileSync(join(out, "agent.patch"), diff.output);
  copyFileSync(join(project, "package.json"), join(out, "package.json"));
  if (existsSync(join(project, "package-lock.json"))) copyFileSync(join(project, "package-lock.json"), join(out, "package-lock.json"));
}

function installedTools(project: string, fixture: Fixture): Record<string, string> {
  const ls = readJson<{ dependencies?: Record<string, { version?: string }> }>(join(project, ".trial", "out", "npm-ls.json"));
  const tools: Record<string, string> = { node: process.version.slice(1), npm: sh("npm -v", project, { capture: true }).output.trim() };
  for (const spec of fixture.install) {
    const name = spec.slice(0, spec.lastIndexOf("@"));
    tools[name] = ls.dependencies?.[name]?.version ?? "not installed";
  }
  return tools;
}

interface BrowserRun {
  checks: number;
  failures: string[];
}

async function runBrowser(project: string, fixture: Fixture, log: (line: string) => void): Promise<BrowserRun> {
  const spec = fixture.browser!;
  const port = await freePort();
  const fill = (s: string) => s.replaceAll("{port}", String(port));
  const url = fill(spec.url);
  const server = spawn("bash", ["-c", fill(spec.serve)], { cwd: project, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (d: Buffer) => log(`[server] ${d.toString().trimEnd()}`));
  server.stderr.on("data", (d: Buffer) => log(`[server] ${d.toString().trimEnd()}`));
  const stop = () => {
    try {
      if (server.pid) process.kill(-server.pid, "SIGTERM");
    } catch {
      /* already finished */
    }
  };
  const failures: string[] = [];
  let checks = 0;
  const { launchChrome } = await import("../browser/server.ts");
  let browser: Awaited<ReturnType<typeof launchChrome>> | undefined;
  try {
    let up = false;
    for (let i = 0; i < 300 && !up; i++) {
      up = await fetch(url).then(
        (r) => r.ok,
        () => false,
      );
      if (!up) await new Promise((r) => setTimeout(r, 200));
    }
    if (!up) return { checks, failures: [`the server did not answer at ${url}`] };
    browser = await launchChrome();
    const page = await browser.newPage();
    const failOn = (kind: string, text: string) =>
      spec.failOn.some((f) => {
        const [k, pattern] = f.split(/:(.*)/s);
        return k === kind && (pattern === undefined || new RegExp(pattern).test(text));
      });
    page.on("pageerror", (e) => {
      log(`[pageerror] ${e.message}`);
      if (failOn("pageerror", e.message)) failures.push(`page error: ${e.message}`);
    });
    page.on("console", (m) => {
      log(`[console.${m.type()}] ${m.text()}`);
      const kind = m.type() === "warning" ? "console.warn" : `console.${m.type()}`;
      if (failOn(kind, m.text())) failures.push(`${kind}: ${m.text()}`);
    });
    await page.goto(url);
    const script = (await import(pathToFileURL(join(fixtureDir(fixture.skill), spec.script)).href)) as {
      default: (b: { page: typeof page; check: (name: string, ok: boolean, detail?: unknown) => void }) => Promise<void>;
    };
    const check = (name: string, ok: boolean, detail?: unknown) => {
      checks++;
      log(`${ok ? "ok" : "FAIL"} ${name}${ok || detail === undefined ? "" : ` (actual: ${JSON.stringify(detail)})`}`);
      if (!ok) failures.push(`${name}${detail === undefined ? "" : ` (actual: ${JSON.stringify(detail)})`}`);
    };
    try {
      await script.default({ page, check });
    } catch (e) {
      failures.push(`the browser check stopped: ${(e as Error).message.split("\n")[0]}`);
    }
    await page.waitForTimeout(300);
  } finally {
    await browser?.close();
    stop();
  }
  return { checks, failures };
}

export async function check(work: string): Promise<TrialRecord> {
  const state = workState(work);
  const fixture = readFixture(state.skill);
  const project = join(work, state.project);
  const out = join(project, ".trial", "out");
  mkdirSync(out, { recursive: true });
  if (state.kind === "agent") saveOutput(project);
  for (const p of fixture.probes) {
    mkdirSync(dirname(join(project, p.to)), { recursive: true });
    copyFileSync(join(fixtureDir(fixture.skill), p.from), join(project, p.to));
  }
  writeFileSync(join(out, "npm-ls.json"), sh("npm ls --json --depth=0", project, { capture: true }).output.replace(/^[^{]*/, ""));
  const checksLog = join(out, "checks.log");
  writeFileSync(checksLog, "");
  const results: TrialCheck[] = [];
  for (const c of fixture.checks) {
    say(`check: ${c.name}: ${c.run}`);
    const r = sh(c.run, project, { capture: true });
    appendFileSync(checksLog, `$ ${c.run}\n${r.output}\n[exit ${r.status}]\n\n`);
    const expected = c.stdout?.startsWith("/") ? new RegExp(c.stdout.slice(1, c.stdout.lastIndexOf("/"))).test(r.output) : r.output.includes(c.stdout ?? "");
    const pass = r.status === c.exit && expected;
    const tail = r.output.trim().split("\n").slice(-15).join("\n");
    results.push(pass ? { name: c.name, pass } : { name: c.name, pass, detail: `exit ${r.status} (expected ${c.exit})${expected ? "" : `, output lacks ${JSON.stringify(c.stdout)}`}:\n${tail}` });
    say(`  ${pass ? "pass" : "FAIL"}`);
  }
  if (fixture.browser) {
    const browserLog = join(out, "browser.log");
    writeFileSync(browserLog, "");
    say(`check: browser: ${fixture.browser.script}`);
    const b = await runBrowser(project, fixture, (line) => appendFileSync(browserLog, `${line}\n`));
    const pass = b.failures.length === 0;
    results.push({ name: "browser", pass, detail: pass ? `${b.checks} checks, no console errors` : b.failures.join("\n") });
    say(`  ${pass ? "pass" : "FAIL"} (${b.checks} checks${pass ? "" : `; ${b.failures.length} failures, see ${relative(work, browserLog)}`})`);
  }
  const reportFile = join(out, "report.json");
  const report = existsSync(reportFile) ? readJson<{ guesses?: TrialRecord["guesses"]; errors?: TrialRecord["errors"]; sources?: string[] }>(reportFile) : {};
  const transcriptFile = join(out, "transcript.jsonl");
  const scan =
    state.kind === "agent"
      ? scanSandbox(existsSync(transcriptFile) ? readFileSync(transcriptFile, "utf8") : null, report.sources ?? [], REPO)
      : { sandbox: "unchecked" as const, violations: [] };
  const record: TrialRecord = {
    kind: state.kind,
    skill: state.skill,
    date: today(),
    skillHash: skillHash(readFileSync(join(project, ".claude", "skills", state.skill, "SKILL.md"), "utf8")),
    fixtureHash: fixtureHash(fixtureDir(state.skill)),
    nativele: state.nativele,
    tools: installedTools(project, fixture),
    ...(state.agent ? { agent: state.agent } : {}),
    sandbox: scan.sandbox,
    ...(scan.violations.length ? { violations: scan.violations } : {}),
    checks: results,
    guesses: (report.guesses ?? []).map((g) => ({ ...g, class: "" })),
    errors: (report.errors ?? []).map((e) => ({ ...e, class: "" })),
    result: "pending",
  };
  writeJson(join(out, "record.json"), record);
  const failed = results.filter((r) => !r.pass);
  say(`${failed.length ? `${failed.length} of ${results.length} checks failed` : `all ${results.length} checks passed`}; sandbox ${record.sandbox}; record ${join(out, "record.json")}`);
  for (const f of failed) say(`  FAIL ${f.name}: ${f.detail}`);
  if (state.kind === "agent") say(`next: classify every guess and error in the record (covered | tool | gap), then npm run trial -- accept ${work}`);
  return record;
}

/** The trial round: one more than the records stored since the last accepted one. */
export function nextRound(resultsDir: string): number {
  if (!existsSync(resultsDir)) return 1;
  const records = readdirSync(resultsDir)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => {
      const [, da = "", ra = "0"] = /^(.*)-r(\d+)\.json$/.exec(a) ?? [];
      const [, db = "", rb = "0"] = /^(.*)-r(\d+)\.json$/.exec(b) ?? [];
      return da.localeCompare(db) || Number(ra) - Number(rb) || a.localeCompare(b);
    })
    .map((f) => readJson<TrialRecord>(join(resultsDir, f)));
  const last = records.map((r) => r.result).lastIndexOf("accepted");
  return records.length - last;
}

export function acceptedRecords(skill: string): TrialRecord[] {
  const dir = join(fixtureDir(skill), "results");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<TrialRecord>(join(dir, f)))
    .filter((r) => r.kind === "agent" && r.result === "accepted");
}

/** The result a classified record earns: accepted only when every check passed and nothing is a gap. */
export function judge(record: TrialRecord): TrialRecord["result"] {
  const items = [...record.guesses, ...record.errors];
  const unclassified = items.filter((i) => !["covered", "tool", "gap"].includes(i.class));
  if (unclassified.length) throw new Error(`classify every guess and error first (covered | tool | gap); ${unclassified.length} have no class`);
  return record.checks.every((c) => c.pass) && !items.some((i) => i.class === "gap") ? "accepted" : "gaps";
}

export interface Roots {
  trials: string;
  skills: string;
}

export function accept(work: string, roots: Roots = { trials: TRIALS, skills: skillsRoot() }): string {
  const state = workState(work);
  const project = join(work, state.project);
  const out = join(project, ".trial", "out");
  const record = readJson<TrialRecord>(join(out, "record.json"));
  if (record.kind !== "agent") throw new Error("only an agent trial can be accepted; a replay is not stored");
  if (record.sandbox === "violated") throw new Error(`the agent used forbidden sources, so this trial cannot be accepted; run it again:\n${record.violations?.join("\n")}`);
  record.result = judge(record);
  const accepted = record.result === "accepted";
  if (accepted) {
    for (const f of ["agent.patch", "package.json"]) if (!existsSync(join(out, f))) throw new Error(`${join(out, f)} is missing; run check again`);
    if (!existsSync(join(out, "package-lock.json"))) throw new Error(`${join(out, "package-lock.json")} is missing: an accepted trial must carry a lockfile so a replay installs the same versions; commit one in the project, then run check again`);
  }
  const skillFile = join(roots.skills, record.skill, "SKILL.md");
  const skillText = readFileSync(skillFile, "utf8");
  const skill = parseSkill(skillText, dirname(skillFile));
  if (accepted) {
    if (skillHash(skillText) !== record.skillHash) throw new Error(`${skillFile} changed after the trial; run a new trial on the current text`);
    if (!skill || !inRange(record.nativele.version, skill.nativele)) throw new Error(`${record.nativele.version} is outside the Skill's nativele range; change the range first`);
  }
  const fixture = join(roots.trials, record.skill);
  const resultsDir = join(fixture, "results");
  record.round = nextRound(resultsDir);
  const file = join(resultsDir, `${record.date}-r${record.round}.json`);
  if (existsSync(file)) throw new Error(`${file} already exists`);
  const outputs: { target: string; data: string | Buffer }[] = [];
  if (accepted) {
    const last = join(fixture, "last-pass");
    for (const f of ["agent.patch", "package.json", "package-lock.json"]) outputs.push({ target: join(last, f), data: readFileSync(join(out, f)) });
    outputs.push({ target: skillFile, data: stampSkill(skillText, record.date, record.nativele.version) });
  }
  outputs.push({ target: file, data: `${JSON.stringify(record, null, 2)}\n` });
  const staged = outputs.map((o) => ({ ...o, temp: `${o.target}.tmp-${process.pid}` }));
  try {
    for (const o of staged) {
      mkdirSync(dirname(o.target), { recursive: true });
      writeFileSync(o.temp, o.data);
    }
    for (const o of staged) renameSync(o.temp, o.target);
  } finally {
    for (const o of staged) rmSync(o.temp, { force: true });
  }
  if (accepted) say(`updated ${relative(roots.trials, join(fixture, "last-pass"))}/ and the verified date of ${relative(roots.skills, skillFile)}`);
  say(`stored ${relative(roots.trials, file)} (${record.result})`);
  return file;
}

const yamlString = (s: string) => (/^[\w./@:+ -]+$/.test(s) && !/^[\d-]+$/.test(s) && !s.includes(": ") ? s : JSON.stringify(s));

export function comment(record: TrialRecord, fixture: Fixture, task: string): string {
  const summary = task.split(/\n\s*\n/)[0]!.trim().replace(/\s+/g, " ");
  const gaps = [...record.guesses.map((g) => ({ text: `${g.where}: ${g.what}`, cls: g.class })), ...record.errors.map((e) => ({ text: `${e.error} (fix: ${e.fix})`, cls: e.class }))].filter(
    (g) => g.cls === "gap",
  );
  const lines = [
    "trial:",
    `  skill: ${record.skill}`,
    `  round: ${record.round ?? "pending"}`,
    `  date: ${record.date}`,
    `  nativele: ${record.nativele.version}`,
    `  tools: ${Object.entries(record.tools)
      .filter(([k]) => k !== "node" && k !== "npm")
      .map(([k, v]) => `${k}@${v}`)
      .join(" ")}`,
    `  agent: ${yamlString(record.agent?.harness ?? "unknown")}`,
    `  model: ${yamlString(record.agent?.model ?? "unknown")}`,
    `  sandbox: ${record.sandbox}`,
    `  start: ${yamlString(`${fixture.start.command}, built once before Nativele was added`)}`,
    `  task: ${yamlString(summary)}`,
    "  verify:",
    ...record.checks.map((c) => `    ${yamlString(c.name)}: ${yamlString(c.pass ? (c.detail ?? "pass") : `FAIL ${(c.detail ?? "").split("\n")[0]}`)}`),
    gaps.length ? "  gaps:" : "  gaps: []",
    ...gaps.map((g) => `    - ${yamlString(g.text)}`),
    `  result: ${record.result === "accepted" ? "accepted" : record.result === "gaps" ? "gaps sent back" : "pending"}`,
  ];
  return lines.join("\n");
}

export interface Impact {
  commands: Record<string, string[]>;
  imports: Record<string, string[]>;
  rules: Record<string, string[]>;
}

export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      re += glob[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += glob[i + 2] === "/" ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

const slug = (heading: string) =>
  heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*~]|<[^>]+>/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");

/** The text of the section a heading anchor names, up to the next heading of the same or a higher level; the whole file without an anchor. */
export function sectionOf(markdown: string | null, anchor?: string): string | null {
  if (markdown === null || !anchor) return markdown;
  const lines = markdown.split("\n");
  let fence = false;
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^(```|~~~)/.test(line)) fence = !fence;
    const h = fence ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!h) continue;
    if (start >= 0 && h[1]!.length <= level) return lines.slice(start, i).join("\n");
    if (start < 0 && slug(h[2]!) === anchor) {
      start = i;
      level = h[1]!.length;
    }
  }
  return start >= 0 ? lines.slice(start).join("\n") : null;
}

/** What a Skill depends on, read from its text: linked guide sections, and the commands, entry points and rule ids it names. */
export function skillDependencies(text: string, impact: Impact): { docs: { file: string; anchor?: string }[]; names: { label: string; globs: string[] }[] } {
  const docs = new Map<string, { file: string; anchor?: string }>();
  for (const m of text.matchAll(/(?<![\w/])(?:https:\/\/github\.com\/Pixmi\/nativele\/blob\/main\/|(?:\.\.\/)+)?(docs\/[\w.-]+\.md)(?:#([\w-]+))?/g))
    docs.set(`${m[1]}#${m[2] ?? ""}`, m[2] ? { file: m[1]!, anchor: m[2] } : { file: m[1]! });
  const names: { label: string; globs: string[] }[] = [];
  for (const [cmd, globs] of Object.entries(impact.commands)) if (new RegExp(`\\bts-dom ${cmd}\\b`).test(text)) names.push({ label: `ts-dom ${cmd}`, globs });
  for (const [entry, globs] of Object.entries(impact.imports)) if (text.includes(entry)) names.push({ label: entry, globs });
  for (const [id, globs] of Object.entries(impact.rules)) if (new RegExp(`(?:\\[${id}\\]|ts-dom/${id}\\b|--(?:ignore|explain)=${id}\\b)`).test(text)) names.push({ label: `[${id}]`, globs });
  return { docs: [...docs.values()], names };
}

export interface AffectedRow {
  skill: string;
  tier: Skill["tier"];
  fixture: boolean;
  lastPass: boolean;
  accepted: boolean;
  replay: boolean;
  trial: string[];
}

export interface AffectedInput {
  changed: string[];
  skills: Skill[];
  impact: Impact;
  version: string;
  now: Date;
  /** A file's text at the base of the change; null when it did not exist. */
  base: (path: string) => string | null;
  /** A file's text at the head of the change; null when it does not exist. */
  head: (path: string) => string | null;
  /** The names of the files in a folder at the head of the change. */
  headFiles: (dir: string) => string[];
}

export function affected(input: AffectedInput): AffectedRow[] {
  const { changed } = input;
  const touched = (globs: string[]) => {
    const res = globs.map(globToRegExp);
    return changed.filter((f) => res.some((r) => r.test(f)));
  };
  const libraryChanged = changed.some((f) => /^(src\/|package(-lock)?\.json$|scripts\/trial\.ts$|browser\/server\.ts$)/.test(f));
  return input.skills.map((s) => {
    const skillPath = `skills/${s.name}/SKILL.md`;
    const trialsPath = `trials/${s.name}`;
    const text = input.head(skillPath) ?? "";
    const before = input.base(skillPath);
    const hasFixture = input.head(`${trialsPath}/fixture.json`) !== null;
    const lastPass = input.head(`${trialsPath}/last-pass/agent.patch`) !== null;
    const reasons: string[] = [];
    if (before === null) reasons.push("new Skill");
    else if (skillHash(before) !== skillHash(text)) reasons.push("SKILL.md changed");
    const deps = skillDependencies(text, input.impact);
    for (const d of deps.docs) {
      if (!changed.includes(d.file)) continue;
      if (sectionOf(input.base(d.file), d.anchor) !== sectionOf(input.head(d.file), d.anchor)) reasons.push(`${d.file}${d.anchor ? `#${d.anchor}` : ""} changed`);
    }
    for (const n of deps.names) {
      const files = touched(n.globs);
      if (files.length) reasons.push(`${n.label} changed (${files.join(", ")})`);
    }
    if (changed.some((f) => f === `${trialsPath}/fixture.json` || f === `${trialsPath}/task.md`)) reasons.push("fixture.json or task.md changed");
    const stale = s.tier === "experimental" ? null : staleReason(s, input.version, input.now);
    if (stale) reasons.push(`stale: ${stale}`);
    const fixtureChanged = changed.some((f) => f.startsWith(`${trialsPath}/`) && !f.startsWith(`${trialsPath}/results/`));
    const hash = skillHash(text);
    const accepted = input
      .headFiles(`${trialsPath}/results`)
      .filter((f) => f.endsWith(".json"))
      .some((f) => {
        const r = JSON.parse(input.head(`${trialsPath}/results/${f}`) ?? "{}") as Partial<TrialRecord>;
        return r.kind === "agent" && r.result === "accepted" && r.skillHash === hash && r.date === s.verified;
      });
    return { skill: s.name, tier: s.tier, fixture: hasFixture, lastPass, accepted, replay: lastPass && (libraryChanged || fixtureChanged), trial: reasons };
  });
}

export function affectedTable(rows: AffectedRow[]): string {
  const shown = rows.filter((r) => r.replay || r.trial.length);
  if (!shown.length) return "No Skill needs a replay or an agent trial for this change.";
  const yes = (b: boolean) => (b ? "yes" : "no");
  return [
    "| Skill | Replay | Agent trial needed because | Fixture | Accepted record for the current SKILL.md |",
    "|---|---|---|---|---|",
    ...shown.map((r) => `| \`${r.skill}\` | ${r.replay ? "yes" : "-"} | ${r.trial.join("; ") || "-"} | ${yes(r.fixture)} | ${yes(r.accepted)} |`),
  ].join("\n");
}

function gitFiles(ref: string, dir: string): string[] {
  const r = spawnSync("git", ["ls-tree", "--name-only", ref, `${dir}/`], { cwd: REPO, encoding: "utf8" });
  return r.status === 0 ? r.stdout.split("\n").filter(Boolean).map((f) => f.slice(dir.length + 1)) : [];
}

function gitText(ref: string, path: string): string | null {
  const r = spawnSync("git", ["show", `${ref}:${path}`], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

function runAffected(base: string, head: string): AffectedRow[] {
  const diff = sh(`git diff --name-only ${base}...${head}`, REPO, { capture: true });
  if (diff.status !== 0) throw new Error(`git diff failed:\n${diff.output}`);
  const skills = listSkills(skillsRoot()).map((s) => parseSkill(gitText(head, `skills/${s.name}/SKILL.md`) ?? "", s.dir) ?? s);
  return affected({
    changed: diff.output.split("\n").filter(Boolean),
    skills,
    impact: readJson<Impact>(join(TRIALS, "impact.json")),
    version: (JSON.parse(gitText(head, "package.json") ?? "{}") as { version?: string }).version ?? "0.0.0",
    now: new Date(),
    base: (p) => gitText(base, p),
    head: (p) => gitText(head, p),
    headFiles: (d) => gitFiles(head, d),
  });
}

function summary(markdown: string): void {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n\n`);
}

function recordSummary(record: TrialRecord): string {
  return [
    `### ${record.kind === "replay" ? "Replay" : "Trial"} of \`${record.skill}\` on @nativele/ts-dom ${record.nativele.version} (${record.nativele.commit})`,
    "",
    "| Check | Result |",
    "|---|---|",
    ...record.checks.map((c) => `| ${c.name} | ${c.pass ? "pass" : `FAIL: ${(c.detail ?? "").replace(/\n/g, "<br>").replace(/\|/g, "\\|")}`} |`),
  ].join("\n");
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const flags = new Map(rest.filter((a) => a.startsWith("--")).map((a) => [a.replace(/=.*$/, ""), a.includes("=") ? a.slice(a.indexOf("=") + 1) : "true"]));
  const [arg] = rest.filter((a) => !a.startsWith("--"));
  const need = (what: string) => {
    if (!arg) throw new Error(`${command} needs ${what}\n\n${USAGE}`);
    return arg;
  };
  switch (command) {
    case "prepare":
      prepare(need("a Skill name"), flags.get("--work"));
      return 0;
    case "agent":
      return agent(resolve(need("a trial folder")));
    case "check":
      return (await check(resolve(need("a trial folder")))).checks.every((c) => c.pass) ? 0 : 1;
    case "run": {
      const work = prepare(need("a Skill name"), flags.get("--work"));
      agent(work);
      return (await check(work)).checks.every((c) => c.pass) ? 0 : 1;
    }
    case "replay": {
      const record = await check(replayPrepare(need("a Skill name"), flags.get("--work")));
      summary(recordSummary(record));
      return record.checks.every((c) => c.pass) ? 0 : 1;
    }
    case "accept":
      accept(resolve(need("a trial folder")));
      return 0;
    case "comment": {
      const record = readJson<TrialRecord>(resolve(need("a record file")));
      console.log(comment(record, readFixture(record.skill), readFileSync(join(fixtureDir(record.skill), "task.md"), "utf8")));
      return 0;
    }
    case "affected": {
      const base = flags.get("--base");
      const head = flags.get("--head") ?? "HEAD";
      if (!base) throw new Error(`affected needs --base=<sha>\n\n${USAGE}`);
      const rows = runAffected(base, head);
      if (flags.has("--json")) console.log(JSON.stringify({ replay: rows.filter((r) => r.replay).map((r) => r.skill), rows }, null, 2));
      else console.log(affectedTable(rows));
      return 0;
    }
    default:
      console.log(USAGE);
      return command ? 1 : 0;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: Error) => {
      console.error(`trial: ${e.message}`);
      process.exit(1);
    },
  );
}

