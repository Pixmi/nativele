import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Workspace } from "./components.ts";

/** How lint checks the value of one attribute a custom elements manifest declares. `values` are the string literals its type allows (all of them for kind string, extra ones beside numbers for kind number). */
export interface ManifestAttr {
  name: string;
  kind: "string" | "number" | "boolean" | "any";
  values?: readonly string[];
}

export interface ManifestElement {
  /** By attribute name, lowercased as the HTML parser reads it. */
  attrs: Map<string, ManifestAttr>;
  /** The manifest may leave attributes out (a class above it that the manifest leaves out, an attribute it could not read): only the values of those listed are checked. */
  openAttrs: boolean;
  /** Event names, or null when the manifest does not say or may leave some out. */
  events: readonly string[] | null;
  /** The event names the manifest lists for the element and the classes above it in the manifest, also when `events` is null. */
  listedEvents: readonly string[];
  /** Slot names ("" is the default slot), or null when the manifest does not say or may leave some out. */
  slots: readonly string[] | null;
}

/** A manifest a package declares: the elements it defines by tag, or why it cannot be read. */
export type Manifest = { pkg: string; file: string; elements: ReadonlyMap<string, ManifestElement> } | { pkg: string; file: string; error: string };

const RUNTIME = "@nativele/ts-dom";
const SUPPORTED_MAJORS = new Set([1, 2]);
const BASE_CLASSES = new Set(["HTMLElement", "LitElement", "ReactiveElement"]);
const LITERAL = /^(['"])(.*)\1$/s;

/** How the attribute's `type.text` is checked: string, number and boolean, string literals, literals beside string or number, and anything else (a type name, an element, a function) as any. */
export function attrType(text: unknown): Pick<ManifestAttr, "kind" | "values"> {
  if (typeof text !== "string") return { kind: "any" };
  const parts = text.split("|").map((p) => p.trim()).filter((p) => p && p !== "null" && p !== "undefined");
  if (!parts.length) return { kind: "any" };
  const values = parts.flatMap((p) => (LITERAL.test(p) ? [(LITERAL.exec(p) as RegExpExecArray)[2] as string] : []));
  const named = new Set(parts.filter((p) => !LITERAL.test(p)));
  if ([...named].some((p) => p !== "string" && p !== "number" && p !== "boolean")) return { kind: "any" };
  if (named.has("boolean")) return named.size === 1 && !values.length ? { kind: "boolean" } : { kind: "any" };
  if (named.has("string")) return { kind: "string" };
  if (named.has("number")) return values.length ? { kind: "number", values } : { kind: "number" };
  return { kind: "string", values };
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObject) : []);
const names = (v: unknown): string[] => list(v).flatMap((e) => (typeof e.name === "string" ? [e.name] : []));

/** Read the custom elements of a manifest (schema 1.x or 2.x); `pkg` names the package in messages. */
export function parseManifest(text: string, pkg: string, file: string): Manifest {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { pkg, file, error: `is not valid JSON (${(e as Error).message})` };
  }
  if (!isObject(json)) return { pkg, file, error: "is not a JSON object" };
  const version = json.schemaVersion;
  const major = typeof version === "string" ? Number.parseInt(version, 10) : Number.NaN;
  if (!SUPPORTED_MAJORS.has(major)) return { pkg, file, error: `has schemaVersion ${JSON.stringify(version ?? null)}, which lint does not read (it reads 1.x and 2.x)` };
  const decls = new Map<string, Json>();
  const byName = new Map<string, Json[]>();
  const tags = new Map<Json, string>();
  const modules = list(json.modules);
  for (const m of modules) {
    const path = typeof m.path === "string" ? m.path : "";
    for (const d of list(m.declarations)) {
      if (typeof d.name !== "string") continue;
      decls.set(`${path}\0${d.name}`, d);
      byName.set(d.name, [...(byName.get(d.name) ?? []), d]);
      if (d.customElement === true && typeof d.tagName === "string") tags.set(d, d.tagName);
    }
  }
  for (const m of modules) {
    for (const e of list(m.exports)) {
      const target = isObject(e.declaration) ? e.declaration : undefined;
      if (e.kind !== "custom-element-definition" || typeof e.name !== "string" || typeof target?.name !== "string") continue;
      const d = decls.get(`${typeof target.module === "string" ? target.module : m.path}\0${target.name}`);
      if (d && !tags.has(d)) tags.set(d, e.name);
    }
  }
  const elements = [...tags.keys()];
  const hasEvents = elements.some((d) => Array.isArray(d.events));
  const hasSlots = elements.some((d) => Array.isArray(d.slots));
  const superOf = (d: Json): Json | "base" | undefined => {
    const s = isObject(d.superclass) ? d.superclass : undefined;
    if (typeof s?.name !== "string") return undefined;
    if (BASE_CLASSES.has(s.name)) return "base";
    const found = typeof s.module === "string" ? decls.get(`${s.module}\0${s.name}`) : undefined;
    const same = byName.get(s.name) ?? [];
    return found ?? (same.length === 1 ? same[0] : undefined);
  };
  const inherits = (d: Json, name: unknown) => ["attributes", "members", "events", "slots"].some((k) => list(d[k]).some((i) => isObject(i.inheritedFrom) && i.inheritedFrom.name === name));
  /**
   * The declaration of `d` and those of the classes it extends in the manifest, and whether nothing above them is left out: the chain ends at a known base class,
   * or at a class outside the manifest whose members the analyzer copied into the chain (their inheritedFrom names it).
   */
  const chain = (d: Json): { decls: Json[]; known: boolean } => {
    const decls: Json[] = [];
    for (let c: Json | "base" | undefined = d; c !== "base"; c = superOf(c)) {
      if (!c || decls.includes(c)) {
        const last = decls[decls.length - 1] as Json;
        const name = !c && isObject(last.superclass) ? last.superclass.name : undefined;
        return { decls, known: name !== undefined && decls.some((x) => inherits(x, name)) };
      }
      decls.push(c);
    }
    return { decls, known: true };
  };
  const out = new Map<string, ManifestElement>();
  for (const [d, tag] of tags) {
    const { decls: up, known } = chain(d);
    const merged = (key: string, any: boolean) => (!known ? null : up.some((x) => Array.isArray(x[key])) ? [...new Set(up.flatMap((x) => names(x[key])))] : any ? [] : null);
    const attrs = new Map<string, ManifestAttr>();
    let openAttrs = !known;
    for (const a of up.flatMap((x) => list(x.attributes))) {
      if (typeof a.name !== "string" || !a.name) {
        openAttrs = true;
        continue;
      }
      const name = a.name.toLowerCase();
      if (!attrs.has(name)) attrs.set(name, { name, ...attrType(isObject(a.type) ? a.type.text : undefined) });
    }
    // The browser gives every form-associated custom element the form attribute, which manifests list as a property only.
    if (up.some((x) => list(x.members).some((m) => m.name === "formAssociated" && m.static === true)) && !attrs.has("form")) attrs.set("form", { name: "form", kind: "string" });
    out.set(tag, { attrs, openAttrs, events: merged("events", hasEvents), listedEvents: [...new Set(up.flatMap((x) => names(x.events)))], slots: merged("slots", hasSlots) });
  }
  return { pkg, file, elements: out };
}

interface PackageFacts {
  name?: string;
  customElements?: string;
  dependencies: string[];
  workspaces: boolean;
  /** The JavaScript or TypeScript modules the package's `exports` name (any condition but `types`, no `*` patterns), else its `module` or `main`, relative to the package. */
  entries: string[];
}

const SCRIPT = /\.(?:m?[jt]sx?|cts|cjs)$/;

/** The files `exports` names, in its order, leaving out `types` conditions, declaration files and `*` patterns. */
function exportedFiles(value: unknown): string[] {
  if (typeof value === "string") return value.includes("*") || value.endsWith(".d.ts") || !SCRIPT.test(value) ? [] : [value];
  if (Array.isArray(value)) return value.flatMap(exportedFiles);
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([k, v]) => (k === "types" || k.includes("*") ? [] : exportedFiles(v)));
}

function packageFacts(text: string): PackageFacts {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { dependencies: [], workspaces: false, entries: [] };
  }
  if (!isObject(json)) return { dependencies: [], workspaces: false, entries: [] };
  const deps = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((k) => (isObject(json[k]) ? Object.keys(json[k]) : []));
  return {
    ...(typeof json.name === "string" ? { name: json.name } : {}),
    ...(typeof json.customElements === "string" ? { customElements: json.customElements } : {}),
    dependencies: [...new Set(deps)],
    workspaces: "workspaces" in json,
    entries: [...new Set("exports" in json ? exportedFiles(json.exports) : [json.module, json.main].flatMap(exportedFiles))],
  };
}

const factsOf = (ws: Workspace, file: string): PackageFacts | undefined => {
  const text = ws.text(file);
  if (text === null) return undefined;
  return (ws.memo.get(file, "package", [text]) as PackageFacts | undefined) ?? ws.memo.set(file, "package", [text], packageFacts(text));
};

/** `dir` and the folders above it up to the workspace root: the nearest folder with a pnpm-workspace.yaml or a package.json "workspaces" field, else the git root. Only `dir` when neither is found below the home directory or the filesystem root. */
export function upToWorkspaceRoot(ws: Workspace, dir: string): string[] {
  const start = resolve(dir);
  const home = homedir();
  const chain: string[] = [];
  for (let d = start; ; d = dirname(d)) {
    // A home directory managed as a git repository (dotfiles) is not the root of the projects inside it.
    if (d === home && d !== start) return [start];
    chain.push(d);
    if (ws.text(join(d, "pnpm-workspace.yaml")) !== null || factsOf(ws, join(d, "package.json"))?.workspaces || existsSync(join(d, ".git"))) return chain;
    if (dirname(d) === d) return [start];
  }
}

/** The nearest folder at or above `dir` that holds a package.json, or "" when there is none. */
export function packageOf(ws: Workspace, dir: string): string {
  return ws.text(join(dir, "package.json")) !== null ? dir : dirname(dir) === dir ? "" : packageOf(ws, dirname(dir));
}

const real = (file: string): string => {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
};

function manifestOf(ws: Workspace, pkgJson: string, pkg: string, field: string): Manifest {
  const file = resolve(dirname(real(pkgJson)), field);
  const text = ws.text(file);
  if (text === null) return { pkg, file, error: "does not exist" };
  return (ws.memo.get(file, "manifest", [text, pkg]) as Manifest | undefined) ?? ws.memo.set(file, "manifest", [text, pkg], parseManifest(text, pkg, file));
}

/** The installed dependencies of the package in `dir`, each found as node_modules/<name>/package.json from `dir` up to the workspace root. Only those files are read; node_modules is never listed. */
function dependenciesAt(ws: Workspace, dir: string): { name: string; file: string; facts: PackageFacts }[] {
  const own = factsOf(ws, join(dir, "package.json"));
  if (!own?.dependencies.length) return [];
  const roots = upToWorkspaceRoot(ws, dir);
  return own.dependencies.flatMap((name) => {
    for (const root of roots) {
      const file = join(root, "node_modules", name, "package.json");
      const facts = factsOf(ws, file);
      if (facts) return [{ name, file, facts }];
    }
    return [];
  });
}

/** The custom elements manifests that apply to the templates of the package in `dir`: its own (the `customElements` field of its package.json) and those of its installed dependencies. */
export function manifestsAt(ws: Workspace, dir: string): Manifest[] {
  const pkgJson = join(dir, "package.json");
  const own = factsOf(ws, pkgJson);
  if (!own) return [];
  const out: Manifest[] = own.customElements ? [manifestOf(ws, pkgJson, own.name ?? ".", own.customElements)] : [];
  for (const dep of dependenciesAt(ws, dir)) if (dep.facts.customElements) out.push(manifestOf(ws, dep.file, dep.name, dep.facts.customElements));
  return out;
}

/** The installed dependencies of the package in `dir` that are Nativele component packages (they list `@nativele/ts-dom` among their dependencies), with the modules they export, as absolute paths through symbolic links. */
export function componentPackagesAt(ws: Workspace, dir: string): { pkg: string; entries: string[] }[] {
  return dependenciesAt(ws, dir).flatMap((dep) => {
    if (!dep.facts.dependencies.includes(RUNTIME) || !dep.facts.entries.length) return [];
    const root = dirname(real(dep.file));
    return [{ pkg: dep.name, entries: dep.facts.entries.map((e) => resolve(root, e)) }];
  });
}
