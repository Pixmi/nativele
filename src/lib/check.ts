import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { analyze, CodegenError, duplicateDefines, generateDirs, isSelected, staleGenerated, staleIssue } from "./codegen.ts";
import { callArguments, classSpan, componentClassHeads, indexDirs, literalKeys, scanDefines, Workspace } from "./components.ts";
import type { ComponentIndex } from "./components.ts";
import { projectConfigs } from "./tsconfig.ts";
import type { GenerateOptions } from "./codegen.ts";
import { lintRun } from "./lint.ts";
import type { LintIssue } from "./lint.ts";

export const CHECK_RULES = {
  "stale-generated": "a generated file is missing, outdated or orphaned, so the type errors may not match the templates",
  "missing-binding": "a {{ hole }} or data-if names nothing in state, props or derive (found by tsc)",
  "conflicting-keys": "the same name is declared in more than one of state, props and derive (found by tsc)",
  "reserved-prop": "a prop is named like a member of HTMLElement or ts-dom (found by tsc)",
  "native-event-name": "an emitted event is named like a native DOM event (found by tsc)",
  "any-in-contract": "state, props, a derived value, an emitted detail, a data-on-* handler or its event parameter, or the template is typed any, which switches its checks off (found by tsc)",
  "missing-handler": "a data-on-* names a method the component class does not define (found by tsc through define())",
  "handler-event-type": "the first parameter of a data-on-* handler does not accept the event the template binds it to (found by tsc)",
  "item-prop-missing": "the data-prop of a list is not a prop of its item component (found by tsc)",
  "item-not-in-tag-map": "the item component is defined in a scanned folder but missing from ts-dom-tags.ts (found by tsc)",
  "item-class-not-exported": "the item component class passed to define() is not exported (found by tsc)",
  "define-class-not-exported": "define() passes a class its file does not export, so ts-dom-tags.ts leaves the tag out and its elements are typed as HTMLElement",
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
  /** The rule ids whose warnings the caller leaves out (see LintOptions). */
  ignore?: readonly string[];
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

const STRING = String.raw`"(?:[^"\\]|\\.)*"`;
const namesAfter = (message: string, key: string): string[] => {
  const m = new RegExp(`${key}: ((?:${STRING}(?:\\s*\\|\\s*)?)+)`).exec(message);
  return m ? [...(m[1] as string).matchAll(new RegExp(STRING, "g"))].map((x) => JSON.parse(x[0]) as string) : [];
};

/** The keys an `anyInContract` path names, from its option to the last named property, as written by AnyPath: `.name`, `["a.b"]`; it stops at `[1]`, `[]` and `[key]`. */
const pathKeys = (path: string): string[] => {
  const keys = [/^[\w$]+/.exec(path)?.[0] as string];
  for (let rest = path.slice(keys[0]?.length); ; ) {
    const m = /^\.([\w$]+)/.exec(rest) ?? new RegExp(`^\\[(${STRING})\\]`).exec(rest);
    if (!m) return keys;
    keys.push(m[0].startsWith(".") ? (m[1] as string) : (JSON.parse(m[1] as string) as string));
    rest = rest.slice(m[0].length);
  }
};

/** The `name: type` members of the object type that follows `key: ` in a tsc message. */
const membersAfter = (message: string, key: string): [string, string][] => {
  const start = message.indexOf(`${key}: { `);
  if (start < 0) return [];
  const out: [string, string][] = [];
  let depth = 0;
  let from = start + key.length + 4;
  for (let i = from; i < message.length; i++) {
    const c = message[i] as string;
    if ("({[<".includes(c)) depth++;
    else if (")]>".includes(c) && message[i - 1] !== "=") depth--;
    else if (c === "}" && depth-- === 0) break;
    else if (c === ";" && depth === 0) {
      const m = /^\s*"?([\w$]+)"?\??:\s*([\s\S]*)$/.exec(message.slice(from, i));
      if (m) out.push([m[1] as string, (m[2] as string).trim()]);
      from = i + 1;
    }
  }
  return out;
};

/**
 * Turn the tsc errors that come from the template contract into issues that point at the template, or at the line to change, with a Fix hint.
 * Other errors are kept as `tsc` issues. `dirs` are the scanned folders, which the template path in a contract error is relative to.
 */
export function mapTscErrors(errors: readonly TscError[], cwd: string, dirs: readonly string[] = [cwd], index: ComponentIndex = indexDirs(dirs.map((d) => resolve(cwd, d)).filter((d) => existsSync(d)))): LintIssue[] {
  const rel = (f: string) => relative(cwd, f);
  const out: LintIssue[] = [];
  const analyses = new Map<string, ReturnType<typeof analyze>>();
  const analysisOf = (html: string) => {
    let a = analyses.get(html);
    if (!a) analyses.set(html, (a = analyze(readFileSync(html, "utf8"))));
    return a;
  };
  const templateOf = (e: TscError): string | undefined => {
    const named = /\btemplate: "([^"]+)"/.exec(e.message)?.[1];
    if (!named) return undefined;
    const found = [...new Set(dirs.map((d) => resolve(cwd, d, named)))].filter((f) => existsSync(f));
    const file = resolve(cwd, e.file);
    return found.length > 1 ? (found.find((t) => index.byTemplate.get(t)?.some((c) => c.file === file || c.defines.some((d) => resolve(d.file) === file))) ?? found[0]) : found[0];
  };
  const locate = (e: TscError, keys: string[]) => {
    const html = templateOf(e);
    for (const key of html ? keys : []) {
      const loc = analysisOf(html as string).locs.get(key);
      if (loc) return { file: html as string, ...loc };
    }
    return undefined;
  };
  // A class whose Component(...) call has a contract error is typed as that error, so define() and member accesses on that class fail too, in any file, and their messages name the class.
  // In its own file those follow-up errors repeat the first one and are dropped; in other files they are kept, pointing at the error they follow from.
  // Inside its body a callback passed to a member of `this` loses its contextual type, so an implicitly any parameter there follows from it as well.
  const brokenClasses = new Map<string, { name: string; cause: TscError }>();
  const classKey = (file: string, name?: string) => `${file}\0${name ?? ""}`;
  const brokenBodies: { file: string; from: number; to: number }[] = [];
  for (const e of errors) {
    if (!/missingStateKeys|conflictingKeys|reservedPropNames|nativeEventNames|anyInContract/.test(e.message)) continue;
    const text = readFileSync(resolve(cwd, e.file), "utf8");
    const lines = text.split("\n");
    const head = componentClassHeads(lines[e.line - 1] ?? "")[0];
    if (!head?.name) continue;
    const key = classKey(resolve(cwd, e.file), head.name);
    if (!brokenClasses.has(key)) brokenClasses.set(key, { name: head.name, cause: e });
    const span = classSpan(text, lines.slice(0, e.line - 1).join("\n").length + (e.line > 1 ? 1 : 0) + head.open);
    if (span) brokenBodies.push({ file: rel(resolve(cwd, e.file)), from: e.line, to: text.slice(0, span.bodyEnd).split("\n").length });
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
      const found = locate(e, [`text:${name}`, `if:${name}`]);
      issue(
        "missing-binding",
        `"${name}" is used by {{ ${name} }} or data-if="${name}" but the component declares no state, prop or derived value of that name (tsc at ${where}). Fix: add "${name}" to state, props or derive, or remove it from the template.`,
        found && { file: rel(found.file), line: found.line, col: found.col },
      );
    }
    for (const name of namesAfter(e.message, "missingHandlers")) {
      named = true;
      const found = locate(e, [`event:${name}`]);
      issue(
        "missing-handler",
        `data-on-*="${name}" refers to a method the component class does not define (tsc at ${where}). Fix: add a public method \`${name}(e: Event, hit: EventHit)\` to the class.`,
        found && { file: rel(found.file), line: found.line, col: found.col },
      );
    }
    for (const [name, type] of membersAfter(e.message, "wrongHandlerParameters")) {
      named = true;
      const html = templateOf(e);
      const sites = html ? analysisOf(html).eventSites.filter((x) => x.method === name).map((x) => ({ html, ...x })) : [];
      const first = sites[0];
      const bound = sites.map((x) => `data-on-${x.event} on <${x.tag}>`);
      const child = type.includes("CustomEvent<") ? sites.find((x) => x.tag.includes("-")) : undefined;
      issue(
        "handler-event-type",
        `${name}() is bound to ${bound.length ? [...new Set(bound)].join(" and ") : "a data-on-* attribute"}, which delivers ${type}, but its first parameter does not accept that event (tsc at ${where}). Fix: type the first parameter as \`${type}\`${child ? ` (for data-on-${child.event} on <${child.tag}> that is \`EmitEvent<Child, "${child.event}">\` with the class that defines <${child.tag}>)` : ""}${type === "Event" ? "" : ", or as `Event`"}.`,
        first && { file: rel(first.html), line: first.line, col: first.col },
      );
    }
    for (const path of namesAfter(e.message, "anyInContract")) {
      named = true;
      if (path === "template") {
        issue("any-in-contract", `The template passed to Component() is typed any, or as a Template without the types ts-dom gen writes, so tsc checks none of its names: every {{ hole }}, data-if, data-ref and data-on-* is accepted (tsc at ${where}). Fix: import the template from its ./x.html.js module, which ts-dom gen types, and pass it to Component() directly, not through a value typed any.`);
        continue;
      }
      const handler = /^this\.([\w$]+)(\(event\))?$/.exec(path);
      if (handler) {
        const method = handler[1] as string;
        const html = templateOf(e);
        const sites = html ? analysisOf(html).eventSites.filter((x) => x.method === method).map((x) => ({ html, ...x })) : [];
        const bound = sites.length ? [...new Set(sites.map((x) => `data-on-${x.event} on <${x.tag}>`))].join(" and ") : "a data-on-* attribute";
        const first = sites[0];
        issue(
          "any-in-contract",
          handler[2]
            ? `The first parameter of ${method}(), which ${bound} calls, is typed any, so tsc does not check that it accepts the event the template binds it to (tsc at ${where}). Fix: type it as the event it receives (\`Event\` always fits; ts-dom check names the exact type when a narrower one is wrong), or as \`unknown\` and narrow it.`
            : `${method}, which ${bound} calls, is typed any, so tsc checks neither that it is a method nor which event it accepts (tsc at ${where}). Fix: declare it as a method, \`${method}(e: Event): void { ... }\`, or give the property a function type, \`${method} = (e: Event): void => { ... }\`.`,
          first && { file: rel(first.html), line: first.line, col: first.col },
        );
        continue;
      }
      const keys = pathKeys(path);
      const at = declarationAt(readFileSync(file, "utf8"), e, keys);
      const what = keys[0] === "emits" ? `The detail of ${path} is typed any, so tsc checks neither what emit() sends nor what the parent's handler reads from it` : `${path} is typed any, so tsc checks nothing that reads or assigns it: the template, render(), derive and the parent all accept any value there`;
      const fix = keys[0] === "emits" ? `declare the detail type, event<{ id: string }>(), or event<unknown>() and narrow it in the handler` : `declare a specific type (an empty array or null default needs one: \`[] as Todo[]\`, \`null as User | null\`; a value from JSON.parse or a fetch needs an annotation), or \`unknown\` and narrow it where it is read`;
      issue("any-in-contract", `${what} (tsc at ${where}). Fix: ${fix}.`, at && { file: rel(file), ...at });
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
    else if (e.code === "TS2307" && /'[^']*\.html\.js'/.test(e.message)) issue("tsc", `${e.code}: ${e.message} The module is a template's generated file, which does not exist yet. Fix: run ts-dom gen (or ts-dom check without --no-write), and make sure the folder that holds the .html file is among the scanned folders.`);
    else issue("tsc", `${e.code}: ${e.message} Fix: change the TypeScript at this location so the types agree; ts-dom rules --explain=tsc.`);
  }
  const named = new Map<string, string[]>();
  for (const c of index.components) if (c.name) named.set(c.name, [...(named.get(c.name) ?? []), classKey(c.file, c.name)]);
  // A type name in a message is the class it names in the file the error is in; outside the index, only a name no other class has.
  const brokenIn = (message: string, file: string) => {
    const types = [...message.matchAll(/'([^']*)'/g)].flatMap((m) => topLevelMembers(m[1] as string).map((t) => t.replace(/^typeof\s+/, "")));
    for (const t of types) {
      const target = index.resolve(file, t);
      let key: string | undefined;
      if (target?.kind === "class") key = classKey(target.file, target.name);
      else if (!target && (named.get(t)?.length ?? 0) <= 1) key = [...brokenClasses].find(([, b]) => b.name === t)?.[0];
      const broken = key && brokenClasses.get(key);
      if (broken) return { ...broken, own: (key as string).startsWith(`${file}\0`) };
    }
    return undefined;
  };
  return out.flatMap((i) => {
    const file = resolve(cwd, i.file);
    const cls = i.rule === "tsc" ? brokenIn(i.message, file) : undefined;
    if (i.rule === "tsc" && /^TS70(06|31): /.test(i.message) && brokenBodies.some((b) => b.file === i.file && i.line > b.from && i.line <= b.to)) return [];
    if (cls === undefined) return [i];
    if (cls.own || /(^|[\\/])node_modules[\\/]/.test(i.file)) return [];
    const first = firstIssueOf.get(cls.cause);
    const at = first ? `${first.file}:${first.line}:${first.col} [${first.rule}]` : `${rel(resolve(cwd, cls.cause.file))}:${cls.cause.line}:${cls.cause.col}`;
    return [{ ...i, message: `${i.message.replace(/ Fix: .*$/s, "")} This error follows from the contract error of ${cls.name} at ${at}, which makes tsc type ${cls.name} as that error instead of an element. Fix: fix that error first; this one then goes away.` }];
  });
}

/** Where the deepest of `keys` (an option of the Component(...) call that a tsc error at `e` reports, then the properties inside it) is written in that call's object literals. */
function declarationAt(text: string, e: TscError, keys: readonly string[]): { line: number; col: number } | undefined {
  const lines = text.split("\n");
  const head = componentClassHeads(lines[e.line - 1] ?? "")[0];
  if (!head) return undefined;
  let open = callArguments(text, lines.slice(0, e.line - 1).join("\n").length + (e.line > 1 ? 1 : 0) + head.open)[1];
  let found: number | undefined;
  for (const key of keys) {
    if (open === undefined || text[open] !== "{") break;
    const entry = literalKeys(text, open).find((k) => k.name === key);
    if (!entry) break;
    found = entry.at;
    open = entry.value < 0 ? undefined : entry.value;
  }
  if (found === undefined) return undefined;
  const before = text.slice(0, found).split("\n");
  return { line: before.length, col: (before.at(-1) as string).length + 1 };
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

/** The given folders that exist, as given, and a `dir-not-found` issue for each that does not; every command that takes folders goes through this. */
export function splitDirs(given: readonly string[], cwd = process.cwd()): { dirs: string[]; missing: LintIssue[] } {
  const dirs: string[] = [];
  const missing: LintIssue[] = [];
  for (const d of given) {
    const file = relative(cwd, resolve(cwd, d)) || ".";
    if (existsSync(resolve(cwd, d))) dirs.push(d);
    else missing.push({ file, line: 1, col: 1, rule: "dir-not-found", severity: "error", message: `The folder ${file} does not exist, so nothing in it was checked. Fix: pass the folder that holds the templates and components (default: src).` });
  }
  return { dirs, missing };
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
  const split = splitDirs(options.dirs, cwd);
  const dirs = split.dirs.map((d) => resolve(cwd, d));
  issues.push(...split.missing);

  const ws = new Workspace();
  const lint = lintRun(dirs, { a11y: !!options.a11y, cwd, ws, ignore: options.ignore });
  for (const t of lint.templates) if (isSelected(t.dir, t.file, generate)) for (const d of t.diagnostics) issues.push({ file: rel(t.file), ...d });

  for (const d of duplicateDefines(dirs, ws)) issues.push({ ...d, file: rel(d.file) });
  for (const d of ws.index(dirs).defines) {
    if (!d.class || d.class.exportName !== undefined) continue;
    const name = d.class.name ?? d.id;
    issues.push({ file: rel(d.file), line: d.line, col: d.col, rule: "define-class-not-exported", severity: "warning", message: `define("${d.tag}", ${d.id}) passes the class ${name}, which ${rel(d.class.file)} does not export, so ts-dom-tags.ts leaves <${d.tag}> out: a ref or a list item of it is typed as HTMLElement, and its props are not checked. Fix: export the class (export class ${name} ...).` });
  }

  if (options.write === false) {
    const defs = scanDefines(dirs, ws);
    for (const dir of dirs) {
      for (const s of staleGenerated(dir, generate, defs, dirs, ws)) {
        issues.push(staleIssue(rel(s.file), s.reason));
      }
    }
  } else {
    try {
      generateDirs(dirs, generate, ws);
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
      const run = spawnSync(process.execPath, [tsc.bin, "--noEmit", "--pretty", "false", "--noErrorTruncation", ...extra], { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
      const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
      const errors = parseTscOutput(output);
      parsed.push(...errors);
      if (run.error || (run.status !== 0 && !errors.length)) {
        const detail = run.error ? String(run.error.message) : output.trim().split("\n").slice(0, 5).join(" ");
        issues.push({ file: extra[1] ? rel(extra[1]) : ".", line: 1, col: 1, rule: "tsc-failed", severity: "error", message: `${tsc.name} did not check the types: ${detail} Fix: make \`npx ${tsc.name} --noEmit\` run in this folder (a tsconfig.json, or --project=<path>).` });
      }
    }
    issues.push(...mapTscErrors(parsed, cwd, dirs, ws.index(dirs)));
  }

  issues.push(...lint.issues);
  const seen = new Set<string>();
  return issues
    .filter((i) => {
      const k = `${i.file}:${i.line}:${i.col}:${i.rule}:${i.message}`;
      return !seen.has(k) && seen.add(k) !== undefined;
    })
    .sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line || x.col - y.col);
}


