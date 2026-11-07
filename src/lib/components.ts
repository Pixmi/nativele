import { type Dirent, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export const TAGS_FILE = "ts-dom-tags.ts";

export const isTs = (file: string) => file.endsWith(".ts") && !file.endsWith(".d.ts") && !file.endsWith(".html.ts") && basename(file) !== TAGS_FILE;

/** A folder or link that vanishes between listing its parent and reading it (a host that outlives the edit) counts as empty or as a file. */
function readEntries(dir: string): { name: string; folder: boolean }[] {
  const isFolder = (e: Dirent) => {
    if (e.isDirectory()) return true;
    if (!e.isSymbolicLink()) return false;
    try {
      return statSync(join(dir, e.name)).isDirectory();
    } catch {
      return false;
    }
  };
  try {
    return readdirSync(dir, { withFileTypes: true }).map((e) => ({ name: e.name, folder: isFolder(e) }));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw e;
  }
}

export function listTs(dir: string, ws = new Workspace()): string[] {
  const out: string[] = [];
  for (const { name, folder } of ws.entries(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    if (folder) out.push(...listTs(join(dir, name), ws));
    else if (isTs(name)) out.push(join(dir, name));
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

/** The offset of the `,` that ends the expression starting at `from` (or of `end`, when none does before it), skipping brackets, strings and comments. */
function expressionEnd(code: string, from: number, end: number): number {
  let depth = 0;
  for (let i = from; i < end; i++) {
    const skip = skipNonCode(code, i);
    if (skip > i) i = skip - 1;
    else if ("([{".includes(code[i] as string)) depth++;
    else if (")]}".includes(code[i] as string)) depth--;
    else if (code[i] === "," && depth === 0) return i;
  }
  return end;
}

function skipSpace(code: string, i: number): number {
  for (;;) {
    while (/\s/.test(code[i] ?? "")) i++;
    const skip = code[i] === "/" ? skipNonCode(code, i) : i;
    if (skip === i) return i;
    i = skip;
  }
}

/** The arguments of the call whose `(` is at `open`: the offset each one starts at. */
export function callArguments(code: string, open: number): number[] {
  const close = matchClose(code, open, "(", ")");
  const out: number[] = [];
  for (let i = open + 1; close > 0 && i < close; i = expressionEnd(code, i, close) + 1) {
    i = skipSpace(code, i);
    if (i < close) out.push(i);
  }
  return out;
}

function stringValue(inner: string): string {
  try {
    return JSON.parse(`"${inner.replace(/\\(.)|"/g, (m, c: string | undefined) => (c === "'" ? c : c === undefined ? '\\"' : m))}"`) as string;
  } catch {
    return inner;
  }
}

/** The keys written in the object literal whose `{` is at `open`, each with its offset and the offset of its value (-1 for a shorthand or a method); spreads and computed keys are left out. */
export function literalKeys(code: string, open: number): { name: string; at: number; value: number }[] {
  const close = matchClose(code, open, "{", "}");
  const out: { name: string; at: number; value: number }[] = [];
  for (let i = open + 1; close > 0 && i < close; i = expressionEnd(code, i, close) + 1) {
    i = skipSpace(code, i);
    const at = i;
    let name: string | undefined;
    if (code[i] === '"' || code[i] === "'") {
      const end = skipNonCode(code, i);
      name = stringValue(code.slice(i + 1, end - 1));
      i = end;
    } else {
      name = /^[\w$]+/.exec(code.slice(i, close))?.[0];
      i += name?.length ?? 0;
    }
    i = skipSpace(code, i);
    if (name !== undefined) out.push({ name, at, value: code[i] === ":" ? skipSpace(code, i + 1) : -1 });
  }
  return out;
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
  /** Tags the module names without a define() lint can follow: customElements.define("tag", ...) and the keys of an HTMLElementTagNameMap interface. */
  tags: string[];
  /** The literal names of the events the module creates with `new Event("name", { bubbles: true })` or `new CustomEvent(...)`, which can reach any element around the one that dispatches them. */
  dispatched: string[];
}

const IDENT = String.raw`[A-Za-z_$][\w$]*`;
const IMPORT = new RegExp(String.raw`\bimport\s+(?:type\s+)?((?:${IDENT}\s*,?\s*)?(?:\{[^}]*\}|\*\s*as\s+${IDENT})?)\s*from\s*(["'])([^"'\n]+)\2`, "g");
const REEXPORT = new RegExp(String.raw`\bexport\s+(?:type\s+)?(\*(?:\s*as\s+(${IDENT}))?|\{[^}]*\})\s*from\s*(["'])([^"'\n]+)\3`, "g");
const EXPORT_LIST = /\bexport\s+(?:type\s+)?\{([^}]*)\}(?!\s*from\b)/g;
const EXPORT_CLASS = new RegExp(String.raw`\bexport\s+(default\s+)?(?:abstract\s+)?class\b(?:\s+(?!extends\b)(${IDENT}))?`, "g");
const EXPORT_DEFAULT = new RegExp(String.raw`\bexport\s+default\s+(?!class\b|abstract\b|function\b|async\b)(${IDENT})\s*(?:;|$)`, "gm");
const CE_DEFINE = /\bcustomElements\s*\.\s*define\(\s*(["'])([a-z][a-z0-9._]*-[a-z0-9._-]*)\1/g;
const TAG_MAP = /\binterface\s+HTMLElementTagNameMap\s*(?:extends\s[^{]*)?\{/g;
const TAG_KEY = /(["'])([a-z][a-z0-9._]*-[a-z0-9._-]*)\1\s*\??\s*:/g;
const NEW_EVENT = /\bnew\s+(?:Custom)?Event\s*(?:<[^>]*>)?\s*\(\s*(["'])([^"'\n]+)\1\s*,\s*\{/g;
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
  const facts: ModuleFacts = { imports: [], reexports: [], exports: new Map(), classes: [], defines: [], tags: [], dispatched: [] };
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
  if (code.includes("customElements")) for (const m of code.matchAll(CE_DEFINE)) if (inCode(m.index)) facts.tags.push(m[2] as string);
  if (code.includes("HTMLElementTagNameMap")) {
    for (const m of code.matchAll(TAG_MAP)) {
      const open = m.index + m[0].length - 1;
      const close = inCode(m.index) ? matchClose(code, open, "{", "}") : -1;
      if (close > 0) for (const k of code.slice(open, close).matchAll(TAG_KEY)) facts.tags.push(k[2] as string);
    }
  }
  if (code.includes("bubbles")) {
    for (const m of code.matchAll(NEW_EVENT)) {
      const open = m.index + m[0].length - 1;
      const close = inCode(m.index) ? matchClose(code, open, "{", "}") : -1;
      if (close > 0 && bubblesAtTop(code.slice(open, close + 1))) facts.dispatched.push(m[2] as string);
    }
  }
  return facts;
}

/** Whether the object literal `obj` (braces included) has `bubbles: true` as one of its own entries. */
function bubblesAtTop(obj: string): boolean {
  for (const m of obj.matchAll(/\bbubbles\s*:\s*true\b/g)) {
    let depth = 0;
    for (const c of obj.slice(0, m.index)) depth += "{[(".includes(c) ? 1 : ")]}".includes(c) ? -1 : 0;
    if (depth === 1) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// The component index: templates, component classes, define() calls and tags, resolved through imports
// ---------------------------------------------------------------------------

/** Where the index reads source files from. */
export interface Sources {
  text(file: string): string | null;
  facts?(file: string): ModuleFacts | undefined;
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** How many values of one kind a file keeps: one for its content on disk and one for an editor's unsaved buffer of it. */
const KEPT = 2;
const same = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Values computed from the content of a file, such as its module facts, kept between the runs of a host: a few per file and kind, each with the content it was computed from, and used only while that content is still the file's.
 * A run that builds an index sees every file whose values a later run can use; when the next run starts, the values of the files that no run has seen since the last such run are dropped.
 */
export class Memo {
  readonly #files = new Map<string, Map<string, { from: readonly unknown[]; value: unknown }[]>>();
  #seen = new Set<string>();
  #indexed = false;
  /** The value of `kind` for `file`, when it was computed from `from`. */
  get(file: string, kind: string, from: readonly unknown[]): unknown {
    return this.#files.get(file)?.get(kind)?.find((kept) => same(kept.from, from))?.value;
  }
  set<T>(file: string, kind: string, from: readonly unknown[], value: T): T {
    let kinds = this.#files.get(file);
    if (!kinds) this.#files.set(file, (kinds = new Map()));
    kinds.set(kind, [{ from, value }, ...(kinds.get(kind) ?? []).filter((kept) => !same(kept.from, from))].slice(0, KEPT));
    return value;
  }
  /** A new run starts. */
  run(): void {
    if (!this.#indexed) return;
    for (const file of this.#files.keys()) if (!this.#seen.has(file)) this.#files.delete(file);
    this.#seen = new Set();
    this.#indexed = false;
  }
  /** The run reads `file`, or knows it as a template of its index. */
  see(file: string): void {
    this.#seen.add(file);
  }
  /** The run builds an index. */
  indexed(): void {
    this.#indexed = true;
  }
}

/**
 * The files of one run: each is read from disk the first time the run asks for it, so every computation in the run sees the same content.
 * Nothing but `memo` outlives the run: a host that runs again (the Vite and oxlint plugins, ts-dom gen --watch) starts each run with a new Workspace on the same memo.
 */
export class Workspace implements Sources {
  readonly memo: Memo;
  readonly #files = new Map<string, string | null>();
  readonly #entries = new Map<string, { name: string; folder: boolean }[]>();
  readonly #listings = new Map<(dir: string, ws: Workspace) => string[], Map<string, string[]>>();
  readonly #indexes = new Map<string, ComponentIndex>();
  #base: Workspace | undefined;

  constructor(memo = new Memo(), base?: Workspace) {
    this.memo = memo;
    this.#base = base;
    if (!base) memo.run();
  }

  text(file: string): string | null {
    if (!this.#files.has(file)) {
      const text = this.#base ? this.#base.text(file) : readText(file);
      if (text !== null) this.memo.see(file);
      this.#files.set(file, text);
    }
    return this.#files.get(file) ?? null;
  }
  facts(file: string): ModuleFacts | undefined {
    const text = this.text(file);
    if (text === null) return undefined;
    return (this.memo.get(file, "facts", [text]) as ModuleFacts | undefined) ?? this.memo.set(file, "facts", [text], moduleFacts(text));
  }
  /** This run with `file` read as `text` (an editor's unsaved buffer): itself when the run reads that already, otherwise a workspace that shares the run's listings and other files and leaves the run as it was. */
  overlay(file: string, text: string): Workspace {
    if (this.text(file) === text) return this;
    const view = new Workspace(this.memo, this);
    view.#files.set(file, text);
    this.memo.see(file);
    return view;
  }
  /** The entries of the folder `dir`, read once in the run; a symbolic link to a folder is a folder. */
  entries(dir: string): { name: string; folder: boolean }[] {
    if (this.#base) return this.#base.entries(dir);
    let found = this.#entries.get(dir);
    if (!found) this.#entries.set(dir, (found = readEntries(dir)));
    return found;
  }
  /** The files `find` lists under `dir`, listed once in the run. */
  list(dir: string, find: (dir: string, ws: Workspace) => string[]): string[] {
    if (this.#base) return this.#base.list(dir, find);
    let lists = this.#listings.get(find);
    if (!lists) this.#listings.set(find, (lists = new Map()));
    let files = lists.get(dir);
    if (!files) lists.set(dir, (files = find(dir, this)));
    return files;
  }
  /** The index of the TypeScript files under `dirs`. */
  index(dirs: readonly string[]): ComponentIndex {
    const key = dirs.map((d) => resolve(d)).join("\0");
    let index = this.#indexes.get(key);
    if (!index) {
      this.#indexes.set(key, (index = componentIndex(dirs.flatMap((d) => this.list(d, listTs)), this)));
      for (const file of [...index.byTemplate.keys(), ...index.importers.keys()]) this.memo.see(file);
      this.memo.indexed();
    }
    return index;
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
    const c = d.class && byFile.get(d.class.file)?.find((r) => r.name === d.class?.name);
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
