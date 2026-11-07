import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const TAGS_FILE = "ts-dom-tags.ts";

export function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    if (entry.isDirectory() || (entry.isSymbolicLink() && statSync(full).isDirectory())) out.push(...listTs(full));
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts") && !name.endsWith(".html.ts") && name !== TAGS_FILE) out.push(full);
  }
  return out;
}

/** The offset just past the string literal, template literal or comment that starts at `i` (the end of `code` when it is not closed), or `i` when none starts there. */
function skipNonCode(code: string, i: number): number {
  const c = code[i];
  if (c === '"' || c === "'" || c === "`") {
    let j = i + 1;
    for (; j < code.length && code[j] !== c; j++) if (code[j] === "\\") j++;
    return Math.min(j + 1, code.length);
  }
  if (c === "/" && code[i + 1] === "/") {
    const end = code.indexOf("\n", i);
    return end < 0 ? code.length : end;
  }
  if (c === "/" && code[i + 1] === "*") {
    const end = code.indexOf("*/", i + 2);
    return end < 0 ? code.length : end + 2;
  }
  return i;
}

/** Ranges [start, end) of the string literals, template literals and comments of a piece of TypeScript source. */
function nonCodeRanges(code: string): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < code.length; i++) {
    const end = skipNonCode(code, i);
    if (end > i) {
      out.push([i, end]);
      i = end - 1;
    }
  }
  return out;
}

/** From `start`, find the position that closes `open` (skipping strings and comments); -1 when it is not closed. */
export function matchClose(code: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    const end = skipNonCode(code, i);
    if (end > i) i = end - 1;
    else if (code[i] === open) depth++;
    // The > of an arrow in a type parameter list closes nothing.
    else if (code[i] === close && !(close === ">" && code[i - 1] === "=") && --depth === 0) return i;
  }
  return -1;
}

/** How a module names a template: a relative path to the `.html` file, with `.js` (the form that works with and without a bundler) or, wrongly, without it. */
const TEMPLATE_PATH = String.raw`(\.{1,2}\/[^"']+\.html)(\.js)?`;
export const TEMPLATE_SPEC = new RegExp(`^${TEMPLATE_PATH}$`);
const TEMPLATE_IMPORT = new RegExp(String.raw`(?:\bimport\s+([A-Za-z_$][\w$]*)\s+)?\bfrom\s+["']${TEMPLATE_PATH}["']`, "g");

export interface TemplateImport {
  /** The local name of the default import, when the template is imported as one. */
  local?: string;
  spec: string;
  /** The template's path relative to the importing module: the specifier without `.js`. */
  html: string;
  js: boolean;
}

/** Every `import x from "./x.html.js"` (or other `from` clause naming a template by a relative path) in `code`, outside strings and comments. */
export function templateImports(code: string): TemplateImport[] {
  const found = [...code.matchAll(TEMPLATE_IMPORT)];
  const skip = found.length ? nonCodeRanges(code) : [];
  return found.filter((m) => !skip.some(([a, b]) => m.index >= a && m.index < b)).map((m) => {
    const html = m[2] as string;
    return { ...(m[1] ? { local: m[1] } : {}), spec: html + (m[3] ?? ""), html, js: m[3] !== undefined };
  });
}

const CLASS_NAME = /\bclass\b(?:\s+(?!extends\b)([A-Za-z_$][\w$]*))?\s*/g;
const EXTENDS_COMPONENT = /\s*extends\s+Component\s*\(/y;

/** Every `class X extends Component(` in `code`, also with type parameters (`class X<T>`): the class name (none for `class extends`) and the offset of the `(`. */
export function componentClassHeads(code: string): { name?: string; open: number }[] {
  return classHeads(code, () => true).flatMap((h) => (h.open === undefined ? [] : [{ ...(h.name ? { name: h.name } : {}), open: h.open }]));
}

function classHeads(code: string, inCode: (pos: number) => boolean): { name?: string; at: number; open?: number }[] {
  const out: { name?: string; at: number; open?: number }[] = [];
  for (const m of code.matchAll(CLASS_NAME)) {
    if (!inCode(m.index)) continue;
    let at = m.index + m[0].length;
    if (code[at] === "<") {
      const end = matchClose(code, at, "<", ">");
      if (end < 0) continue;
      at = end + 1;
    }
    EXTENDS_COMPONENT.lastIndex = at;
    const e = EXTENDS_COMPONENT.exec(code);
    out.push({ ...(m[1] ? { name: m[1] } : {}), at: m.index, ...(e ? { open: at + e[0].length - 1 } : {}) });
  }
  return out;
}

/** The `Component(...)` call whose `(` is at `open` and the class body after it: the offsets of the call's `)` and of the body's braces; null when one is not closed. */
export function classSpan(code: string, open: number): { callEnd: number; bodyStart: number; bodyEnd: number } | null {
  const callEnd = matchClose(code, open, "(", ")");
  if (callEnd < 0) return null;
  const bodyStart = code.indexOf("{", callEnd);
  if (bodyStart < 0) return null;
  const bodyEnd = matchClose(code, bodyStart, "{", "}");
  return bodyEnd > 0 ? { callEnd, bodyStart, bodyEnd } : null;
}

// ---------------------------------------------------------------------------
// What one module declares: its imports, exports, classes and define() calls
// ---------------------------------------------------------------------------

interface Binding {
  local: string;
  imported: string;
  spec: string;
}
interface ClassDecl {
  name?: string;
  line: number;
  col: number;
  /** `arg` is the identifier or the member access (`t.card`) passed to Component(). */
  component?: { arg?: string; call: string; body: string; endLine: number };
}
export interface ModuleFacts {
  imports: Binding[];
  /** `export { a as b } from "spec"` is { local: "b", imported: "a" }; `export * from "spec"` is { local: "*", imported: "*" }. */
  reexports: Binding[];
  /** Exported name to local name; a `default` export of a class without a name has no local name. */
  exports: Map<string, string | undefined>;
  classes: ClassDecl[];
  defines: { tag: string; id: string; line: number; col: number }[];
}

const IDENT = String.raw`[A-Za-z_$][\w$]*`;
const IMPORT = new RegExp(String.raw`\bimport\s+(?:type\s+)?((?:${IDENT}\s*,?\s*)?(?:\{[^}]*\}|\*\s*as\s+${IDENT})?)\s*from\s*(["'])([^"'\n]+)\2`, "g");
const REEXPORT = new RegExp(String.raw`\bexport\s+(?:type\s+)?(\*(?:\s*as\s+(${IDENT}))?|\{[^}]*\})\s*from\s*(["'])([^"'\n]+)\3`, "g");
const EXPORT_LIST = /\bexport\s+(?:type\s+)?\{([^}]*)\}(?!\s*from\b)/g;
const EXPORT_CLASS = new RegExp(String.raw`\bexport\s+(default\s+)?(?:abstract\s+)?class\b(?:\s+(?!extends\b)(${IDENT}))?`, "g");
const EXPORT_DEFAULT = new RegExp(String.raw`\bexport\s+default\s+(?!class\b|abstract\b|function\b|async\b)(${IDENT})\s*(?:;|$)`, "gm");
const DEFINE = /\bdefine\(\s*(["'])([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\1\s*,\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\)/g;

/** `a`, `a as b`, `type a as b` inside braces, as [imported or local name, name after `as`]. */
const listEntries = (list: string): [string, string][] =>
  list.split(",").flatMap((e) => {
    const m = new RegExp(String.raw`^\s*(?:type\s+)?(${IDENT}|default)(?:\s+as\s+(${IDENT}|default))?\s*$`).exec(e);
    return m ? [[m[1] as string, (m[2] ?? m[1]) as string] as [string, string]] : [];
  });

export function moduleFacts(code: string): ModuleFacts {
  const skip = nonCodeRanges(code);
  const inCode = (pos: number) => !skip.some(([a, b]) => pos >= a && pos < b);
  const lineStarts = [0];
  for (let i = code.indexOf("\n"); i >= 0; i = code.indexOf("\n", i + 1)) lineStarts.push(i + 1);
  const loc = (pos: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] as number) <= pos) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: pos - (lineStarts[lo] as number) + 1 };
  };
  const facts: ModuleFacts = { imports: [], reexports: [], exports: new Map(), classes: [], defines: [] };
  for (const m of code.matchAll(IMPORT)) {
    if (!inCode(m.index)) continue;
    const clause = m[1] as string;
    const spec = m[3] as string;
    const def = new RegExp(`^(${IDENT})\\b`).exec(clause.trim())?.[1];
    if (def) facts.imports.push({ local: def, imported: "default", spec });
    const ns = new RegExp(`\\*\\s*as\\s+(${IDENT})`).exec(clause)?.[1];
    if (ns) facts.imports.push({ local: ns, imported: "*", spec });
    const braces = /\{([^}]*)\}/.exec(clause)?.[1];
    if (braces) for (const [imported, local] of listEntries(braces)) facts.imports.push({ local, imported, spec });
  }
  for (const m of code.matchAll(REEXPORT)) {
    if (!inCode(m.index)) continue;
    const what = m[1] as string;
    const spec = m[4] as string;
    if (what.startsWith("*")) facts.reexports.push(m[2] ? { local: m[2], imported: "*", spec } : { local: "*", imported: "*", spec });
    else for (const [imported, local] of listEntries(what.slice(1, -1))) facts.reexports.push({ local, imported, spec });
  }
  for (const m of code.matchAll(EXPORT_LIST)) if (inCode(m.index)) for (const [local, exported] of listEntries(m[1] as string)) facts.exports.set(exported, local);
  for (const m of code.matchAll(EXPORT_CLASS)) if (inCode(m.index)) facts.exports.set(m[1] ? "default" : (m[2] as string), m[2]);
  for (const m of code.matchAll(EXPORT_DEFAULT)) if (inCode(m.index)) facts.exports.set("default", m[1]);
  for (const head of classHeads(code, inCode)) {
    const decl: ClassDecl = { ...(head.name ? { name: head.name } : {}), ...loc(head.at) };
    const span = head.open === undefined ? null : classSpan(code, head.open);
    if (head.open !== undefined && span) {
      const call = code.slice(head.open, span.callEnd + 1);
      const arg = new RegExp(`^\\(\\s*(${IDENT}(?:\\s*\\.\\s*${IDENT})*)`).exec(call)?.[1]?.replace(/\s+/g, "");
      decl.component = { ...(arg ? { arg } : {}), call, body: code.slice(span.bodyStart, span.bodyEnd + 1), endLine: loc(span.bodyEnd).line };
    }
    facts.classes.push(decl);
  }
  for (const m of code.matchAll(DEFINE)) if (inCode(m.index)) facts.defines.push({ tag: m[2] as string, id: (m[3] as string).replace(/\s+/g, ""), ...loc(m.index) });
  return facts;
}

// ---------------------------------------------------------------------------
// The component index: templates, component classes, define() calls and tags, resolved through imports
// ---------------------------------------------------------------------------

/** Where the index reads source files from. */
export interface Sources {
  text(file: string): string | null;
  facts?(file: string): ModuleFacts | undefined;
}

interface FileEntry {
  text: string;
  /** Changes with the content, so a result can tell whether a file it read is still the same. */
  rev: number;
  facts?: ModuleFacts;
  /** The size, times and inode of the file as it was read; none for an overlay. */
  stamp?: string;
  /** The file had not changed for longer than TIMESTAMP_GRANULARITY when it was read, so a later rewrite changes `stamp`. */
  settled?: boolean;
}

// FAT keeps modification times in 2 s steps, and a rewrite within one step keeps the size and the times.
const TIMESTAMP_GRANULARITY = 2000;

function readText(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

function statOf(file: string) {
  try {
    return statSync(file, { throwIfNoEntry: false });
  } catch {
    return undefined;
  }
}

/** The revision of each file something was computed from as it read it, 0 for a file that did not exist. */
type Deps = Map<string, number>;

/**
 * The source files that runs read, and what is derived from them. A look at a file reads it again unless it has the size, times and inode it had when it was read
 * and had not changed for longer than the timestamp granularity then (git's racy timestamp check), since a rewrite of the same size soon after a read can keep the times;
 * its revision changes only when its content does. A computation that looks at a file again is given the content it read first.
 * A derived result (see `result`) and an index record the revision of each file they read, also of one that did not exist, and are computed again when one of them changes.
 * It keeps texts, module facts and results such as diagnostics, never parse trees, and forgets a file that no longer exists.
 * A command line run starts with an empty one; the Vite and oxlint plugins keep theirs while they run.
 */
export class Workspace implements Sources {
  readonly #files = new Map<string, FileEntry>();
  readonly #overlay = new Map<string, string>();
  readonly #results = new Map<string, { file: string; sig: string; uses: string[]; deps: Deps; value: unknown }>();
  #reading: Deps | null = null;
  readonly #indexes = new Map<string, { listing: string; at: number; index: ComponentIndex; deps: Deps; stale: boolean; derived: Map<string, { value: unknown; deps: Deps }> }>();
  #rev = 0;

  #entry(file: string): FileEntry | undefined {
    const known = this.#files.get(file);
    if (this.#reading?.has(file)) return known;
    let text = this.#overlay.get(file);
    let stamp: string | undefined;
    let settled = false;
    if (text === undefined) {
      const readAt = Date.now();
      const st = statOf(file);
      if (st?.isFile()) {
        stamp = `${st.size}:${st.mtimeMs}:${st.ctimeMs}:${st.ino}`;
        if (known?.settled && known.stamp === stamp) return known;
        text = readText(file);
        settled = readAt - Math.max(st.mtimeMs, st.ctimeMs) > TIMESTAMP_GRANULARITY;
      }
    }
    if (known?.text === text) {
      if (known && stamp !== undefined) Object.assign(known, { stamp, settled });
      return known;
    }
    for (const i of this.#indexes.values()) if (i.deps.has(file)) i.stale = true;
    if (text === undefined) {
      this.#files.delete(file);
      return undefined;
    }
    const entry: FileEntry = { text, rev: ++this.#rev, stamp, settled };
    this.#files.set(file, entry);
    return entry;
  }

  #read(file: string): FileEntry | undefined {
    const e = this.#entry(file);
    if (this.#reading && !this.#reading.has(file)) this.#reading.set(file, e?.rev ?? 0);
    return e;
  }
  /** Add `deps` to what the result being computed read. */
  #reuse(deps: Deps): void {
    if (this.#reading) for (const [f, rev] of deps) if (!this.#reading.has(f)) this.#reading.set(f, rev);
  }
  #current(deps: Deps): boolean {
    for (const [f, rev] of deps) if (this.rev(f) !== rev) return false;
    return true;
  }
  #recording<T>(compute: () => T): { value: T; deps: Deps } {
    const outer = this.#reading;
    const deps: Deps = (this.#reading = new Map());
    try {
      return { value: compute(), deps };
    } finally {
      this.#reading = outer;
      this.#reuse(deps);
    }
  }

  text(file: string): string | null {
    return this.#read(file)?.text ?? null;
  }
  facts(file: string): ModuleFacts | undefined {
    const e = this.#read(file);
    return e && (e.facts ??= moduleFacts(e.text));
  }
  /** A number that changes when the file's content does; 0 when it does not exist. */
  rev(file: string): number {
    return this.#entry(file)?.rev ?? 0;
  }
  /** Read `file` as `text` instead of from disk (an editor's unsaved buffer), or from disk again with undefined. */
  overlay(file: string, text: string | undefined): void {
    if (text === undefined) this.#overlay.delete(file);
    else this.#overlay.set(file, text);
  }

  /**
   * The index of the TypeScript files under `dirs`. It is built again when the listing or a file it read changed;
   * within `maxAge` milliseconds of the last look, the folders are not listed again unless a change to a file it read was seen.
   */
  index(dirs: readonly string[], maxAge = 0): ComponentIndex {
    const key = dirs.map((d) => resolve(d)).join("\0");
    const last = this.#indexes.get(key);
    if (last && !last.stale && Date.now() - last.at < maxAge) {
      this.#reuse(last.deps);
      return last.index;
    }
    const files = dirs.flatMap(listTs);
    const listing = files.join("\0");
    if (last && last.listing === listing && this.#current(last.deps)) {
      last.at = Date.now();
      last.stale = false;
      this.#reuse(last.deps);
      return last.index;
    }
    for (const f of this.#files.keys()) this.#entry(f);
    for (const [k, r] of this.#results) if (!this.#files.has(r.file)) this.#results.delete(k);
    const { value: index, deps } = this.#recording(() => componentIndex(files, this));
    index.revs = deps;
    this.#indexes.set(key, { listing, at: Date.now(), index, deps, stale: false, derived: new Map() });
    return index;
  }

  /**
   * `compute()`, kept with `index` for `key`: the files it reads, also one that does not exist, become files the index read, so the index and what is kept with it are built again when one changes.
   * Not kept for an index this workspace did not build.
   */
  derived<T>(index: ComponentIndex, key: string, compute: () => T): T {
    const entry = [...this.#indexes.values()].find((i) => i.index === index);
    if (!entry) return compute();
    const kept = entry.derived.get(key);
    if (kept) {
      this.#reuse(kept.deps);
      return kept.value as T;
    }
    const { value, deps } = this.#recording(compute);
    for (const [f, rev] of deps) if (!entry.deps.has(f)) entry.deps.set(f, rev);
    entry.derived.set(key, { value, deps });
    return value;
  }

  /**
   * `compute(uses)`, or what it returned last time for `key` while none of the files it read changed and `sigOf` gives the same for what it added to `uses`
   * (the names it looked up in something other than a file, such as the definitions of tags in the index). `file` is the file the result is about: the result is forgotten with it.
   */
  result<T>(key: string, file: string, sigOf: (uses: readonly string[]) => string, compute: (uses: Set<string>) => T): { value: T; computed: boolean } {
    const last = this.#results.get(key);
    if (last && this.#current(last.deps) && sigOf(last.uses) === last.sig) {
      this.#reuse(last.deps);
      return { value: last.value as T, computed: false };
    }
    const uses = new Set<string>();
    const { value, deps } = this.#recording(() => compute(uses));
    this.#results.set(key, { file, sig: sigOf([...uses]), uses: [...uses], deps, value });
    return { value, computed: true };
  }

  /** What the last result for `key` added to `uses`. */
  uses(key: string): readonly string[] | undefined {
    return this.#results.get(key)?.uses;
  }

  /** The files of the results that read `file`. */
  dependents(file: string): string[] {
    return [...new Set([...this.#results.values()].filter((r) => r.deps.has(file)).map((r) => r.file))];
  }

  get size(): { files: number; results: number; values: unknown[] } {
    return { files: this.#files.size, results: this.#results.size, values: [...this.#results.values()].map((r) => r.value) };
  }
}

/** A class `Component(<template>, { ... })` and what defines it. */
export interface ComponentRef {
  /** The file that declares the class (absolute). */
  file: string;
  name?: string;
  /** The identifier the class passes to Component(). */
  arg?: string;
  /** The template the class passes to Component() (absolute), when the argument can be followed to one. */
  template?: string;
  /** Text of the `Component(...)` call, parentheses included. */
  call: string;
  /** Text of the class body, braces included. */
  body: string;
  line: number;
  col: number;
  endLine: number;
  defines: DefineSite[];
}

export interface DefineSite {
  tag: string;
  /** The identifier passed to define(). */
  id: string;
  /** The file with the define() call (as listed, or absolute when it was reached through an import). */
  file: string;
  line: number;
  col: number;
  /** The class passed to define(), when it can be followed to its declaration. */
  class?: { file: string; name?: string; exportName?: string };
  component?: ComponentRef;
}

export interface ComponentIndex {
  components: ComponentRef[];
  /** The component classes each file declares. */
  byFile: Map<string, ComponentRef[]>;
  /** The component classes that pass this template to Component(). */
  byTemplate: Map<string, ComponentRef[]>;
  /** The modules that import this template themselves (`import x from "./x.html.js"` or `import * as x from "./x.html.js"`), by template. */
  importers: Map<string, { file: string; local: string }[]>;
  defines: DefineSite[];
  byTag: Map<string, DefineSite[]>;
  /** The module facts of every file the index read, by absolute path. */
  modules: Map<string, ModuleFacts>;
  /** What the name `id` in `file` refers to: a class declaration or a template. */
  resolve(file: string, id: string): Target | undefined;
  /** For an index a Workspace built: the revision of each file as the index read it, 0 for one that did not exist. */
  revs?: ReadonlyMap<string, number>;
}

type Target = { kind: "class"; file: string; name?: string } | { kind: "template"; file: string } | { kind: "namespace"; file: string };

const TS_EXTENSIONS = [".ts", ".tsx", ".mts"];

/** Build the index from the TypeScript files `files`, following relative imports into other files as needed. */
export function componentIndex(files: readonly string[], sources: Sources = new Workspace()): ComponentIndex {
  const modules = new Map<string, ModuleFacts>();
  const listed = new Map<string, string>();
  for (const f of files) if (!listed.has(resolve(f))) listed.set(resolve(f), f);
  const facts = (file: string): ModuleFacts | undefined => {
    if (!modules.has(file)) {
      const m = sources.facts ? sources.facts(file) : (() => {
        const text = sources.text(file);
        return text === null ? undefined : moduleFacts(text);
      })();
      if (!m) return undefined;
      modules.set(file, m);
    }
    return modules.get(file);
  };
  const target = (from: string, spec: string): string | undefined => {
    if (!spec.startsWith(".")) return undefined;
    const base = resolve(dirname(from), spec);
    const html = /^(.*\.html)(?:\.js)?$/.exec(base)?.[1];
    if (html) return html;
    const stem = base.replace(/\.(?:m?js|jsx)$/, "");
    const candidates = [...(/\.m?tsx?$/.test(base) ? [base] : []), ...TS_EXTENSIONS.map((e) => stem + e), ...TS_EXTENSIONS.map((e) => join(base, `index${e}`))];
    return candidates.find((c) => listed.has(c) || modules.has(c)) ?? candidates.find((c) => !c.includes("/node_modules/") && facts(c));
  };
  const resolveExport = (file: string, name: string, seen: Set<string>): Target | undefined => {
    if (file.endsWith(".html")) return name === "default" ? { kind: "template", file } : undefined;
    const key = `${file}\0${name}`;
    const m = facts(file);
    if (!m || seen.has(key)) return undefined;
    seen.add(key);
    if (m.exports.has(name)) {
      const local = m.exports.get(name);
      return local === undefined ? { kind: "class", file } : resolveLocal(file, local, seen);
    }
    for (const r of m.reexports) {
      if (r.local === name) {
        const t = target(file, r.spec);
        if (t) return r.imported === "*" ? { kind: "namespace", file: t } : resolveExport(t, r.imported, seen);
      }
    }
    if (name === "default") return undefined;
    for (const r of m.reexports) {
      if (r.local !== "*") continue;
      const t = target(file, r.spec);
      const found = t && resolveExport(t, name, seen);
      if (found) return found;
    }
    return undefined;
  };
  const resolveLocal = (file: string, id: string, seen = new Set<string>()): Target | undefined => {
    const m = facts(file);
    if (!m) return undefined;
    const [head = "", ...members] = id.split(".");
    let found: Target | undefined;
    if (m.classes.some((c) => c.name === head)) found = { kind: "class", file, name: head };
    else {
      const b = m.imports.find((i) => i.local === head);
      const t = b && target(file, b.spec);
      found = t ? (b.imported === "*" ? { kind: "namespace", file: t } : resolveExport(t, b.imported, seen)) : undefined;
    }
    for (const member of members) found = found?.kind === "namespace" ? resolveExport(found.file, member, seen) : undefined;
    return found;
  };

  const components: ComponentRef[] = [];
  const byFile = new Map<string, ComponentRef[]>();
  const byTemplate = new Map<string, ComponentRef[]>();
  const importers = new Map<string, { file: string; local: string }[]>();
  const defines: DefineSite[] = [];
  for (const [file, path] of listed) {
    const m = facts(file);
    if (!m) continue;
    for (const c of m.classes) {
      if (!c.component) continue;
      const t = c.component.arg ? resolveLocal(file, c.component.arg) : undefined;
      const ref: ComponentRef = { file, ...(c.name ? { name: c.name } : {}), ...(c.component.arg ? { arg: c.component.arg.split(".")[0] } : {}), ...(t?.kind === "template" ? { template: t.file } : {}), call: c.component.call, body: c.component.body, line: c.line, col: c.col, endLine: c.component.endLine, defines: [] };
      components.push(ref);
      byFile.set(file, [...(byFile.get(file) ?? []), ref]);
      if (ref.template) byTemplate.set(ref.template, [...(byTemplate.get(ref.template) ?? []), ref]);
    }
    for (const i of m.imports) {
      const t = i.imported === "default" || i.imported === "*" ? target(file, i.spec) : undefined;
      if (t?.endsWith(".html")) importers.set(t, [...(importers.get(t) ?? []), { file, local: i.local }]);
    }
    for (const d of m.defines) defines.push({ tag: d.tag, id: d.id, file: path, line: d.line, col: d.col, ...classOf(file, d.id) });
  }
  function classOf(file: string, id: string): Pick<DefineSite, "class"> {
    const t = resolveLocal(file, id);
    if (t?.kind !== "class") return {};
    const exportName = [...(facts(t.file)?.exports ?? [])].find(([, local]) => local === t.name)?.[0];
    return { class: { file: t.file, ...(t.name ? { name: t.name } : {}), ...(exportName ? { exportName } : {}) } };
  }
  const byTag = new Map<string, DefineSite[]>();
  for (const d of defines) {
    const c = d.class && components.find((r) => r.file === d.class?.file && r.name === d.class?.name);
    if (c) {
      d.component = c;
      c.defines.push(d);
    }
    byTag.set(d.tag, [...(byTag.get(d.tag) ?? []), d]);
  }
  defines.sort((a, b) => a.tag.localeCompare(b.tag));
  return { components, byFile, byTemplate, importers, defines, byTag, modules, resolve: (file, id) => resolveLocal(resolve(file), id) };
}

export const indexDirs = (dirs: string | readonly string[], ws: Workspace = new Workspace()): ComponentIndex => ws.index(typeof dirs === "string" ? [dirs] : dirs);

export interface DefineDef {
  tag: string;
  /** The name the tag map imports the class by: its export name in its own file, or its declared name. */
  className: string;
  /** The .ts file containing the define() call (absolute, or relative to the working directory) */
  file: string;
  /** The .ts file that declares the class (the define() file when the class cannot be followed) */
  classFile: string;
  /** The class is exported from the file that declares it, so a type can be generated for it */
  exported: boolean;
  isDefault: boolean;
  /** Position of the define() call */
  line?: number;
  col?: number;
}

/** Every define("my-tag", MyClass) call in the index, with the class followed to the file that declares it. */
export function defineDefs(index: ComponentIndex): DefineDef[] {
  return index.defines.map((d) => {
    const exportName = d.class?.exportName;
    return { tag: d.tag, className: exportName && exportName !== "default" ? exportName : (d.class?.name ?? d.id), file: d.file, classFile: d.class?.file ?? d.file, exported: exportName !== undefined, isDefault: exportName === "default", line: d.line, col: d.col };
  });
}

/**
 * Scan one or more directories for every `define("my-tag", MyClass)` call; a file under two of them is read once.
 * Calls that only appear inside a string or a comment (for example sample code in a test or in documentation) are ignored.
 */
export function scanDefines(dirs: string | readonly string[], ws?: Workspace): DefineDef[] {
  return defineDefs(indexDirs(dirs, ws));
}
