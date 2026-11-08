import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const CLI = join(process.cwd(), "src/cli.ts");

export function writeFiles(dir: string, files: Record<string, string>): string {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

export const writeTree = (files: Record<string, string>, prefix = "ts-dom-"): string => writeFiles(mkdtempSync(join(tmpdir(), prefix)), files);

export function linkTypescript(dir: string): void {
  mkdirSync(join(dir, "node_modules"), { recursive: true });
  for (const name of ["typescript", "@types"]) symlinkSync(join(process.cwd(), "node_modules", name), join(dir, "node_modules", name));
}

export function runCli(args: string[], cwd?: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

type Issues = { issues: { rule: string; message: string; file: string; line: number; col: number; severity: string }[] };

/** The JSON a command prints, also when it exits with an error. */
export const cliJson = <T = Issues>(args: string[], cwd?: string): T => JSON.parse(runCli(args, cwd).stdout) as T;
