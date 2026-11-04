import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { CodegenError, formatDiagnostics, generateAll, generateFile, isFullPage, isSelected, listHtml } from "./codegen.ts";
import { checkA11y } from "./a11y.ts";

export interface TsDomPluginOptions {
  /** Directories to scan for .html files and generate .html.ts into. Default: ["src"] */
  dirs?: string[];
  /** Module name the generated files import the runtime from. Default: "@nativele/ts-dom" */
  runtime?: string;
  /** How text nodes keep their whitespace: "preserve" (default) or "collapse" (see `GenerateOptions`). */
  whitespace?: "preserve" | "collapse";
  /** Glob patterns (relative to each directory) of the templates to generate. Default: all. */
  include?: string[];
  /** Glob patterns (relative to each directory) of templates to leave out. */
  exclude?: string[];
  /** Show ARIA / accessibility warnings in the terminal during builds. true enables every check; an object can list rule ids to ignore. Default: off. */
  a11y?: boolean | { ignore?: string[] };
}

/**
 * Optional Vite plugin: generates `.html.ts` when the build starts and regenerates it while the dev server runs.
 * ts-dom does not depend on it: `ts-dom gen` (or `--watch`) together with tsc is enough.
 */
export function tsDom(opts: TsDomPluginOptions = {}) {
  const generate = { runtime: opts.runtime, whitespace: opts.whitespace, include: opts.include, exclude: opts.exclude };
  const dirs = opts.dirs ?? ["src"];
  const a11y = opts.a11y === true ? {} : opts.a11y || null;

  const warnA11y = (warn: (m: string) => void) => {
    if (!a11y) return;
    for (const d of dirs) {
      if (!existsSync(d)) continue;
      for (const f of listHtml(d)) {
        if (!isSelected(d, f, generate)) continue;
        for (const diag of checkA11y(readFileSync(f, "utf8"), a11y.ignore)) warn(formatDiagnostics(f, [diag]));
      }
    }
  };

  let logger: { error(m: string): void; warn(m: string): void } | undefined;
  const dirOf = (file: string) => dirs.find((d) => file.startsWith(resolve(d) + sep));
  const inDirs = (file: string) => dirOf(file) !== undefined;
  const regenerate = (file: string): boolean => {
    if (!file.endsWith(".html") || file.includes("node_modules") || !existsSync(file)) return false;
    const html = readFileSync(file, "utf8");
    const dir = dirOf(file);
    if (isFullPage(html) || !dir || !isSelected(resolve(dir), file, generate)) return false;
    try {
      generateFile(file, generate, dir);
      if (a11y) for (const diag of checkA11y(html, a11y.ignore)) logger?.warn(formatDiagnostics(file, [diag]));
      return true;
    } catch (e) {
      if (e instanceof CodegenError) logger?.error(e.message);
      else throw e;
      return false;
    }
  };

  return {
    name: "ts-dom",
    enforce: "pre" as const,
    buildStart(this: { error(m: string): never; warn(m: string): void }) {
      try {
        for (const d of dirs) if (existsSync(d)) generateAll(d, generate);
      } catch (e) {
        if (e instanceof CodegenError) this.error(e.message);
        throw e;
      }
      warnA11y((m) => this.warn(m));
    },
    configureServer(server: {
      watcher: { add(p: string | string[]): void; on(ev: string, fn: (f: string) => void): void };
      config: { logger: { error(m: string): void; warn(m: string): void } };
    }) {
      logger = server.config.logger;
      server.watcher.add(dirs);
      server.watcher.on("add", (file) => regenerate(resolve(file)));
    },
    // A template is not a page, so Vite's own reload for a changed .html is ignored by the browser. Regenerate it and, when a page of this server loaded it, make Vite forget the old generated module and reload once; the generated module's own change is dropped, or the page would reload a second time.
    handleHotUpdate(ctx: { file: string; server: { moduleGraph: { getModulesByFile(f: string): Set<unknown> | undefined; invalidateModule(m: unknown): void }; ws: { send(payload: { type: "full-reload" }): void } } }) {
      const file = resolve(ctx.file);
      if (file.endsWith(".html.ts") && existsSync(file.slice(0, -3)) && inDirs(file)) return [];
      if (!file.endsWith(".html") || !regenerate(file)) return;
      const loaded = ctx.server.moduleGraph.getModulesByFile(`${file}.ts`);
      if (!loaded?.size) return [];
      for (const m of loaded) ctx.server.moduleGraph.invalidateModule(m);
      ctx.server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}

