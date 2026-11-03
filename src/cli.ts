#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { A11Y_RULES, checkA11y } from "./lib/a11y.ts";
import { CODEGEN_RULES, CodegenError, generateAll, listHtml, watchAll } from "./lib/codegen.ts";
import { DATA_FLOW_RULES, UNUSED_MARKUP_RULES, formatIssue, lintDataFlow, lintUsage } from "./lib/lint.ts";
import type { LintIssue } from "./lib/lint.ts";

const HELP = `ts-dom <command> [dirs...] [flags]

Commands
  gen   [dirs...]   Generate x.html.ts for every x.html, plus ts-dom-tags.ts (default dir: src)
        --watch           keep watching and regenerate on change
  lint  [dirs...]   Check templates against the code that uses them (default dir: src)
        --a11y            also check ARIA / accessibility (warnings)
        --strict          exit with code 1 on warnings too (errors always do)
        --json            print the issues as JSON instead of text
  rules             List every rule id with its description

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

function printRules(): void {
  const groups: [string, string, Record<string, string>][] = [
    ["gen", "reported by `ts-dom gen` while analyzing a template (errors stop code generation)", CODEGEN_RULES],
    ["lint: unused-markup", "errors from `ts-dom lint` / oxlint rule ts-dom/unused-markup", UNUSED_MARKUP_RULES],
    ["lint: data-flow", "warnings from `ts-dom lint` / oxlint rule ts-dom/data-flow", DATA_FLOW_RULES],
    ["lint: a11y", "warnings from `ts-dom lint --a11y` / oxlint rule ts-dom/a11y", Object.fromEntries(Object.entries(A11Y_RULES).map(([k, v]) => [k, v.split(". Fix:")[0] as string]))],
  ];
  for (const [name, note, rules] of groups) {
    console.log(`\n${name}: ${note}`);
    for (const [id, desc] of Object.entries(rules)) console.log(`  ${id.padEnd(24)} ${desc}`);
  }
}

const [cmd, ...args] = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const dirs = args.filter((a) => !a.startsWith("--"));
if (!dirs.length) dirs.push("src");

try {
  if (cmd === "gen") {
    let failed = false;
    for (const d of dirs) {
      try {
        generateAll(d);
      } catch (e) {
        if (!(e instanceof CodegenError) || !flags.has("--watch")) throw e;
        console.error(e.message);
        failed = true;
      }
    }
    if (flags.has("--watch")) {
      console.log(`[ts-dom] watching ${dirs.join(", ")}${failed ? " (the first generation had errors)" : ""}`);
      watchAll(dirs, {
        onGenerate: (f) => console.log(`[ts-dom] generated ${f}`),
        onError: (m) => console.error(m),
      });
      await new Promise(() => {}); // keep running until interrupted
    }
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
