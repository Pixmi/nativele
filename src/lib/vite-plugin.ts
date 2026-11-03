import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { CodegenError, formatDiagnostics, generateAll, generateFile, isFullPage, listHtml } from "./codegen.ts";
import { checkA11y } from "./a11y.ts";

export interface TsDomPluginOptions {
  /** Directories to scan for .html files and generate .html.ts into. Default: ["src"] */
  dirs?: string[];
  /** Module name the generated files import the runtime from. Default: "ts-dom" */
  runtime?: string;
  /** Show ARIA / accessibility warnings in the terminal during builds. true enables every check; an object can list rule ids to ignore. Default: off. */
  a11y?: boolean | { ignore?: string[] };
}

/**
 * Optional Vite plugin: generates `.html.ts` when the build starts and regenerates it while the dev server runs.
 * ts-dom does not depend on it: `ts-dom gen` (or `--watch`) together with tsc is enough.
 */
export function tsDom(opts: TsDomPluginOptions = {}) {
  const runtime = opts.runtime;
  const dirs = opts.dirs ?? ["src"];
  const a11y = opts.a11y === true ? {} : opts.a11y || null;

  const warnA11y = (warn: (m: string) => void) => {
    if (!a11y) return;
    for (const d of dirs) {
      if (!existsSync(d)) continue;
      for (const f of listHtml(d)) {
        for (const diag of checkA11y(readFileSync(f, "utf8"), a11y.ignore)) warn(formatDiagnostics(f, [diag]));
      }
    }
  };

  return {
    name: "ts-dom",
    enforce: "pre" as const,
    buildStart(this: { error(m: string): never; warn(m: string): void }) {
      try {
        for (const d of dirs) if (existsSync(d)) generateAll(d, runtime);
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
        if (!dirs.some((d) => file.startsWith(resolve(d) + sep))) return;
        try {
          generateFile(file, runtime, dirs.find((d) => file.startsWith(resolve(d) + sep)));
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

