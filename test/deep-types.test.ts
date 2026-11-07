import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const REPO = process.cwd();

interface Child {
  tag: string;
  file: string;
  event: string;
}

/** A component with a prop, an emitted event, a list whose items hold the first child, and each child as a ref whose event it handles. `extra` is added to the class body. */
function component(src: string, file: string, cls: string, tag: string, children: Child[], extra = ""): void {
  const write = (name: string, text: string) => {
    mkdirSync(dirname(join(src, name)), { recursive: true });
    writeFileSync(join(src, name), text);
  };
  const item = children[0] ? `<${children[0].tag} data-ref="itemChild"></${children[0].tag}>` : "";
  write(
    `${file}.html`,
    `<div>\n  <p>{{ label }}</p>\n  <ul><template data-each="items"><li data-ref="row">${item}</li></template></ul>\n${children.map((c, i) => `  <${c.tag} data-ref="k${i}" label="x" data-on-${c.event}="onK${i}"></${c.tag}>\n`).join("")}</div>\n`,
  );
  write(
    `${file}.ts`,
    `import { Component, define, event } from "@nativele/ts-dom";\n${[...new Set(children.map((c) => c.file))]
      .filter((f) => f !== basename(file))
      .map((f) => `import "./${f}.js";\n`)
      .join("")}import tpl from "./${basename(file)}.html.js";\n\nexport class ${cls} extends Component(tpl, { props: { label: "" }, emits: { "${tag}-pick": event<{ v: string }>() } }) {\n${children
      .map((c, i) => `  onK${i}(e: CustomEvent<{ v: string }>): void {\n    this.refs.k${i}.label = e.detail.v;\n    this.emit("${tag}-pick", { v: e.detail.v });\n  }\n`)
      .join("")}${extra}}\ndefine("${tag}", ${cls});\n`,
  );
}

const child = (tag: string, file: string): Child => ({ tag, file, event: `${tag}-pick` });

describe("component types do not depend on the depth or shape of the component tree", () => {
  it("type checks a chain of 100, a tree view, two components that hold each other and a wide tree, with the checks still in force", () => {
    const dir = mkdtempSync(join(tmpdir(), "ts-dom-deep-"));
    try {
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", lib: ["ES2022", "DOM", "DOM.Iterable"], strict: true, noUncheckedIndexedAccess: true, allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, types: [], paths: { "@nativele/ts-dom": [join(REPO, "src/lib/index.ts")] } },
          include: ["src"],
        }),
      );
      const src = join(dir, "src");
      const n = 100;
      for (let i = 0; i < n; i++) {
        component(src, `chain/c${i}`, `C${i}`, `x-c${i}`, i + 1 < n ? [child(`x-c${i + 1}`, `c${i + 1}`)] : []);
      }
      component(
        src,
        "tree",
        "TreeNode",
        "x-tree",
        [child("x-tree", "tree")],
        `  wrong(): void {\n    const same: TreeNode = this.refs.k0;\n    void same;\n    // @ts-expect-error a prop of its own tag keeps its type\n    this.refs.k0.label = 1;\n    this.lists.items.replace([{ id: 1 }], (r) => r.id, (_r, { refs }) => void (refs.itemChild satisfies TreeNode));\n  }\n`,
      );
      component(src, "mutual/a", "MutualA", "x-mutual-a", [child("x-mutual-b", "b")], `  wrong(): void {\n    // @ts-expect-error a child that holds this tag back keeps its props\n    this.refs.k0.label = 1;\n  }\n`);
      component(src, "mutual/b", "MutualB", "x-mutual-b", [child("x-mutual-a", "a")]);
      const wide = Array.from({ length: 50 }, (_, i) => i);
      for (const i of wide) {
        for (let j = 0; j < 10; j++) component(src, `wide/g${i}-${j}`, `G${i}x${j}`, `x-g${i}-${j}`, []);
        component(
          src,
          `wide/k${i}`,
          `K${i}`,
          `x-k${i}`,
          Array.from({ length: 10 }, (_, j) => child(`x-g${i}-${j}`, `g${i}-${j}`)),
        );
      }
      component(
        src,
        "wide/root",
        "WideRoot",
        "x-wide-root",
        wide.map((i) => child(`x-k${i}`, `k${i}`)),
      );
      // Handlers whose parameter does not accept the child's event are still reported at define(), at either end of the chain and in the tree view.
      writeFileSync(
        join(src, "wrong.ts"),
        `import { Component, define } from "@nativele/ts-dom";\nimport first from "./chain/c0.html.js";\nimport last from "./chain/c98.html.js";\nimport tree from "./tree.html.js";\n\nclass First extends Component(first) {\n  onK0(_e: CustomEvent<{ v: number }>): void {}\n}\n// @ts-expect-error wrongHandlerParameters: x-c1 emits a string\ndefine("x-first", First);\nclass Last extends Component(last) {\n  onK0(_e: KeyboardEvent): void {}\n}\n// @ts-expect-error wrongHandlerParameters: x-c99 emits a CustomEvent\ndefine("x-last", Last);\nclass Tree extends Component(tree) {\n  onK0(_e: MouseEvent): void {}\n}\n// @ts-expect-error wrongHandlerParameters: x-tree emits a CustomEvent\ndefine("x-wrong-tree", Tree);\n`,
      );
      execFileSync(process.execPath, [join(REPO, "src/cli.ts"), "gen", "src"], { cwd: dir, stdio: "ignore" });
      let out = "";
      try {
        execFileSync(process.execPath, [join(REPO, "node_modules/typescript/bin/tsc"), "-p", "."], { cwd: dir, encoding: "utf8" });
      } catch (e) {
        out = (e as { stdout: string }).stdout;
      }
      expect(out).toBe("");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
