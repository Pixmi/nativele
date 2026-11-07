// npm run bench:check: measures the editor and command line hosts on synthetic projects and fails when a value is over its budget in budgets.json.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { counts } from "./count.ts";
import { componentPath, monorepo, PACKAGES, singleProject, typeProjects } from "./project.ts";

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const CLI = join(REPO, "src/cli.ts");
const TSC = join(REPO, "node_modules/typescript/bin/tsc");
const N = 1000;
const MAX_RATIO = 35;

const { Memo } = await import("../../src/lib/components.ts");
const { tsDom } = await import("../../src/lib/vite-plugin.ts");
const { default: oxlint } = await import("../../src/lib/oxlint-plugin.ts");

// Every value a memo was given, so what it still holds can be counted from outside it.
const given = new Map<InstanceType<typeof Memo>, Map<string, unknown[][]>>();
const set = Memo.prototype.set;
Memo.prototype.set = function <T>(file: string, kind: string, from: readonly unknown[], value: T): T {
  let kept = given.get(this);
  if (!kept) given.set(this, (kept = new Map()));
  const key = `${file}\0${kind}`;
  const froms = kept.get(key) ?? [];
  if (!froms.some((f) => f.length === from.length && f.every((v, i) => v === from[i]))) froms.push([...from]);
  kept.set(key, froms);
  return set.call(this, file, kind, from, value) as T;
};
const held = (memo: InstanceType<typeof Memo>) => {
  let n = 0;
  for (const [key, froms] of given.get(memo) ?? []) {
    const [file, kind] = key.split("\0") as [string, string];
    for (const from of froms) if (memo.get(file, kind, from) !== undefined) n++;
  }
  return n;
};

const scaling: [string, number[]][] = [];
const measured = new Map<string, number>();
const record = (name: string, value: number) => measured.set(name, value);
const during = (name: string, fn: () => void) => {
  const before = { ...counts };
  fn();
  for (const k of ["parses", "reads", "readdirs"] as const) record(`${name}: ${k}`, counts[k] - before[k]);
};
const turn = () => new Promise((r) => setImmediate(r));

const work = mkdtempSync(join(tmpdir(), "nativele-bench-"));
const originals = new Map<string, string>();
let saves = 0;
const save = (file: string) => {
  if (!originals.has(file)) originals.set(file, readFileSync(file, "utf8"));
  writeFileSync(file, `${originals.get(file)}${file.endsWith(".html") ? `<!-- save ${++saves} -->` : `// save ${++saves}`}\n`);
};

function viteHost(dir: string) {
  process.chdir(dir);
  const p = tsDom({ dirs: ["src"], a11y: true });
  p.configResolved({ root: dir });
  const logger = { warn() {}, error() {} };
  const server = { config: { logger }, moduleGraph: { getModulesByFile: () => undefined, invalidateModule() {} }, ws: { send() {} } };
  const hook = (file: string) => {
    p.handleHotUpdate({ file, server });
    if (file.endsWith(".html")) p.handleHotUpdate({ file: `${file}.ts`, server });
  };
  return { p, hook, buildStart: () => p.buildStart.call({ warn() {}, error: (m: string): never => { throw new Error(m); } }) };
}

const lintFile = (filename: string, text = readFileSync(filename, "utf8")) => {
  const context = { filename, sourceCode: { text }, options: [] as [], report() {} };
  const visitors = ["unused-markup", "a11y", "data-flow"].map((g) => oxlint.rules[g as "a11y"].create(context));
  for (const m of text.matchAll(/from "([^"]+)"/g)) {
    const node = { type: "ImportDeclaration" as const, source: { value: m[1] as string } };
    for (const v of visitors) v.ImportDeclaration(node);
  }
};
const sources = (src: string) => readdirSync(src, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts") && !f.endsWith(".html.ts") && !f.endsWith("ts-dom-tags.ts")).map((f) => join(src, f));
async function lintAll(files: string[]) {
  for (let i = 0; i < files.length; i++) {
    if (i % 25 === 0) await turn();
    lintFile(files[i] as string);
  }
  await turn();
}

/** A command run in a new process, with what it counted. */
function cli(dir: string, args: string[]): { counts: typeof counts } {
  const out = join(work, "counts.json");
  execFileSync(process.execPath, ["--import", fileURLToPath(new URL("./count.ts", import.meta.url)), CLI, ...args], { cwd: dir, env: { ...process.env, BENCH_COUNTS: out }, stdio: "ignore" });
  return { counts: JSON.parse(readFileSync(out, "utf8")) };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
const time = async (reps: number, fn: () => unknown) => {
  const ms: number[] = [];
  for (let i = 0; i < reps; i++) {
    const t = performance.now();
    await fn();
    ms.push(performance.now() - t);
  }
  return median(ms);
};

const started = performance.now();
try {
  const big = join(work, "single");
  singleProject(big, N);
  const src = join(big, "src");
  const at = (i: number, ext: string) => join(src, `${componentPath(i)}.${ext}`);

  {
    const c = cli(big, ["lint", "src", "--a11y"]).counts;
    record(`cli lint ${N}: parses`, c.parses);
    record(`cli lint ${N}: reads`, c.reads);
  }

  const vite = viteHost(big);
  during("vite buildStart", vite.buildStart);
  for (const [label, file] of [[".html", at(170, "html")], [".ts", at(360, "ts")]] as const) {
    for (const css of [false, true]) {
      save(file);
      await turn();
      vite.hook(file);
      if (css) vite.hook(join(src, "style.css"));
      save(file);
      await turn();
      during(`vite ${label} save${css ? " after a .css update" : ""}`, () => vite.hook(file));
    }
  }
  const files = sources(src);
  {
    const before = { ...counts };
    await lintAll(files);
    for (const k of ["parses", "reads"] as const) record(`oxlint whole project ${N}: ${k}`, counts[k] - before[k]);
  }
  const A = at(170, "ts");
  for (const [label, edit] of [["unchanged", null], ["child .html saved", at(171, "html")], ["own .ts saved", A]] as const) {
    if (edit) save(edit);
    await turn();
    during(`oxlint re-lint, ${label}`, () => lintFile(A));
  }
  await turn();
  during("oxlint re-lint, unsaved buffer", () => lintFile(A, `${readFileSync(A, "utf8")}\n// buffer\n`));

  {
    // A long session: the same few files saved again and again, each also linted from an unsaved buffer, while the dev server regenerates.
    const memos = [...given.keys()];
    const before = memos.reduce((n, m) => n + held(m), 0);
    for (let round = 0; round < 15; round++) {
      for (const i of [100, 101, 102, 400, 401, 900]) {
        save(at(i, "html"));
        vite.hook(at(i, "html"));
        save(at(i, "ts"));
        vite.hook(at(i, "ts"));
        await turn();
        lintFile(at(i, "ts"), `${readFileSync(at(i, "ts"), "utf8")}\n// buffer ${round}\n`);
        await turn();
        lintFile(at(i, "ts"));
        await turn();
      }
    }
    await lintAll(files.slice(0, 50));
    record("memo entries added by a long session", [...given.keys()].reduce((n, m) => n + held(m), 0) - before);
  }

  {
    // 10x the components: linear growth gives about 10x the time, quadratic about 100x.
    const sizes = [200, 2000] as const;
    const lint: number[] = [];
    const saveHtml: number[] = [];
    for (const n of sizes) {
      const dir = join(work, `scale${n}`);
      singleProject(dir, n);
      const file = join(dir, "src", `${componentPath(Math.floor(n / 2))}.html`);
      lint.push(await time(3, () => cli(dir, ["lint", "src", "--a11y"])));
      const host = viteHost(dir);
      host.buildStart();
      host.hook(file);
      saveHtml.push(await time(9, () => { save(file); host.hook(file); }));
    }
    process.chdir(big);
    scaling.push(["cli lint --a11y", lint], [".html save in the Vite plugin", saveHtml]);
  }

  {
    const mono = join(work, "mono");
    monorepo(mono, 200);
    process.chdir(mono);
    const all = PACKAGES.flatMap((p) => sources(join(mono, "packages", p, "src")));
    const before = { ...counts };
    await lintAll(all);
    for (const k of ["parses", "reads", "readdirs"] as const) record(`oxlint monorepo ${PACKAGES.length}x200: ${k}`, counts[k] - before[k]);
    const file = join(mono, "packages/app/src", `${componentPath(50)}.ts`);
    save(join(mono, "packages/ui/src", `${componentPath(50)}.html`));
    await turn();
    during("oxlint monorepo re-lint, other package's .html saved", () => lintFile(file));
    process.chdir(big);
  }

  {
    const types = join(work, "types");
    const instantiations = new Map<string, number>();
    for (const name of typeProjects(types)) {
      const dir = join(types, name);
      execFileSync(process.execPath, [CLI, "gen", "src"], { cwd: dir, stdio: "ignore" });
      let out: string;
      try {
        out = execFileSync(process.execPath, [TSC, "-p", ".", "--singleThreaded", "--extendedDiagnostics"], { cwd: dir, encoding: "utf8" });
      } catch (e) {
        out = (e as { stdout: string }).stdout;
      }
      record(`tsc errors, ${name}`, out.match(/error TS\d+/g)?.length ?? 0);
      instantiations.set(name, Number(/Instantiations:\s+(\d+)/.exec(out)?.[1]));
    }
    const library = instantiations.get("library") as number;
    for (const [name, n] of instantiations) if (name !== "library") record(`tsc instantiations, ${name} (over the library alone)`, n - library);
  }
} finally {
  process.chdir(REPO);
  rmSync(work, { recursive: true, force: true });
}

const budgets = JSON.parse(readFileSync(new URL("./budgets.json", import.meta.url), "utf8")) as Record<string, number>;
const rows = [...measured].map(([name, value]) => ({ name, value, budget: budgets[name] }));
const width = Math.max(...rows.map((r) => r.name.length));
const show = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
console.log(`${"measure".padEnd(width)}  ${"value".padStart(9)}  ${"budget".padStart(9)}`);
let failed = 0;
for (const { name, value, budget } of rows) {
  const over = budget === undefined || value > budget;
  if (over) failed++;
  console.log(`${name.padEnd(width)}  ${show(value).padStart(9)}  ${(budget === undefined ? "none" : show(budget)).padStart(9)}${over ? "  OVER" : ""}`);
}
for (const [name, [small, large]] of scaling) {
  const ratio = (large as number) / (small as number);
  const over = ratio > MAX_RATIO;
  if (over) failed++;
  console.log(`${name}: ${(small as number).toFixed(0)} ms at 200 components, ${(large as number).toFixed(0)} ms at 2000, ratio ${ratio.toFixed(1)} (limit ${MAX_RATIO})${over ? "  OVER" : ""}`);
}
for (const name of Object.keys(budgets)) {
  if (measured.has(name)) continue;
  failed++;
  console.log(`${name}: budgeted but not measured`);
}
console.log(`\n${((performance.now() - started) / 1000).toFixed(1)} s`);
if (failed) {
  console.error(`${failed} measure(s) over budget or without one. Fix: find the change that raised it; when the increase is intended, raise the budget in scripts/bench/budgets.json in the same commit and say why.`);
  process.exitCode = 1;
}
