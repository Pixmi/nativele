#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { A11Y_RULES, checkA11y } from "./lib/a11y.ts";
import { CHECK_RULES, runCheck } from "./lib/check.ts";
import { DOCTOR_RULES, formatDoctorIssue, runDoctor } from "./lib/doctor.ts";
import { RULE_DOCS } from "./lib/rule-docs.ts";
import { checkGenerated, CODEGEN_RULES, CodegenError, generateAll, listHtml, watchAll } from "./lib/codegen.ts";
import { DATA_FLOW_RULES, UNUSED_MARKUP_RULES, formatIssue, lintDataFlow, lintUsage } from "./lib/lint.ts";
import type { LintIssue } from "./lib/lint.ts";

const HELP = `ts-dom <command> [dirs...] [flags]

Commands
  gen   [dirs...]   Generate x.html.ts for every x.html, plus ts-dom-tags.ts (default dir: src)
        --watch           keep watching and regenerate on change
        --check           write nothing; list generated files that are missing, outdated or orphaned, exit 1 if any
        --include=<glob>  only these templates (repeatable; relative to each dir, ** crosses folders)
        --exclude=<glob>  leave these templates out (repeatable)
        --whitespace=collapse   collapse whitespace in text and drop line-break-only text between tags
  lint  [dirs...]   Check templates against the code that uses them (default dir: src)
        --a11y            also check ARIA / accessibility (warnings)
        --strict          exit with code 1 on warnings too (errors always do)
        --json            print the issues as JSON instead of text (also for gen --check)
  check [dirs...]   One pass for agents and CI: template diagnostics, generated files, tsc errors mapped back
                    to the templates, and the lint rules (default dir: src)
        --no-write        do not regenerate; report stale generated files instead
        --project=<path>  tsconfig for tsc (default: tsc's own lookup)
        --a11y            also check ARIA / accessibility (warnings)
        --strict          exit with code 1 on warnings too (errors always do)
        --json            print the issues as JSON instead of text
  doctor [dirs...]  Check the project set-up: tsconfig, template imports, generated files, the runtime package,
                    and the Vite, oxlint and formatter configuration (default dir: src)
        --json            print the issues as JSON instead of text
  rules             List every rule id with its description
        --explain=<id>    why the rule exists, a wrong example and the fix (the id as printed in [brackets])
        --json            print every rule as JSON: { id, group, description, why, bad, good }

Output format: file:line:col severity [rule-id] message. Each message says what is wrong and how to fix it.
Exit code: 0 = clean, 1 = errors found (or warnings with --strict).
`;

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === "node_modules") return [];
    const f = join(dir, n);
    if (statSync(f).isDirectory()) return tsFiles(f);
    return n.endsWith(".ts") && !n.endsWith(".d.ts") && !n.endsWith(".html.ts") && n !== "ts-dom-tags.ts" ? [f] : [];
  });
}

function ruleGroups(): [string, string, Record<string, string>][] {
  return [
    ["gen", "reported by `ts-dom gen` while analyzing a template (errors stop code generation)", CODEGEN_RULES],
    ["check", "reported by `ts-dom check` (tsc errors mapped back to the templates, and generated file state)", CHECK_RULES],
    ["doctor", "reported by `ts-dom doctor` (project set-up)", DOCTOR_RULES],
    ["lint: unused-markup", "errors from `ts-dom lint` / oxlint rule ts-dom/unused-markup (or ts-dom/<id>)", UNUSED_MARKUP_RULES],
    ["lint: data-flow", "warnings from `ts-dom lint` / oxlint rule ts-dom/data-flow (or ts-dom/<id>)", DATA_FLOW_RULES],
    ["lint: a11y", "warnings from `ts-dom lint --a11y` / oxlint rule ts-dom/a11y (or ts-dom/<id>)", Object.fromEntries(Object.entries(A11Y_RULES).map(([k, v]) => [k, v.split(". Fix:")[0] as string]))],
  ];
}

function printRules(): void {
  const explain = args.find((a) => a.startsWith("--explain="))?.slice("--explain=".length);
  if (explain !== undefined) {
    const doc = RULE_DOCS[explain];
    const where = ruleGroups().filter(([, , rules]) => explain in rules);
    if (!doc || !where.length) {
      console.error(`Unknown rule id "${explain}". Fix: run ts-dom rules to see every id.`);
      process.exitCode = 1;
      return;
    }
    console.log(`[${explain}] ${where.map(([g, , r]) => `${g}: ${r[explain]}`).join("; ")}\n\nWhy: ${doc.why}\n\nWrong:\n${doc.bad}\n\nRight:\n${doc.good}`);
    return;
  }
  if (flags.has("--json")) {
    const rules = ruleGroups().flatMap(([group, , rules]) => Object.entries(rules).map(([id, description]) => ({ id, group, description, ...RULE_DOCS[id] })));
    console.log(JSON.stringify({ rules }, null, 2));
    return;
  }
  for (const [name, note, rules] of ruleGroups()) {
    console.log(`\n${name}: ${note}`);
    for (const [id, desc] of Object.entries(rules)) console.log(`  ${id.padEnd(28)} ${desc}`);
  }
  console.log("\nts-dom rules --explain=<id> shows why a rule exists, with a wrong and a right example.");
}

const [cmd, ...args] = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const globs = (name: string) => args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
const generate = { include: globs("include"), exclude: globs("exclude"), whitespace: flags.has("--whitespace=collapse") ? ("collapse" as const) : ("preserve" as const) };
const dirs = args.filter((a) => !a.startsWith("--"));
if (!dirs.length) dirs.push("src");

try {
  if (cmd === "gen" && flags.has("--check")) {
    const results = dirs.map((d) => checkGenerated(d, generate));
    const stale = results.flatMap((r) => r.stale);
    const errors = results.flatMap((r) => r.errors);
    if (flags.has("--json")) console.log(JSON.stringify({ stale: stale.map((s) => ({ ...s, file: relative(process.cwd(), s.file) })), errors }, null, 2));
    else {
      for (const s of stale) console.error(`${relative(process.cwd(), s.file)}:1:1 error [stale-generated] The generated file is ${s.reason}. Fix: run ts-dom gen.`);
      for (const e of errors) console.error(e);
      if (!stale.length && !errors.length) console.log("ts-dom gen --check: generated files are up to date");
    }
    if (stale.length || errors.length) process.exitCode = 1;
  } else if (cmd === "gen") {
    let failed = false;
    for (const d of dirs) {
      try {
        generateAll(d, generate);
      } catch (e) {
        if (!(e instanceof CodegenError) || !flags.has("--watch")) throw e;
        console.error(e.message);
        failed = true;
      }
    }
    if (flags.has("--watch")) {
      console.log(`[ts-dom] watching ${dirs.join(", ")}${failed ? " (the first generation had errors)" : ""}`);
      watchAll(dirs, {
        ...generate,
        onGenerate: (f) => console.log(`[ts-dom] generated ${f}`),
        onError: (m) => console.error(m),
      });
      await new Promise(() => {}); // keep running until interrupted
    }
  } else if (cmd === "check") {
    const project = args.find((a) => a.startsWith("--project="))?.slice("--project=".length);
    const issues = runCheck({ dirs, generate, write: !flags.has("--no-write"), a11y: flags.has("--a11y"), ...(project ? { project } : {}) });
    if (flags.has("--json")) console.log(JSON.stringify({ issues }, null, 2));
    else for (const i of issues) (i.severity === "error" ? console.error : console.warn)(formatIssue(i));
    const errors = issues.filter((i) => i.severity === "error").length;
    if (errors || (flags.has("--strict") && issues.length)) process.exitCode = 1;
    if (!flags.has("--json") && !issues.length) console.log("ts-dom check: no issues");
  } else if (cmd === "doctor") {
    const issues = runDoctor({ dirs, generate });
    if (flags.has("--json")) console.log(JSON.stringify({ issues }, null, 2));
    else for (const i of issues) (i.severity === "error" ? console.error : console.warn)(formatDoctorIssue(i));
    if (issues.some((i) => i.severity === "error")) process.exitCode = 1;
    if (!flags.has("--json") && !issues.length) console.log("ts-dom doctor: the set-up looks right");
  } else if (cmd === "lint") {
    const files = dirs.flatMap(tsFiles);
    const issues: LintIssue[] = [...lintUsage(dirs, files), ...lintDataFlow(dirs, files)];
    if (flags.has("--a11y")) {
      for (const dir of dirs) {
        for (const f of listHtml(dir)) {
          for (const d of checkA11y(readFileSync(f, "utf8"))) issues.push({ file: relative(process.cwd(), f), ...d });
        }
      }
    }
    issues.sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line || x.col - y.col);
    if (flags.has("--json")) console.log(JSON.stringify({ issues }, null, 2));
    else for (const i of issues) (i.severity === "error" ? console.error : console.warn)(formatIssue(i));
    const errors = issues.filter((i) => i.severity === "error").length;
    if (errors || (flags.has("--strict") && issues.length)) process.exitCode = 1;
    if (!flags.has("--json") && !issues.length) console.log("ts-dom lint: no issues");
  } else if (cmd === "rules") {
    printRules();
  } else {
    console.log(HELP);
    if (cmd && cmd !== "--help" && cmd !== "-h" && cmd !== "help") process.exitCode = 1;
  }
} catch (e) {
  if (e instanceof CodegenError) {
    console.error(e.message);
    process.exitCode = 1;
  } else throw e;
}
