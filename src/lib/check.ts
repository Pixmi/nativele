import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { checkA11y } from "./a11y.ts";
import { analyze, CodegenError, crossDirDuplicates, generateDirs, isSelected, listHtml, listTs, renderTags, scanDefines, staleGenerated } from "./codegen.ts";
import { projectConfigs } from "./tsconfig.ts";
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
  "tsc-not-found": "TypeScript is not installed in the project, so types were not checked and the check fails",
  "dir-not-found": "a folder given on the command line does not exist, so nothing in it was checked",
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

const CONTRACT: [string, string, string][] = [
  ["conflictingKeys", "conflicting-keys", "keep each name in only one of state, props and derive"],
  ["reservedPropNames", "reserved-prop", "rename the prop (for example title -> titleText)"],
  ["nativeEventNames", "native-event-name", "rename the event, for example with a prefix such as item-"],
  ["dataPropNotOnItemComponent", "item-prop-missing", "declare the property in the item component's props, or change data-prop"],
  ["itemComponentMissingFromTagMap", "item-not-in-tag-map", "run ts-dom gen so ts-dom-tags.ts lists the item component; if it already does, the tsconfig include or exclude leaves ts-dom-tags.ts out of the program (ts-dom doctor reports it as tsconfig-misses-tag-map): make include match it"],
  ["itemComponentClassNotExported", "item-class-not-exported", "export the class passed to define() so its prop types can be read"],
];

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
  // A class whose Component(...) call has a contract error is typed as that error, so define() and member accesses on that class fail too, in any file.
  // In its own file those follow-up errors repeat the first one and are dropped; in other files they are kept, pointing at the error they follow from.
  // Inside the body of such a class `this` has no usable type either, so errors there (a bind callback's parameter without a type, say) follow from it as well.
  const brokenClasses = new Map<string, TscError>();
  const brokenBodies: { file: string; from: number; to: number }[] = [];
  for (const e of errors) {
    if (!/missingStateKeys|conflictingKeys|reservedPropNames|nativeEventNames/.test(e.message)) continue;
    const text = readFileSync(resolve(cwd, e.file), "utf8");
    const lines = text.split("\n");
    const m = /class\s+([A-Za-z_$][\w$]*)\s+extends\s+Component\s*\(/.exec(lines[e.line - 1] ?? "");
    if (!m?.[1]) continue;
    if (!brokenClasses.has(m[1])) brokenClasses.set(m[1], e);
    const start = lines.slice(0, e.line - 1).join("\n").length + (e.line > 1 ? 1 : 0) + m.index + m[0].length - 1;
    const end = classBodyEnd(text, start);
    if (end !== -1) brokenBodies.push({ file: rel(resolve(cwd, e.file)), from: e.line, to: text.slice(0, end).split("\n").length });
  }
  const firstIssueOf = new Map<TscError, LintIssue>();
  for (const e of errors) {
    const before = out.length;
    const file = resolve(cwd, e.file);
    const where = `${rel(file)}:${e.line}:${e.col}`;
    const issue = (rule: string, message: string, at?: { file: string; line: number; col: number }) =>
      out.push({ ...(at ?? { file: rel(file), line: e.line, col: e.col }), rule, severity: "error", message });
    let named = false;
    for (const name of namesAfter(e.message, "missingStateKeys")) {
      named = true;
      const found = locate(file, [`text:${name}`, `if:${name}`]);
      issue(
        "missing-binding",
        `"${name}" is used by {{ ${name} }} or data-if="${name}" but the component declares no state, prop or derived value of that name (tsc at ${where}). Fix: add "${name}" to state, props or derive, or remove it from the template.`,
        found && { file: rel(found.file), line: found.line, col: found.col },
      );
    }
    for (const name of namesAfter(e.message, "missingHandlers")) {
      named = true;
      const found = locate(file, [`event:${name}`]);
      issue(
        "missing-handler",
        `data-on-*="${name}" refers to a method the component class does not define (tsc at ${where}). Fix: add a public method \`${name}(e: Event, hit: EventHit)\` to the class.`,
        found && { file: rel(found.file), line: found.line, col: found.col },
      );
    }
    for (const [key, rule, fix] of CONTRACT) {
      if (!e.message.includes(key)) continue;
      named = true;
      issue(rule, `${e.message.split("\n")[0]} Fix: ${fix}.`);
    }
    if (named) {
      firstIssueOf.set(e, out[before] as LintIssue);
      continue;
    }
    const tag = /Property '"([^"]+)"' must be of type/.exec(e.message)?.[1];
    if (e.code === "TS2717" && tag && file.endsWith(`${sep}ts-dom-tags.ts`)) {
      issue("duplicate-define", `The tag <${tag}> is declared with another class by a second tag map in the same program (another generated ts-dom-tags.ts, from a folder that is scanned separately or from a package), so two components share one custom element name, and at runtime only the class whose define() runs first is registered: the other define() is skipped without an error (tsc ${e.code} at ${where}). Fix: rename the tag in one of the define() calls and in the templates that use it; editing this generated file does not help.`);
    } else if (file.endsWith(".html.ts") || file.endsWith(`${sep}ts-dom-tags.ts`)) issue("tsc", `${e.code}: ${e.message} This file is generated, so an edit to it is overwritten. Fix: run ts-dom gen for the folder that holds it; if it is left over from a template or folder that is no longer scanned, delete it.`);
    else issue("tsc", `${e.code}: ${e.message} Fix: change the TypeScript at this location so the types agree; ts-dom rules --explain=tsc.`);
  }
  const brokenFiles = new Set([...brokenClasses.values()].map((e) => rel(resolve(cwd, e.file))));
  const classIn = (message: string) => {
    const types = [...message.matchAll(/'([^']*)'/g)].flatMap((m) => topLevelMembers(m[1] as string).map((t) => t.replace(/^typeof\s+/, "")));
    return [...brokenClasses.keys()].find((c) => types.includes(c));
  };
  return out.flatMap((i) => {
    const cls = i.rule === "tsc" ? classIn(i.message) : undefined;
    if (i.rule === "tsc" && brokenBodies.some((b) => b.file === i.file && i.line > b.from && i.line <= b.to)) return [];
    if (cls === undefined) return [i];
    if (brokenFiles.has(i.file) || /(^|[\\/])node_modules[\\/]/.test(i.file)) return [];
    const cause = brokenClasses.get(cls) as TscError;
    const first = firstIssueOf.get(cause);
    const at = first ? `${first.file}:${first.line}:${first.col} [${first.rule}]` : `${rel(resolve(cwd, cause.file))}:${cause.line}:${cause.col}`;
    return [{ ...i, message: `${i.message.replace(/ Fix: .*$/s, "")} This error follows from the contract error of ${cls} at ${at}, which makes tsc type ${cls} as that error instead of an element. Fix: fix that error first; this one then goes away.` }];
  });
}

/** The members of a union or intersection type as tsc prints it (`A & { x: number; }` gives `A` and `{ x: number; }`); any other type is its only member. */
function topLevelMembers(type: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < type.length; i++) {
    const c = type[i] as string;
    if ("({[<".includes(c)) depth++;
    else if (")}]".includes(c) || (c === ">" && type[i - 1] !== "=")) depth--;
    else if (depth === 0 && (c === "&" || c === "|")) {
      out.push(type.slice(from, i));
      from = i + 1;
    }
  }
  out.push(type.slice(from));
  return out.map((t) => t.trim());
}

/** The offset of the `}` that closes a class body, given the offset of the `(` of its `extends Component(`; -1 when it cannot be found. Strings and comments are skipped. */
function classBodyEnd(text: string, open: number): number {
  let depth = 0;
  let inBody = false;
  for (let i = open; i < text.length; i++) {
    const c = text[i] as string;
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "/" && text[i + 1] === "/") i = text.indexOf("\n", i) === -1 ? text.length : text.indexOf("\n", i);
    else if (c === "/" && text[i + 1] === "*") i = text.indexOf("*/", i) === -1 ? text.length : text.indexOf("*/", i) + 1;
    else if ("([{".includes(c)) {
      if (c === "{" && depth === 0) inBody = true;
      depth++;
    } else if (")]}".includes(c)) {
      depth--;
      if (depth === 0 && inBody) return i;
    }
  }
  return -1;
}

// vue-tsc takes tsc's arguments and prints tsc's output, and it also understands the .vue files a Vue project imports.
// It is used only when this project lists it: in a monorepo it can be hoisted for a sibling package.
function findTsc(cwd: string): { name: string; bin: string } | null {
  const req = createRequire(join(cwd, "package.json"));
  let deps: Record<string, unknown> = {};
  try {
    const json = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
    deps = { ...json.dependencies, ...json.devDependencies };
  } catch {}
  const candidates: [string, string][] = "vue-tsc" in deps ? [["vue-tsc", "vue-tsc"], ["typescript", "tsc"]] : [["typescript", "tsc"]];
  for (const [pkg, name] of candidates) {
    try {
      const pkgPath = req.resolve(`${pkg}/package.json`);
      const bin = (JSON.parse(readFileSync(pkgPath, "utf8")) as { bin?: Record<string, string> }).bin?.[name];
      if (bin) return { name, bin: resolve(dirname(pkgPath), bin) };
    } catch {}
  }
  return null;
}

/**
 * Everything an agent needs in one pass: template diagnostics, generated files, TypeScript errors mapped back to the templates, and the lint rules.
 * Returns the issues sorted by file and position.
 */
export function runCheck(options: CheckOptions): LintIssue[] {
  const cwd = options.cwd ?? process.cwd();
  const generate = options.generate ?? {};
  const issues: LintIssue[] = [];
  const rel = (f: string) => relative(cwd, f);
  const dirs: string[] = [];
  for (const d of options.dirs.map((x) => resolve(cwd, x))) {
    if (existsSync(d)) dirs.push(d);
    else issues.push({ file: rel(d) || ".", line: 1, col: 1, rule: "dir-not-found", severity: "error", message: `The folder ${rel(d) || "."} does not exist, so nothing in it was checked. Fix: pass the folder that holds the templates and components (default: src).` });
  }

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
  for (const d of crossDirDuplicates(dirs)) issues.push({ ...d, file: rel(d.file) });

  if (options.write === false) {
    const defs = scanDefines(dirs);
    for (const dir of dirs) {
      for (const s of staleGenerated(dir, generate, defs, dirs)) {
        issues.push({ file: rel(s.file), line: 1, col: 1, rule: "stale-generated", severity: "error", message: `The generated file is ${s.reason}, so the type errors below may not match the templates. Fix: run ts-dom gen (or ts-dom check without --no-write).` });
      }
    }
  } else {
    try {
      generateDirs(dirs, generate);
    } catch (e) {
      if (!(e instanceof CodegenError)) throw e;
    }
  }

  const tsc = findTsc(cwd);
  if (!tsc) {
    issues.push({ file: ".", line: 1, col: 1, rule: "tsc-not-found", severity: "error", message: "TypeScript is not installed in this project, so no types were checked, and a check without them would pass with nothing looked at. Fix: npm i -D typescript (in CI, install the dev dependencies before ts-dom check)." });
  } else {
    // A solution-style tsconfig checks nothing itself: check each referenced project instead.
    const configs = projectConfigs(cwd, options.project);
    const runs = configs.length ? configs.map((c) => ["-p", c]) : [options.project ? ["-p", options.project] : []];
    const parsed: TscError[] = [];
    for (const extra of runs) {
      const run = spawnSync(process.execPath, [tsc.bin, "--noEmit", "--pretty", "false", ...extra], { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
      const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
      const errors = parseTscOutput(output);
      parsed.push(...errors);
      if (run.error || (run.status !== 0 && !errors.length)) {
        const detail = run.error ? String(run.error.message) : output.trim().split("\n").slice(0, 5).join(" ");
        issues.push({ file: extra[1] ? rel(extra[1]) : ".", line: 1, col: 1, rule: "tsc-failed", severity: "error", message: `${tsc.name} did not check the types: ${detail} Fix: make \`npx ${tsc.name} --noEmit\` run in this folder (a tsconfig.json, or --project=<path>).` });
      }
    }
    issues.push(...mapTscErrors(parsed, cwd));
  }

  const tsFiles = dirs.flatMap(listTs);
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


