import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { A11Y_RULES, COMPOSED_RULES } from "../src/lib/a11y.ts";
import { tsDom } from "../src/lib/vite-plugin.ts";
import { lintRun } from "../src/lib/lint.ts";
import plugin from "../src/lib/oxlint-plugin.ts";
import { cliJson, writeTree } from "./helpers.ts";

// Each fixture and the rules it is reported by with every rule on. Every defect belongs to one rule, whichever rules are on.
const FIXTURES: [string, string[]][] = [
  [`<div role="button" data-on-click="go">Go</div>`, ["role-tabindex"]],
  [`<div data-on-click="go">Go</div>`, ["click-semantics"]],
  [`<div role="button" tabindex="0" data-on-click="go">Go</div>`, []],
  [`<span role="presentation" data-on-click="go">Go</span>`, ["click-semantics"]],
  [`<div role="tab">Tab</div>`, ["role-tabindex"]],
  [`<div role="button" data-ref="b" data-on-click="go">Go</div>`, []],
  [`<label data-on-click="go">Name <input></label>`, []],
  [`<label data-on-click="go">Name</label>`, ["click-semantics"]],
  [`<x-card data-on-click="go"></x-card>`, ["click-semantics"]],
  [`<x-card role="button" data-on-click="go"></x-card>`, ["role-tabindex"]],
  [`<img src="a.png">`, ["img-alt"]],
  [`<button type="button"></button>`, ["control-name"]],
  [`<input>`, ["form-label"]],
  [`<iframe src="/x"></iframe>`, ["iframe-title"]],
  [`<dialog></dialog>`, ["dialog-name"]],
  [`<h2></h2>`, ["heading-empty"]],
  [`<div role="buton">x</div>`, ["aria-role"]],
  [`<div aria-lable="x">x</div>`, ["aria-attr"]],
  [`<button type="button" tabindex="2">x</button>`, ["tabindex-positive"]],
  [`<button type="button" aria-hidden="true">x</button>`, ["hidden-focusable"]],
  [`<label for="nope">x</label>`, ["label-for"]],
  [`<ul><template data-each="rows"><li id="r">x</li></template></ul>`, ["id-in-list"]],
  [`<p id="a">x</p><p id="a">y</p>`, ["duplicate-id", "duplicate-id"]],
  [`<div aria-labelledby="nope">x</div>`, ["aria-idref"]],
  [`<h1>a</h1><h3>b</h3>`, ["heading-order"]],
  [`<table><tr><td>x</td></tr></table>`, ["table-header"]],
  [`<ul><div>x</div></ul>`, ["list-structure"]],
  [`<nav>a</nav><nav>b</nav>`, ["landmark-label", "landmark-label"]],
  [`<button type="button" role="button">x</button>`, ["redundant-role"]],
  [`<div data-on-click="go"><wa-icon></wa-icon> Open</div>`, ["unchecked-content"]],
  [`<button type="button"><slot></slot></button>`, ["unchecked-content"]],
];
const RULES = Object.keys(A11Y_RULES);
/** The rules left on to see what `rule` gives: unchecked-content names the rules it could not judge, so those stay on with it. */
const allBut = (rule: string) => RULES.filter((r) => r !== rule && !(rule === "unchecked-content" && r in COMPOSED_RULES));
const H = `import { Component, define } from "@nativele/ts-dom";\n`;

type Found = [file: string, line: number, col: number, rule: string][];
const sort = (found: Found) => found.sort((a, b) => a.join().localeCompare(b.join()));
const only = (found: Found, rule: string) => found.filter((f) => f[3] === rule);

let dir = "";
let all: Found = [];
const found = (issues: { file: string; line: number; col: number; rule: string }[]): Found => sort(issues.filter((i) => i.rule in A11Y_RULES).map((i) => [i.file, i.line, i.col, i.rule]));
const cli = (...args: string[]): Found => found(cliJson(["lint", ".", "--a11y", "--json", ...args], dir).issues);
const lint = (ignore: string[]): Found => found(lintRun([dir], { a11y: true, cwd: dir, ignore }).issues);
const vite = (ignore: string[]): Found => {
  const warned: string[] = [];
  const p = tsDom({ dirs: ["."], a11y: { ignore } });
  p.configResolved({ root: dir });
  p.buildStart.call({ warn: (m: string) => warned.push(m), error: (m: string) => { throw new Error(m); } });
  return sort(warned.map((w) => /^(?:.*\/)?([^/]+\.html):(\d+):(\d+) warning \[([\w-]+)\]/.exec(w)).flatMap((m) => (m ? [[m[1] as string, Number(m[2]), Number(m[3]), m[4] as string]] : [])));
};
const oxlintRule = (rule: string): Found => {
  const found: Found = [];
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    for (const [i] of FIXTURES.entries()) {
      const filename = join(dir, `f${i}.ts`);
      const visitor = plugin.rules[rule as keyof typeof plugin.rules].create({ filename, sourceCode: { text: readFileSync(filename, "utf8") }, options: [], report: ({ message }) => {
        const m = /^\.\/(f\d+\.html)\.js:(\d+):(\d+) \[([\w-]+)\]/.exec(message);
        if (m) found.push([m[1] as string, Number(m[2]), Number(m[3]), m[4] as string]);
      } });
      visitor.ImportDeclaration({ type: "ImportDeclaration", source: { value: `./f${i}.html.js` } });
    }
  } finally {
    process.chdir(cwd);
  }
  return sort(found);
};

beforeAll(() => {
  dir = writeTree(
    {
      "x-card.html": `<div>Card</div>\n`,
      "x-card.ts": `${H}import tpl from "./x-card.html.js";\nexport class Card extends Component(tpl) {}\ndefine("x-card", Card);\n`,
      ...Object.fromEntries(
        FIXTURES.flatMap(([html], i) => [
          [`f${i}.html`, `${html}\n`],
          [`f${i}.ts`, `${H}import tpl from "./f${i}.html.js";\nexport class F${i} extends Component(tpl) {\n  go(): void {}\n}\ndefine("x-f${i}", F${i});\n`],
        ]),
      ),
    },
    "nativele-a11y-rules-",
  );
  all = cli();
});

describe("every a11y rule decides on its own", () => {
  it("each fixture is reported by the rules it is about", () => {
    FIXTURES.forEach(([, rules], i) => expect([`f${i}.html`, all.filter((f) => f[0] === `f${i}.html`).map((f) => f[3])]).toEqual([`f${i}.html`, rules]));
  });
  it("ts-dom lint: one rule on gives what all rules on give for that rule", () => {
    expect(lint([])).toEqual(all);
    for (const rule of RULES) expect([rule, only(lint(allBut(rule)), rule)]).toEqual([rule, only(all, rule)]);
  });
  it("--ignore reaches the lint run", () => {
    expect(only(cli(...allBut("unchecked-content").map((r) => `--ignore=${r}`)), "unchecked-content")).toEqual(only(all, "unchecked-content"));
  }, 30_000);
  it("the Vite plugin's a11y.ignore: one rule on gives what all rules on give for that rule", () => {
    const viteAll = vite([]);
    expect(viteAll).toEqual(all);
    for (const rule of RULES) expect([rule, only(vite(allBut(rule)), rule)]).toEqual([rule, only(all, rule)]);
  });
  it("the oxlint plugin: the rule ts-dom/<id> alone gives what ts-dom/a11y gives for that id", () => {
    expect(oxlintRule("a11y")).toEqual(all);
    for (const rule of RULES) expect([rule, oxlintRule(rule)]).toEqual([rule, only(all, rule)]);
  });
});
