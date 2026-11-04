import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { checkA11y } from "./a11y.ts";
import { analyze, CodegenError, generateAll, isSelected, listHtml, renderTags, staleGenerated } from "./codegen.ts";
import type { GenerateOptions } from "./codegen.ts";
import { lintDataFlow, lintUsage } from "./lint.ts";
import type { LintIssue } from "./lint.ts";

export const CHECK_RULES = {
  "stale-generated": "a generated file is missing, outdated or orphaned, so the type errors may not match the templates",
  "missing-binding": "a {{ hole }} or data-if names nothing in state, props or derive (found by tsc)",
  "conflicting-keys": "the same name is declared in more than one of state, props and derive (found by tsc)",
  "reserved-prop": "a prop is named like a member of HTMLElement or ts-dom (found by tsc)",
  "native-event-name": "an emitted event is named like a native DOM event (found by tsc)",
  "item-prop-missing": "the data-prop of a list is not a prop of its item component (found by tsc)",
  "item-not-in-tag-map": "the item component is defined in a scanned folder but missing from ts-dom-tags.ts (found by tsc)",
  "item-class-not-exported": "the item component class passed to define() is not exported (found by tsc)",
  tsc: "any other TypeScript error, as tsc reports it",
  "tsc-not-found": "TypeScript is not installed in the project, so types were not checked",
  "tsc-failed": "tsc did not run to completion (no tsconfig, a bad option, a crash), so types were not checked",
} as const;

export interface CheckOptions {
  dirs: string[];
  generate?: GenerateOptions;
  /** Regenerate the generated files before type checking (default). With false, stale files are reported instead. */
  write?: boolean;
  /** tsconfig path; default: tsc's own lookup from the working directory */
  project?: string;
  a11y?: boolean;
  cwd?: string;
}

/** One error as tsc prints it with --pretty false. */
export interface TscError {
  file: string;
  line: number;
  col: number;
  code: string;
  message: string;
}

/** Parse `tsc --pretty false` output; indented lines continue the previous message. */
export function parseTscOutput(out: string): TscError[] {
  const errors: TscError[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line);
    if (m) errors.push({ file: m[1] as string, line: Number(m[2]), col: Number(m[3]), code: m[4] as string, message: m[5] as string });
    else if (/^\s+\S/.test(line) && errors.length) (errors.at(-1) as TscError).message += `\n${line.trim()}`;
  }
  return errors;
}

const namesAfter = (message: string, key: string): string[] => {
  const m = new RegExp(`${key}: ((?:"[^"]+"(?:\\s*\\|\\s*)?)+)`).exec(message);
  return m ? [...(m[1] as string).matchAll(/"([^"]+)"/g)].map((x) => x[1] as string) : [];
};

const templatesOf = (tsFile: string): string[] => {
  if (!existsSync(tsFile)) return [];
  const code = readFileSync(tsFile, "utf8");
  return [...code.matchAll(/from\s+["'](\.{1,2}\/[^"']+\.html)\.js["']/g)].map((m) => resolve(dirname(tsFile), m[1] as string)).filter((f) => existsSync(f));
};

/**
 * Turn the tsc errors that come from the template contract into issues that point at the template, or at the line to change, with a Fix hint.
 * Other errors are kept as `tsc` issues.
 */
export function mapTscErrors(errors: readonly TscError[], cwd: string): LintIssue[] {
  const rel = (f: string) => relative(cwd, f);
  const out: LintIssue[] = [];
  const analyses = new Map<string, ReturnType<typeof analyze>>();
  const analysisOf = (html: string) => {
    let a = analyses.get(html);
    if (!a) analyses.set(html, (a = analyze(readFileSync(html, "utf8"))));
    return a;
  };
  const locate = (tsFile: string, keys: string[]) => {
    for (const html of templatesOf(tsFile)) {
      for (const key of keys) {
        const loc = analysisOf(html).locs.get(key);
        if (loc) return { file: html, ...loc };
      }
    }
    return undefined;
  };
  // A class whose Component(...) call has a contract error is typed as that error, so define() and member accesses on that class fail too, in any file: those follow-up errors repeat the first one.
  const brokenClasses = new Set<string>();
  for (const e of errors) {
    if (!/missingStateKeys|conflictingKeys|reservedPropNames|nativeEventNames/.test(e.message)) continue;
    const line = readFileSync(resolve(cwd, e.file), "utf8").split("\n")[e.line - 1] ?? "";
    const name = /class\s+([A-Za-z_$][\w$]*)\s+extends\s+Component\s*\(/.exec(line)?.[1];
    if (name) brokenClasses.add(name);
  }
  const followsBroken = (message: string) => [...brokenClasses].some((c) => new RegExp(`'(typeof )?${c}'`).test(message));
  for (const e of errors) {
    const file = resolve(cwd, e.file);
    const where = `${rel(file)}:${e.line}:${e.col}`;
    const issue = (rule: string, message: string, at?: { file: string; line: number; col: number }) =>
      out.push({ ...(at ?? { file: rel(file), line: e.line, col: e.col }), rule, severity: "error", message });
    const missing = namesAfter(e.message, "missingStateKeys");
    if (missing.length) {
      for (const name of missing) {
        const found = locate(file, [`text:${name}`, `if:${name}`]);
        issue(
          "missing-binding",
          `"${name}" is used by {{ ${name} }} or data-if="${name}" but the component declares no state, prop or derived value of that name (tsc at ${where}). Fix: add "${name}" to state, props or derive, or remove it from the template.`,
          found && { file: rel(found.file), line: found.line, col: found.col },
        );
      }
      continue;
    }
    const handlers = namesAfter(e.message, "missingHandlers");
    if (handlers.length) {
      for (const name of handlers) {
        const found = locate(file, [`event:${name}`]);
        issue(
          "missing-handler",
          `data-on-*="${name}" refers to a method the component class does not define (tsc at ${where}). Fix: add a public method \`${name}(e: Event, hit: EventHit)\` to the class.`,
          found && { file: rel(found.file), line: found.line, col: found.col },
        );
      }
      continue;
    }
    const contract: [string, string, string][] = [
      ["conflictingKeys", "conflicting-keys", "keep each name in only one of state, props and derive"],
      ["reservedPropNames", "reserved-prop", "rename the prop (for example title -> titleText)"],
      ["nativeEventNames", "native-event-name", "rename the event, for example with a prefix such as item-"],
      ["dataPropNotOnItemComponent", "item-prop-missing", "declare the property in the item component's props, or change data-prop"],
      ["itemComponentMissingFromTagMap", "item-not-in-tag-map", "run ts-dom gen so ts-dom-tags.ts lists the item component"],
      ["itemComponentClassNotExported", "item-class-not-exported", "export the class passed to define() so its prop types can be read"],
    ];
    const hit = contract.find(([key]) => e.message.includes(key));
    if (hit) {
      issue(hit[1], `${e.message.split("\n")[0]} Fix: ${hit[2]}.`);
      continue;
    }
    issue("tsc", `${e.code}: ${e.message}`);
  }
  return out.filter((i) => i.rule !== "tsc" || !followsBroken(i.message));
}

function findTsc(cwd: string): string | null {
  try {
    const req = createRequire(join(cwd, "package.json"));
    const pkgPath = req.resolve("typescript/package.json");
    const bin = (JSON.parse(readFileSync(pkgPath, "utf8")) as { bin?: { tsc?: string } }).bin?.tsc;
    return bin ? resolve(dirname(pkgPath), bin) : null;
  } catch {
    return null;
  }
}

/**
 * Everything an agent needs in one pass: template diagnostics, generated files, TypeScript errors mapped back to the templates, and the lint rules.
 * Returns the issues sorted by file and position.
 */
export function runCheck(options: CheckOptions): LintIssue[] {
  const cwd = options.cwd ?? process.cwd();
  const generate = options.generate ?? {};
  const dirs = options.dirs.map((d) => resolve(cwd, d)).filter((d) => existsSync(d));
  const issues: LintIssue[] = [];
  const rel = (f: string) => relative(cwd, f);

  for (const dir of dirs) {
    for (const f of listHtml(dir)) {
      if (!isSelected(dir, f, generate)) continue;
      for (const d of analyze(readFileSync(f, "utf8")).diagnostics) issues.push({ file: rel(f), ...d });
    }
  }

  for (const dir of dirs) {
    try {
      renderTags(dir);
    } catch (e) {
      if (!(e instanceof CodegenError)) throw e;
      issues.push({ file: rel(dir), line: 1, col: 1, rule: "duplicate-define", severity: "error", message: e.message.replace(/^[^[]*\[duplicate-define\]\s*/, "") });
    }
  }

  if (options.write === false) {
    for (const dir of dirs) {
      for (const s of staleGenerated(dir, generate)) {
        issues.push({ file: rel(s.file), line: 1, col: 1, rule: "stale-generated", severity: "error", message: `The generated file is ${s.reason}, so the type errors below may not match the templates. Fix: run ts-dom gen (or ts-dom check without --no-write).` });
      }
    }
  } else {
    for (const dir of dirs) {
      try {
        generateAll(dir, generate);
      } catch (e) {
        if (!(e instanceof CodegenError)) throw e;
      }
    }
  }

  const tsc = findTsc(cwd);
  if (!tsc) {
    issues.push({ file: ".", line: 1, col: 1, rule: "tsc-not-found", severity: "warning", message: "TypeScript is not installed in this project, so types were not checked. Fix: npm i -D typescript." });
  } else {
    const run = spawnSync(process.execPath, [tsc, "--noEmit", "--pretty", "false", ...(options.project ? ["-p", options.project] : [])], { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
    const parsed = parseTscOutput(output);
    issues.push(...mapTscErrors(parsed, cwd));
    if (run.error || (run.status !== 0 && !parsed.length)) {
      const detail = run.error ? String(run.error.message) : output.trim().split("\n").slice(0, 5).join(" ");
      issues.push({ file: ".", line: 1, col: 1, rule: "tsc-failed", severity: "error", message: `tsc did not check the types: ${detail} Fix: make \`npx tsc --noEmit\` run in this folder (a tsconfig.json, or --project=<path>).` });
    }
  }

  const tsFiles = dirs.flatMap(listSourceTs);
  const lint = [...lintUsage(dirs, tsFiles), ...lintDataFlow(dirs, tsFiles)].map((i) => ({ ...i, file: rel(resolve(cwd, i.file)) }));
  for (const i of lint) {
    if (i.rule === "missing-handler" && issues.some((x) => x.rule === "missing-handler" && x.file === i.file && x.line === i.line && x.col === i.col)) continue;
    issues.push(i);
  }
  if (options.a11y) {
    for (const dir of dirs) {
      for (const f of listHtml(dir)) for (const d of checkA11y(readFileSync(f, "utf8"))) issues.push({ file: rel(f), ...d });
    }
  }
  const seen = new Set<string>();
  return issues
    .filter((i) => {
      const k = `${i.file}:${i.line}:${i.col}:${i.rule}:${i.message}`;
      return !seen.has(k) && seen.add(k) !== undefined;
    })
    .sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line || x.col - y.col);
}

function listSourceTs(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === "node_modules") return [];
    const f = join(dir, n);
    if (statSync(f).isDirectory()) return listSourceTs(f);
    return n.endsWith(".ts") && !n.endsWith(".d.ts") && !n.endsWith(".html.ts") && n !== "ts-dom-tags.ts" ? [f] : [];
  });
}

