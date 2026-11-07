// Synthetic projects for the budget check (npm run bench:check). Run by hand to get one to profile: node scripts/bench/project.ts <dir> [components] [--monorepo]
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = fileURLToPath(new URL("../../src/lib/index.ts", import.meta.url));

const write = (file: string, text: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

const tsconfig = (dir: string) =>
  JSON.stringify({
    compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", lib: ["ES2022", "DOM", "DOM.Iterable"], strict: true, noUncheckedIndexedAccess: true, allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, types: [], paths: { "@nativele/ts-dom": [relative(dir, LIB)] } },
    include: ["src"],
  });

/** Where component `i` of a chain lives, relative to the chain's src folder: 50 components per folder. */
export const componentPath = (i: number) => `f${Math.floor(i / 50)}/c${i}`;

/**
 * A chain of `n` components under `src`, each with a template that has holes, a data-if, a list, events, and the next component as a child (which it imports), tags `<prefix>-c<i>`.
 * `shared`, when given, is a tag every chain defines once, in its last component, so a monorepo has the same tag in each package.
 */
function chain(src: string, n: number, prefix: string, shared?: string): void {
  const tag = (i: number) => (shared && i === n - 1 ? shared : `${prefix}-c${i}`);
  for (let i = 0; i < n; i++) {
    const child = i + 1 < n ? tag(i + 1) : null;
    const childImport = child ? `${relative(dirname(join(src, componentPath(i))), join(src, componentPath(i + 1)))}.js` : null;
    write(
      join(src, `${componentPath(i)}.html`),
      `<section class="card">
  <h2>{{ title }}</h2>
  <p data-if="open">{{ body }}</p>
  <button type="button" data-ref="toggle" data-on-click="onToggle">Toggle</button>
  <input aria-label="Name" data-ref="name" data-on-input="onName" />
  <ul>
    <template data-each="rows"><li data-ref="row">{{ label }}</li></template>
  </ul>
${child ? `  <${child} data-ref="child" heading="x" data-on-c${i + 1}-changed="onChild"></${child}>\n` : ""}  <slot></slot>
</section>
`,
    );
    write(
      join(src, `${componentPath(i)}.ts`),
      `import { Component, define, event } from "@nativele/ts-dom";
${childImport ? `import "${childImport.startsWith(".") ? childImport : `./${childImport}`}";\n` : ""}import tpl from "./c${i}.html.js";

export class C${i} extends Component(tpl, {
  props: { heading: "" },
  state: { title: "C${i}", open: false, body: "" },
  emits: { "c${i}-changed": event<{ value: string }>() },
}) {
  onToggle(): void {
    this.set({ open: !this.state.open });
  }
  onName(): void {
    this.emit("c${i}-changed", { value: this.refs.name.value });
  }
  onChild(_e: Event): void {}
  override render(): void {
    this.lists.rows.replace([{ id: 1, label: "a" }], (r) => r.id, (r, { text, refs }) => {
      text.label = r.label;
      void refs.row;
    });
    void this.refs.toggle;
${child ? "    void this.refs.child;\n" : ""}  }
}
define("${tag(i)}", C${i});
`,
    );
  }
  write(join(src, "style.css"), "section { display: block; }\n");
}

/** One package with a chain of `n` components under `<dir>/src`. */
export function singleProject(dir: string, n: number): void {
  rmSync(dir, { recursive: true, force: true });
  write(join(dir, "package.json"), `{ "name": "bench", "private": true, "type": "module" }\n`);
  write(join(dir, "tsconfig.json"), tsconfig(dir));
  chain(join(dir, "src"), n, "x");
}

export const PACKAGES = ["ui", "app", "admin"];

/** A workspace root with one package per name in PACKAGES under `<dir>/packages`, each with a chain of `n` components, and a tag every package defines. */
export function monorepo(dir: string, n: number): void {
  rmSync(dir, { recursive: true, force: true });
  write(join(dir, "package.json"), `{ "name": "bench-root", "private": true, "workspaces": ["packages/*"] }\n`);
  for (const name of PACKAGES) {
    const pkg = join(dir, "packages", name);
    write(join(pkg, "package.json"), `{ "name": "@bench/${name}", "private": true, "type": "module" }\n`);
    write(join(pkg, "tsconfig.json"), tsconfig(pkg));
    chain(join(pkg, "src"), n, name, "x-shared");
  }
}

const VENDOR_TAGS = 40;

/**
 * Small projects whose type check cost tsc reports, one folder each: the library alone, a chain of 100 components (each template holds the next component's tag),
 * components whose state and props hold DOM objects, and a template with many custom elements of another library declared in HTMLElementTagNameMap.
 */
export function typeProjects(dir: string): string[] {
  rmSync(dir, { recursive: true, force: true });
  const sets: Record<string, (src: string) => void> = {
    library: (src) => write(join(src, "index.ts"), `import { Component } from "@nativele/ts-dom";\nexport const c = Component;\n`),
    chain: (src) => chain(src, 100, "x"),
    "dom-state": (src) => {
      write(join(src, "form.html"), `<form data-ref="form"><label>Name <input data-ref="name" data-on-input="onName" /></label><p data-if="dirty">{{ label }}</p></form>\n`);
      const fields = [
        "host: null as HTMLElement | null",
        "input: null as HTMLInputElement | null",
        "form: null as HTMLFormElement | null",
        "win: null as Window | null",
        "key: null as KeyboardEvent | null",
        "store: null as Storage | null",
        "when: new Date()",
        "pending: null as Promise<string> | null",
        "nodes: [] as HTMLElement[]",
        "byId: new Map<string, HTMLElement>()",
      ];
      write(
        join(src, "form.ts"),
        `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./form.html.js";\n\n${fields
          .map(
            (f, i) =>
              `export class F${i} extends Component(tpl, { props: { label: "", ${f} }, state: { dirty: false, s${i}: { ${f.replace(/^\w+/, "inner")} } } }) {\n  onName(): void {\n    this.set({ dirty: this.refs.name.value !== "" });\n  }\n}\ndefine("x-f${i}", F${i});\n`,
          )
          .join("\n")}`,
      );
    },
    "third-party": (src) => {
      const tags = Array.from({ length: VENDOR_TAGS }, (_, i) => i);
      write(join(src, "vendor.d.ts"), `${tags.map((i) => `interface Vendor${i} extends HTMLElement {\n  value: string;\n  open(): void;\n}\n`).join("")}declare global {\n  interface HTMLElementTagNameMap {\n${tags.map((i) => `    "vendor-w${i}": Vendor${i};\n`).join("")}  }\n  interface GlobalEventHandlersEventMap {\n${tags.map((i) => `    "vendor-change${i}": CustomEvent<{ value: string }>;\n`).join("")}  }\n}\nexport {};\n`);
      write(join(src, "page.html"), `<div>\n${tags.map((i) => `  <vendor-w${i} data-ref="w${i}" data-on-vendor-change${i}="onChange${i}"></vendor-w${i}>\n`).join("")}</div>\n`);
      write(
        join(src, "page.ts"),
        `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./page.html.js";\n\nexport class Page extends Component(tpl) {\n${tags.map((i) => `  onChange${i}(e: CustomEvent<{ value: string }>): void {\n    this.refs.w${i}.value = e.detail.value;\n    this.refs.w${i}.open();\n  }\n`).join("")}}\ndefine("x-page", Page);\n`,
      );
    },
  };
  for (const [name, make] of Object.entries(sets)) {
    write(join(dir, name, "tsconfig.json"), tsconfig(join(dir, name)));
    make(join(dir, name, "src"));
  }
  return Object.keys(sets);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [out, count = "1000"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!out) throw new Error("usage: node scripts/bench/project.ts <dir> [components] [--monorepo]");
  (process.argv.includes("--monorepo") ? monorepo : singleProject)(resolve(out), Number(count));
  console.log(`generated ${count} components${process.argv.includes("--monorepo") ? " per package" : ""} in ${out}`);
}
