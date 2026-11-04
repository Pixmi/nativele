import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { CodegenError, formatDiagnostics, generateAll, generateFile, isFullPage, isSelected, listHtml } from "./codegen.ts";
import { checkA11y } from "./a11y.ts";

export interface NativelePluginOptions {
  /** Directories to scan for .html files and generate .html.ts into. Default: ["src"] */
  dirs?: string[];
  /** Module name the generated files import the runtime from. Default: "nativele" */
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
 * nativele does not depend on it: `nativele gen` (or `--watch`) together with tsc is enough.
 */
export function nativele(opts: NativelePluginOptions = {}) {
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

  return {
    name: "nativele",
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
      const regen = (file: string) => {
        if (!file.endsWith(".html") || file.includes("node_modules") || !existsSync(file)) return;
        const html = readFileSync(file, "utf8");
        if (isFullPage(html)) return;
        const dir = dirs.find((d) => file.startsWith(resolve(d) + sep));
        if (!dir || !isSelected(resolve(dir), file, generate)) return;
        try {
          generateFile(file, generate, dir);
          if (a11y) for (const diag of checkA11y(html, a11y.ignore)) server.config.logger.warn(formatDiagnostics(file, [diag]));
        } catch (e) {
          if (e instanceof CodegenError) server.config.logger.error(e.message);
          else throw e;
        }
      };
      server.watcher.add(dirs);
      server.watcher.on("change", regen);
      server.watcher.on("add", regen);
    },
  };
}

