import { describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// The oxlint that Vite+ ships: the same engine the oxlint command line and the editor extension run.
const oxlintPkg = createRequire(createRequire(import.meta.url).resolve("vite-plus/package.json")).resolve("oxlint/package.json");
const oxlint = join(dirname(oxlintPkg), (JSON.parse(readFileSync(oxlintPkg, "utf8")) as { bin: { oxlint: string } }).bin.oxlint);
const plugin = join(process.cwd(), "src/lib/oxlint-plugin.ts");
// Vite+ sets VP_VERSION for the processes it runs, and oxlint then reports to Vite+ instead of printing; run it as a project would.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "VP_VERSION"));
const code = `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./panel.html.js";\nexport class Panel extends Component(tpl) {}\ndefine("x-panel", Panel);\n`;

function project(rules: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "nativele-oxlint-"));
  writeFileSync(join(dir, "panel.html"), `<button type="button" data-on-click="save">Save</button>\n<p data-ref="note"></p>\n`);
  writeFileSync(join(dir, "panel.ts"), code);
  writeFileSync(join(dir, ".oxlintrc.json"), JSON.stringify({ jsPlugins: [{ name: "ts-dom", specifier: plugin }], rules }));
  return dir;
}

const run = (dir: string, ...args: string[]) => {
  try {
    return execFileSync(process.execPath, [oxlint, "--format=json", ...args, ...(args.some((a) => a.endsWith(".ts")) ? [] : ["panel.ts"])], { cwd: dir, encoding: "utf8", env });
  } catch (e) {
    return (e as { stdout: string }).stdout;
  }
};

describe("the lint plugin in oxlint", () => {
  it("one rule per rule id, each with its own severity, reported on the template's import line", () => {
    // JSON, because oxlint picks its text format from the environment (GitHub annotations in GitHub Actions).
    const out = JSON.parse(run(project({ "ts-dom/missing-handler": "error", "ts-dom/unused-ref": "warn" }))) as { diagnostics: { code: string; severity: string; message: string }[] };
    const found = out.diagnostics.map((d) => [d.code, d.severity, d.message.slice(0, d.message.indexOf("]") + 1)]).sort();
    expect(found).toEqual([
      ["ts-dom(missing-handler)", "error", "./panel.html.js:1:1 [missing-handler]"],
      ["ts-dom(unused-ref)", "warning", "./panel.html.js:2:1 [unused-ref]"],
    ]);
  }, 30_000);

  it("checks a child tag against the definition in the linted file's package when another package defines the same tag", () => {
    const dir = mkdtempSync(join(tmpdir(), "nativele-oxlint-"));
    const row = (emits: string) => `import { Component, define, event } from "@nativele/ts-dom";\nimport tpl from "./row.html.js";\nexport class Row extends Component(tpl, { emits: { ${emits} } }) {}\ndefine("x-row", Row);\n`;
    const files: Record<string, string> = {
      "package.json": "{}",
      ".oxlintrc.json": JSON.stringify({ jsPlugins: [{ name: "ts-dom", specifier: plugin }], rules: { "ts-dom/unknown-event": "warn" } }),
      "app/row.html": "<li></li>\n",
      "app/row.ts": row(`"row-toggle": event(), "row-remove": event()`),
      "app/board.html": `<x-row data-on-row-remove="removeRow" data-on-row-open="openRow"></x-row>\n`,
      "app/board.ts": `import { Component } from "@nativele/ts-dom";\nimport tpl from "./board.html.js";\nexport class Board extends Component(tpl) {\n  removeRow(): void {}\n  openRow(): void {}\n}\n`,
      "example/package.json": "{}",
      "example/row.html": "<li></li>\n",
      "example/row.ts": row(`"row-toggle": event()`),
    };
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    const out = JSON.parse(run(dir, "app/board.ts")) as { diagnostics: { message: string }[] };
    expect(out.diagnostics.map((d) => /does not emit "([^"]+)"/.exec(d.message)?.[1])).toEqual(["row-open"]);
  }, 30_000);

  it("click-semantics checks a child component against its template and leaves other custom elements alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "nativele-oxlint-"));
    const child = (cls: string, tag: string) => `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./${tag}.html.js";\nexport class ${cls} extends Component(tpl) {}\ndefine("${tag}", ${cls});\n`;
    const files: Record<string, string> = {
      ".oxlintrc.json": JSON.stringify({ jsPlugins: [{ name: "ts-dom", specifier: plugin }], rules: { "ts-dom/click-semantics": "warn", "ts-dom/data-flow": "warn" } }),
      "x-action.ts": child("Action", "x-action"),
      "x-action.html": `<button type="button">{{ label }}</button>\n`,
      "x-card.ts": child("Card", "x-card"),
      "x-card.html": `<div><span>{{ title }}</span></div>\n`,
      "page.html": `<div data-on-click="go">x</div>\n<wa-button data-on-click="go">Save</wa-button>\n<x-action data-on-click="go"></x-action>\n<x-card data-on-click="go"></x-card>\n<x-card role="button" tabindex="0" data-on-click="go"></x-card>\n`,
      "page.ts": `import { Component } from "@nativele/ts-dom";\nimport tpl from "./page.html.js";\nexport class Page extends Component(tpl) {\n  go(): void {}\n}\n`,
    };
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    const out = JSON.parse(run(dir, "page.ts")) as { diagnostics: { message: string }[] };
    expect(out.diagnostics.filter((d) => d.message.includes("unchecked-custom-elements"))).toEqual([]);
    expect(out.diagnostics.map((d) => d.message.slice(0, d.message.indexOf(",")))).toEqual([
      "./page.html.js:1:1 [click-semantics] data-on-click is on <div>",
      "./page.html.js:4:1 [click-semantics] data-on-click is on <x-card>",
    ]);
    expect(out.diagnostics[1]?.message).toContain("its template (x-card.html) has no operable element");
  }, 30_000);

  it("has no rule unchecked-custom-elements, which only ts-dom lint and ts-dom check report once per run", async () => {
    const { default: plugin } = await import("../src/lib/oxlint-plugin.ts");
    expect("unchecked-custom-elements" in plugin.rules).toBe(false);
  });

  it("--fix-suggestions adds the missing handler to the component class", () => {
    const dir = project({ "ts-dom/missing-handler": "error" });
    run(dir, "--fix-suggestions");
    expect(readFileSync(join(dir, "panel.ts"), "utf8")).toContain("export class Panel extends Component(tpl) {\n  save(_e: Event): void {}\n}");
  }, 30_000);

  it("the language server (what the editor extension runs) offers the same quick fix", async () => {
    const dir = project({ "ts-dom/missing-handler": "error" });
    const server = spawn(process.execPath, [oxlint, "--lsp"], { cwd: dir, env });
    let buffer = Buffer.alloc(0);
    let nextId = 0;
    const replies = new Map<number, (result: unknown) => void>();
    let onDiagnostics: (d: { code: string; range: unknown }[]) => void = () => {};
    const send = (message: object) => {
      const body = JSON.stringify({ jsonrpc: "2.0", ...message });
      server.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    };
    const request = (method: string, params: unknown) => new Promise<unknown>((resolve) => {
      const id = ++nextId;
      replies.set(id, resolve);
      send({ id, method, params });
    });
    server.stdout.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const head = buffer.indexOf("\r\n\r\n");
        if (head < 0) return;
        const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, head).toString())?.[1]);
        if (buffer.length < head + 4 + length) return;
        const message = JSON.parse(buffer.subarray(head + 4, head + 4 + length).toString()) as { id?: number; method?: string; params?: { diagnostics?: [] }; result?: unknown };
        buffer = buffer.subarray(head + 4 + length);
        if (message.method === "textDocument/publishDiagnostics" && message.params?.diagnostics?.length) onDiagnostics(message.params.diagnostics);
        else if (message.id !== undefined && message.method) send({ id: message.id, result: null });
        else if (message.id !== undefined) replies.get(message.id)?.(message.result);
      }
    });
    try {
      const uri = `file://${dir}/panel.ts`;
      await request("initialize", { processId: process.pid, rootUri: `file://${dir}`, capabilities: { textDocument: { codeAction: { codeActionLiteralSupport: { codeActionKind: { valueSet: ["quickfix"] } } } } }, workspaceFolders: [{ uri: `file://${dir}`, name: "t" }] });
      const diagnostics = new Promise<{ code: string; range: unknown }[]>((resolve) => (onDiagnostics = resolve));
      send({ method: "initialized", params: {} });
      send({ method: "textDocument/didOpen", params: { textDocument: { uri, languageId: "typescript", version: 1, text: code } } });
      const [missing] = (await diagnostics).filter((d) => String(d.code).includes("missing-handler"));
      expect(missing).toBeDefined();
      const actions = (await request("textDocument/codeAction", { textDocument: { uri }, range: missing?.range, context: { diagnostics: [missing] } })) as { title: string; edit?: { changes?: Record<string, { newText: string }[]> } }[];
      const fix = actions.find((a) => a.title === "Add a method save() to the component class");
      expect(fix?.edit?.changes?.[uri]?.[0]?.newText).toBe("\n  save(_e: Event): void {}\n");
    } finally {
      server.kill();
    }
  }, 30_000);
});
