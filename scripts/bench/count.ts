// Counts what the library does, without changing it: templates parsed (parse5's parseFragment) and files read and folders listed. Import it before the library, or load it with node --import.
import fs from "node:fs";
import { registerHooks, syncBuiltinESMExports } from "node:module";

export const counts = { parses: 0, reads: 0, readdirs: 0 };

const parse5 = new URL("./parse5.ts", import.meta.url).href;
registerHooks({
  resolve: (specifier, context, next) => next(specifier === "parse5" && context.parentURL !== parse5 ? parse5 : specifier, context),
});

const { readFileSync, readdirSync } = fs;
fs.readFileSync = ((...args: Parameters<typeof readFileSync>) => (counts.reads++, readFileSync(...args))) as typeof readFileSync;
fs.readdirSync = ((...args: Parameters<typeof readdirSync>) => (counts.readdirs++, readdirSync(...args))) as typeof readdirSync;
syncBuiltinESMExports();

if (process.env.BENCH_COUNTS) process.on("exit", () => fs.writeFileSync(process.env.BENCH_COUNTS as string, JSON.stringify(counts)));
