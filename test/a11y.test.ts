import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { A11Y_RULES, checkA11y } from "../src/lib/a11y.ts";
import { contractsAt, contractsFor } from "../src/lib/lint.ts";

const rules = (html: string, ignore: string[] = []) => checkA11y(html, ignore).map((d) => d.rule);
const component = (cls: string, tag: string) => `import { Component, define } from "@nativele/ts-dom";\nimport tpl from "./${tag}.html.js";\nexport class ${cls} extends Component(tpl) {}\ndefine("${tag}", ${cls});\n`;

describe("a11y should warn", () => {
  it("img without alt", () => expect(rules(`<img src="a.png">`)).toEqual(["img-alt"]));
  it("button / a without a name", () => {
    expect(rules(`<button></button>`)).toEqual(["control-name"]);
    expect(rules(`<a href="/x"><i></i></a>`)).toEqual(["control-name"]);
  });
  it("form controls without a label", () => {
    expect(rules(`<input type="text">`)).toEqual(["form-label"]);
    expect(rules(`<select></select><textarea></textarea>`)).toEqual(["form-label", "form-label"]);
  });
  it("iframe, dialog, empty heading", () => {
    expect(rules(`<iframe src="x"></iframe>`)).toEqual(["iframe-title"]);
    expect(rules(`<dialog></dialog>`)).toEqual(["dialog-name"]);
    expect(rules(`<h2> </h2>`)).toEqual(["heading-empty"]);
  });
  it("invalid role and aria-*", () => {
    expect(rules(`<div role="buton"></div>`)).toEqual(["aria-role"]);
    expect(rules(`<div aria-labeledby="x"></div>`)).toEqual(["aria-attr"]);
  });
  it("interactive role without tabindex; tabindex greater than 0; aria-hidden focusable element", () => {
    expect(rules(`<div role="button">go</div>`)).toEqual(["role-tabindex"]);
    expect(rules(`<div tabindex="3"></div>`)).toEqual(["tabindex-positive"]);
    expect(rules(`<button aria-hidden="true">x</button>`)).toEqual(["hidden-focusable"]);
  });
  it("label for with a missing id, duplicate id, id inside a list", () => {
    expect(rules(`<label for="nope">x</label><input id="a" aria-label="a">`)).toEqual(["label-for"]);
    expect(rules(`<i id="a"></i><b id="a"></b>`)).toEqual(["duplicate-id", "duplicate-id"]);
    expect(rules(`<template data-each="l"><li id="x">{{ a }}</li></template>`)).toEqual(["id-in-list"]);
  });
  it("carries line, column and rule id", () => {
    const d = checkA11y(`<p></p>\n<img src="a">`)[0];
    expect(d?.line).toBe(2);
    expect(d?.rule).toBe("img-alt");
    expect(d?.col).toBe(1);
    expect(d?.message).toMatch(/^<img> has no alt/);
    expect(d?.message).not.toMatch(/^\[/);
    expect(d?.message).toContain("Fix:");
  });
});

describe("a11y semantics and id references", () => {
  it("aria-idref: references an id that does not exist", () => {
    expect(rules(`<p id="a">x</p><div aria-labelledby="a nope"></div>`)).toEqual(["aria-idref"]);
    expect(rules(`<div aria-describedby="x"></div>`)).toEqual(["aria-idref"]);
    expect(rules(`<button aria-controls="panel">x</button><div id="panel"></div>`)).toEqual([]);
    expect(rules(`<div data-ref="d" aria-labelledby="set-by-ts"></div>`)).toEqual([]);
  });
  it("heading-order: levels must not be skipped", () => {
    expect(rules(`<h1>a</h1><h3>b</h3>`)).toEqual(["heading-order"]);
    expect(rules(`<h2>a</h2><h3>b</h3><h2>c</h2><h3>d</h3>`)).toEqual([]);
    expect(rules(`<h3>only one</h3>`)).toEqual([]);
  });
  it("table-header", () => {
    expect(rules(`<table><tr><td>x</td></tr></table>`)).toEqual(["table-header"]);
    expect(rules(`<table><tr><th>x</th></tr></table>`)).toEqual([]);
    expect(rules(`<table role="presentation"><tr><td>x</td></tr></table>`)).toEqual([]);
  });
  it("list-structure: children of ul/ol and the parent of li", () => {
    expect(rules(`<ul><div>x</div></ul>`)).toEqual(["list-structure"]);
    expect(rules(`<ul><template data-each="l"><div>{{ a }}</div></template></ul>`)).toEqual(["list-structure"]);
    expect(rules(`<div><li>x</li></div>`)).toEqual(["list-structure"]);
    expect(rules(`<ul><template data-each="l" data-key="id" data-prop="item"><x-row role="listitem"></x-row></template></ul>`)).toEqual([]);
    expect(rules(`<ul><template data-each="l" data-key="id" data-prop="item"><x-row></x-row></template></ul>`)).toEqual(["list-structure"]);
    expect(rules(`<ul><x-row role="listitem"></x-row></ul>`)).toEqual([]);
    expect(rules(`<ul><li>x</li><template data-each="l"><li>{{ a }}</li></template></ul>`)).toEqual([]);
    expect(rules(`<li>a top-level li leaves the parent to the using element</li>`)).toEqual([]);
  });
  it("landmark-label: several navs must be told apart", () => {
    expect(rules(`<nav>a</nav><nav>b</nav>`)).toEqual(["landmark-label", "landmark-label"]);
    expect(rules(`<nav aria-label="Main">a</nav><nav aria-label="Footer">b</nav>`)).toEqual([]);
    expect(rules(`<nav>only</nav>`)).toEqual([]);
  });
  it("redundant-role", () => {
    expect(rules(`<button role="button">x</button>`)).toEqual(["redundant-role"]);
    expect(rules(`<nav role="navigation">x</nav><a href="/" role="link">x</a>`)).toEqual(["redundant-role", "redundant-role"]);
    expect(rules(`<ul role="list"><li>x</li></ul>`)).toEqual(["redundant-role"]);
    expect(rules(`<ul role="menu"><li role="menuitem" tabindex="-1">x</li></ul>`)).toEqual([]);
  });
});

describe("click-semantics", () => {
  it("data-on-click on a non-interactive element warns", () => {
    expect(rules(`<div data-on-click="go">x</div>`)).toEqual(["click-semantics"]);
    expect(rules(`<template data-each="l"><li data-on-click="go">{{ a }}</li></template>`)).toEqual(["click-semantics"]);
  });
  it("button, a[href], editable content and elements with a role and tabindex do not warn", () => {
    expect(rules(`<button data-on-click="go">x</button><a href="/" data-on-click="go">x</a><p contenteditable data-on-click="go">x</p>`)).toEqual([]);
    expect(rules(`<div role="button" tabindex="0" data-on-click="go">x</div>`)).toEqual([]);
  });
  it("an interactive role without tabindex is reported by role-tabindex, with data-on-click too and whatever click-semantics's setting; click-semantics leaves it alone", () => {
    expect(rules(`<div role="button" data-on-click="go">x</div>`)).toEqual(["role-tabindex"]);
    expect(rules(`<div role="button" data-on-click="go">x</div>`, ["click-semantics"])).toEqual(["role-tabindex"]);
    expect(rules(`<div role="button" data-on-click="go">x</div>`, ["role-tabindex"])).toEqual([]);
    expect(rules(`<div role="button" data-ref="x" data-on-click="go">x</div>`)).toEqual([]);
    expect(rules(`<div role="button">x</div>`)).toEqual(["role-tabindex"]);
  });
  it("role-tabindex still reports a custom element whose click click-semantics accepts", () => {
    expect(rules(`<x-card role="button" data-on-click="go"></x-card>`)).toEqual(["role-tabindex"]);
  });
  it("a label warns unless it wraps a control, whose click, by keyboard too, reaches the label", () => {
    expect(rules(`<label data-on-click="go"><input type="checkbox"> x</label>`)).toEqual([]);
    expect(rules(`<label data-on-click="go">x</label>`)).toEqual(["click-semantics"]);
    expect(rules(`<label for="a" data-on-click="go">x</label><input id="a" type="checkbox">`)).toEqual(["click-semantics"]);
  });
  it("other events are not checked", () => {
    expect(rules(`<form data-on-submit="go"></form><input data-on-input="go" aria-label="x">`)).toEqual([]);
  });

  function scanned(files: Record<string, string>, page: string) {
    const root = mkdtempSync(join(tmpdir(), "ts-dom-"));
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, name)), { recursive: true });
      writeFileSync(join(root, name), text);
    }
    return { root, check: (html: string) => checkA11y(html, [], contractsAt(contractsFor([root]), join(root, page))) };
  }
  const children = scanned(
    {
      "x-action.ts": component("Action", "x-action"),
      "x-action.html": `<div class="row"><template data-if="open"><button type="button">{{ label }}</button></template></div>`,
      "x-edit.ts": component("Edit", "x-edit"),
      "x-edit.html": `<p contenteditable="true">{{ text }}</p>`,
      "x-wrap.ts": component("Wrap", "x-wrap"),
      "x-wrap.html": `<div><wa-button>{{ label }}</wa-button></div>`,
      "x-card.ts": component("Card", "x-card"),
      "x-card.html": `<div class="card"><span>{{ title }}</span></div>`,
    },
    "page.html",
  );
  it("a custom element with no definition lint can read is not checked", () => {
    expect(rules(`<wa-button data-on-click="go">Save</wa-button>`)).toEqual([]);
    expect(children.check(`<wa-button data-on-click="go">Save</wa-button>`)).toEqual([]);
  });
  it("a scanned component whose template has an operable element (or an unreadable custom element) does not warn", () => {
    expect(children.check(`<x-action data-on-click="go"></x-action><x-edit data-on-click="go"></x-edit><x-wrap data-on-click="go"></x-wrap>`)).toEqual([]);
  });
  it("a scanned component whose template has no operable element warns and names the template", () => {
    const [d, ...rest] = children.check(`<div><x-card data-on-click="go"></x-card></div>`);
    expect(rest).toEqual([]);
    expect(d?.rule).toBe("click-semantics");
    expect(d?.message).toContain(`<x-card>, and its template (${relative(process.cwd(), join(children.root, "x-card.html"))}) has no operable element`);
    expect(d?.message).toContain("Fix: ");
    expect([d?.line, d?.col]).toEqual([1, 6]);
  });
  it("the component tag with an interactive role plus tabindex does not warn", () => {
    expect(children.check(`<x-card role="button" tabindex="0" data-on-click="go"></x-card>`)).toEqual([]);
  });
  it("a label wrapping a component counts the component's template, and an unreadable custom element as operable", () => {
    expect(children.check(`<label data-on-click="go"><x-action></x-action> a</label><label data-on-click="go"><wa-switch></wa-switch> b</label>`)).toEqual([]);
    expect(children.check(`<label data-on-click="go"><x-card></x-card> a</label>`).map((d) => d.rule)).toEqual(["click-semantics"]);
  });
  it("a tag defined in several packages, none of them the template's, is not checked", () => {
    const card = `<div><span>{{ title }}</span></div>`;
    const multi = scanned({ "a/package.json": "{}", "a/x-card.ts": component("Card", "x-card"), "a/x-card.html": card, "b/package.json": "{}", "b/x-card.ts": component("Card", "x-card"), "b/x-card.html": card }, "page.html");
    expect(multi.check(`<x-card data-on-click="go"></x-card>`)).toEqual([]);
  });
});

describe("a11y should not false-positive", () => {
  it("controls with a name", () => {
    expect(rules(`<button>Go</button><button aria-label="x"></button><button>{{ label }}</button>`)).toEqual([]);
    expect(rules(`<a href="/"><img src="a" alt="home"></a>`)).toEqual([]);
    expect(rules(`<button><slot></slot></button>`)).toEqual([]);
  });
  it("elements managed by TS (with data-ref) skip the missing-name checks", () => {
    expect(rules(`<button data-ref="b"></button><img data-ref="i"><input data-ref="n"><h1 data-ref="t"></h1>`)).toEqual([]);
  });
  it("labelled inputs", () => {
    expect(rules(`<label>Name <input></label>`)).toEqual([]);
    expect(rules(`<label for="n">Name</label><input id="n">`)).toEqual([]);
    expect(rules(`<input type="hidden"><input type="submit"><input aria-label="q">`)).toEqual([]);
  });
  it("decorative images, valid roles, focusable roles", () => {
    expect(rules(`<img src="a" alt=""><img src="b" role="presentation">`)).toEqual([]);
    expect(rules(`<div role="button" tabindex="0">x</div><button role="tab">x</button><div role="doc-toc"></div>`)).toEqual([]);
    expect(rules(`<div tabindex="0"></div><div tabindex="-1"></div><div aria-hidden="true"></div>`)).toEqual([]);
  });
  it("style content and template items do not affect the result", () => {
    expect(rules(`<style>a{}</style><template data-each="l"><li><button>{{ x }}</button></li></template>`)).toEqual([]);
  });
});

describe("rule coverage and messages", () => {
  /** At least one input per rule id. */
  const INPUTS: Record<string, string> = {
    "img-alt": `<img src="a.png">`,
    "control-name": `<button></button>`,
    "form-label": `<input type="text">`,
    "iframe-title": `<iframe src="x"></iframe>`,
    "dialog-name": `<dialog></dialog>`,
    "heading-empty": `<h2> </h2>`,
    "aria-role": `<div role="buton"></div>`,
    "aria-attr": `<div aria-labeledby="x"></div>`,
    "role-tabindex": `<div role="button">go</div>`,
    "tabindex-positive": `<div tabindex="3"></div>`,
    "hidden-focusable": `<button aria-hidden="true">x</button>`,
    "label-for": `<label for="nope">x</label>`,
    "id-in-list": `<template data-each="l"><li id="x">{{ a }}</li></template>`,
    "duplicate-id": `<i id="a"></i><b id="a"></b>`,
    "aria-idref": `<div aria-labelledby="nope"></div>`,
    "heading-order": `<h1>a</h1><h3>b</h3>`,
    "table-header": `<table><tr><td>x</td></tr></table>`,
    "list-structure": `<ul><div>x</div></ul>`,
    "landmark-label": `<nav>a</nav><nav>b</nav>`,
    "redundant-role": `<button role="button">x</button>`,
    "click-semantics": `<div data-on-click="go">x</div>`,
  };
  it("every A11Y_RULES key is produced by at least one input", () => {
    for (const rule of Object.keys(A11Y_RULES)) {
      expect(INPUTS[rule], `no input for ${rule}`).toBeTypeOf("string");
      expect(rules(INPUTS[rule] as string), rule).toContain(rule);
    }
    for (const rule of Object.keys(INPUTS)) expect(A11Y_RULES, rule).toHaveProperty(rule);
  });
  it("every rule has a short description, without the Fix: hint that each message carries", () => {
    for (const [rule, description] of Object.entries(A11Y_RULES)) expect(description, rule).not.toMatch(/Fix:|\.$/);
  });
  it("ts-dom rules and the oxlint rules describe each rule with its A11Y_RULES text", async () => {
    const { default: plugin } = await import("../src/lib/oxlint-plugin.ts");
    const described = plugin.rules as Record<string, { meta: { docs: { description: string } } }>;
    const listed = (JSON.parse(execFileSync(process.execPath, ["src/cli.ts", "rules", "--json"], { encoding: "utf8" })) as { rules: { id: string; group: string; description: string }[] }).rules;
    for (const [rule, description] of Object.entries(A11Y_RULES)) {
      expect(described[rule]?.meta.docs.description, rule).toBe(description);
      expect(listed.find((r) => r.group === "lint: a11y" && r.id === rule)?.description, rule).toBe(description);
    }
  }, 30_000);
  it("every produced diagnostic is a warning with a position and a Fix: hint", () => {
    for (const [rule, html] of Object.entries(INPUTS)) {
      const ds = checkA11y(html).filter((d) => d.rule === rule);
      expect(ds.length, rule).toBeGreaterThan(0);
      for (const d of ds) {
        expect(d.severity).toBe("warning");
        expect(d.line).toBeGreaterThanOrEqual(1);
        expect(d.col).toBeGreaterThanOrEqual(1);
        expect(d.message).toContain("Fix:");
        expect(d.message).not.toMatch(/^\[/);
      }
    }
  });
  it("detailed messages name the offending element", () => {
    expect(checkA11y(`<button></button>`)[0]?.message).toMatch(/^<button> has no accessible name/);
    expect(checkA11y(`<div role="buton"></div>`)[0]?.message).toContain(`"buton"`);
    expect(checkA11y(`<h1>a</h1><h4>b</h4>`)[0]?.message).toMatch(/<h4> skips a heading level/);
    expect(checkA11y(`<div aria-labelledby="nope"></div>`)[0]?.message).toContain(`"nope"`);
  });
  it("ignore silences each rule by id", () => {
    for (const [rule, html] of Object.entries(INPUTS)) expect(rules(html, [rule]), rule).not.toContain(rule);
  });
});

describe("ignore", () => {
  it("individual rules can be turned off", () => {
    expect(rules(`<img src="a"><button></button>`, ["img-alt"])).toEqual(["control-name"]);
  });
});

describe("Vite plugin", () => {
  const setup = async (files: Record<string, string>, opts: Record<string, unknown> = {}) => {
    const { mkdirSync, mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { tsDom } = await import("../src/lib/vite-plugin.ts");
    const dir = mkdtempSync(join(tmpdir(), "ts-dom-"));
    mkdirSync(join(dir, "src"));
    for (const [n, c] of Object.entries(files)) writeFileSync(join(dir, "src", n), c);
    const warns: string[] = [];
    const ctx = { warn: (m: string) => warns.push(m), error: (m: string): never => { throw new Error(m); } };
    return { dir, warns, ctx, plugin: tsDom({ dirs: [join(dir, "src")], ...opts }) };
  };
  it("buildStart generates .html.ts; a11y does not warn by default", async () => {
    const { existsSync } = await import("node:fs");
    const t = await setup({ "x.html": `<img src="a"><button></button>` });
    t.plugin.buildStart.call(t.ctx);
    expect(existsSync(`${t.dir}/src/x.html.ts`)).toBe(true);
    expect(t.warns).toEqual([]);
  });
  it("a11y: true warns; ignore turns individual checks off", async () => {
    const t = await setup({ "x.html": `<img src="a"><button></button>` }, { a11y: true });
    t.plugin.buildStart.call(t.ctx);
    expect(t.warns.length).toBe(2);
    const u = await setup({ "x.html": `<img src="a"><button></button>` }, { a11y: { ignore: ["img-alt"] } });
    u.plugin.buildStart.call(u.ctx);
    expect(u.warns.length).toBe(1);
    expect(u.warns[0]).toMatch(/control-name/);
  });
  it("a11y checks data-on-click on a scanned component against its template, as lint does", async () => {
    const t = await setup(
      {
        "x-card.ts": component("Card", "x-card"),
        "x-card.html": `<div class="card"><span>{{ title }}</span></div>`,
        "x-action.ts": component("Action", "x-action"),
        "x-action.html": `<button type="button">{{ label }}</button>`,
        "page.html": `<x-card data-on-click="go"></x-card><x-action data-on-click="go"></x-action>`,
      },
      { a11y: true },
    );
    t.plugin.buildStart.call(t.ctx);
    expect(t.warns).toHaveLength(1);
    expect(t.warns[0]).toMatch(/page\.html:1:1 warning \[click-semantics\] data-on-click is on <x-card>, and its template/);
  });
  it("a template error aborts the build; full-page documents are skipped", async () => {
    const bad = await setup({ "x.html": `<a data-ref="d"></a><b data-ref="d"></b>` });
    expect(() => bad.plugin.buildStart.call(bad.ctx)).toThrow(/duplicate-ref.*more than once/);
    const { existsSync } = await import("node:fs");
    const page = await setup({ "index.html": `<!doctype html><html><body><script></script></body></html>` });
    page.plugin.buildStart.call(page.ctx);
    expect(existsSync(`${page.dir}/src/index.html.ts`)).toBe(false);
  });
  const devServer = (t: { plugin: ReturnType<typeof import("../src/lib/vite-plugin.ts").tsDom> }) => {
    const handlers: Record<string, (f: string) => void> = {};
    const sent: unknown[] = [];
    t.plugin.configureServer({ watcher: { add: () => {}, on: (ev, fn) => (handlers[ev] = fn) }, config: { logger: { error: () => {}, warn: () => {} } } });
    const server = { config: { logger: { error: () => {}, warn: () => {} } }, moduleGraph: { getModulesByFile: (f: string) => new Set([f]), invalidateModule: () => {} }, ws: { send: (p: unknown) => sent.push(p) } };
    return { handlers, sent, server };
  };
  it("dev: dirs are relative to Vite's root, not to the working directory", async () => {
    const { existsSync } = await import("node:fs");
    const { tsDom } = await import("../src/lib/vite-plugin.ts");
    const t = await setup({ "x.html": `<p></p>` });
    const plugin = tsDom({ dirs: ["src"] });
    plugin.configResolved({ root: t.dir });
    plugin.buildStart.call(t.ctx);
    expect(existsSync(`${t.dir}/src/x.html.ts`)).toBe(true);
  });
  it("a dirs entry that does not exist under Vite's root is reported when the build or dev server starts", async () => {
    const { tsDom } = await import("../src/lib/vite-plugin.ts");
    const t = await setup({ "x.html": `<p></p>` });
    const plugin = tsDom({ dirs: ["src", "web/src"] });
    plugin.configResolved({ root: t.dir });
    plugin.buildStart.call(t.ctx);
    expect(t.warns).toHaveLength(1);
    expect(t.warns[0]).toMatch(/web\/src:1:1 warning \[dir-not-found\] .* Fix: dirs are resolved against Vite's root/);
  });
  it("dev: a save that does not change the generated module does not reload the page", async () => {
    const { writeFileSync } = await import("node:fs");
    const t = await setup({ "x.html": `<p>{{ a }}</p>` });
    t.plugin.buildStart.call(t.ctx);
    const d = devServer(t);
    writeFileSync(`${t.dir}/src/x.html`, `<p>{{ a }}</p>`);
    expect(t.plugin.handleHotUpdate({ file: `${t.dir}/src/x.html`, server: d.server })).toEqual([]);
    expect(d.sent).toEqual([]);
  });
  it("dev: each generated content reloads the page once; a rewrite with new content goes through Vite", async () => {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const t = await setup({ "x.html": `<p>{{ a }}</p>` });
    t.plugin.buildStart.call(t.ctx);
    const d = devServer(t);
    const generated = `${t.dir}/src/x.html.ts`;
    writeFileSync(`${t.dir}/src/x.html`, `<p>{{ b }}</p>`);
    t.plugin.handleHotUpdate({ file: `${t.dir}/src/x.html`, server: d.server });
    expect(d.sent).toHaveLength(1);
    expect(t.plugin.handleHotUpdate({ file: generated, server: d.server })).toEqual([]);
    expect(t.plugin.handleHotUpdate({ file: generated, server: d.server })).toEqual([]);
    writeFileSync(generated, readFileSync(generated, "utf8").replace('"b"', '"c"'));
    expect(t.plugin.handleHotUpdate({ file: generated, server: d.server })).toBeUndefined();
    expect(t.plugin.handleHotUpdate({ file: generated, server: d.server })).toEqual([]);
    expect(d.sent).toHaveLength(1);
  });
  it("dev: deleting a template removes its generated module", async () => {
    const { existsSync, unlinkSync } = await import("node:fs");
    const t = await setup({ "x.html": `<p></p>` });
    t.plugin.buildStart.call(t.ctx);
    const d = devServer(t);
    unlinkSync(`${t.dir}/src/x.html`);
    d.handlers.unlink?.(`${t.dir}/src/x.html`);
    expect(existsSync(`${t.dir}/src/x.html.ts`)).toBe(false);
  });
  it("dev: adding or removing a define() regenerates the tag map and the templates' child imports", async () => {
    const { existsSync, readFileSync, unlinkSync, writeFileSync } = await import("node:fs");
    const t = await setup({ "x.html": `<x-kid></x-kid>` });
    t.plugin.buildStart.call(t.ctx);
    const d = devServer(t);
    expect(existsSync(`${t.dir}/src/ts-dom-tags.ts`)).toBe(false);
    writeFileSync(`${t.dir}/src/kid.ts`, `export class Kid {}\ndefine("x-kid", Kid);`);
    d.handlers.add?.(`${t.dir}/src/kid.ts`);
    expect(readFileSync(`${t.dir}/src/ts-dom-tags.ts`, "utf8")).toContain(`"x-kid"`);
    expect(readFileSync(`${t.dir}/src/x.html.ts`, "utf8")).toContain(`import "./kid.js";`);
    writeFileSync(`${t.dir}/src/kid.ts`, `export class Kid {}`);
    t.plugin.handleHotUpdate({ file: `${t.dir}/src/kid.ts`, server: d.server });
    expect(existsSync(`${t.dir}/src/ts-dom-tags.ts`)).toBe(false);
    expect(readFileSync(`${t.dir}/src/x.html.ts`, "utf8")).not.toContain("kid.js");
    writeFileSync(`${t.dir}/src/kid.ts`, `export class Kid {}\ndefine("x-kid", Kid);`);
    t.plugin.handleHotUpdate({ file: `${t.dir}/src/kid.ts`, server: d.server });
    unlinkSync(`${t.dir}/src/kid.ts`);
    d.handlers.unlink?.(`${t.dir}/src/kid.ts`);
    expect(existsSync(`${t.dir}/src/ts-dom-tags.ts`)).toBe(false);
  });
  it("dev: a template save uses the cached define() scan; only a .ts change rescans", async () => {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const t = await setup({ "x.html": `<x-kid></x-kid>` });
    t.plugin.buildStart.call(t.ctx);
    const d = devServer(t);
    t.plugin.handleHotUpdate({ file: `${t.dir}/src/x.html`, server: d.server });
    writeFileSync(`${t.dir}/src/kid.ts`, `export class Kid {}\ndefine("x-kid", Kid);`);
    writeFileSync(`${t.dir}/src/x.html`, `<x-kid></x-kid><b></b>`);
    t.plugin.handleHotUpdate({ file: `${t.dir}/src/x.html`, server: d.server });
    expect(readFileSync(`${t.dir}/src/x.html.ts`, "utf8")).not.toContain("kid.js");
    t.plugin.handleHotUpdate({ file: `${t.dir}/src/kid.ts`, server: d.server });
    expect(readFileSync(`${t.dir}/src/x.html.ts`, "utf8")).toContain(`import "./kid.js";`);
  });
  it("dev: errors go to the logger of the server that saw the change", async () => {
    const { writeFileSync } = await import("node:fs");
    const t = await setup({ "x.html": `<p></p>` });
    t.plugin.buildStart.call(t.ctx);
    const a: string[] = [];
    const b: string[] = [];
    const watcher = { add: () => {}, on: () => {} };
    t.plugin.configureServer({ watcher, config: { logger: { error: (m: string) => a.push(m), warn: () => {} } } });
    t.plugin.configureServer({ watcher, config: { logger: { error: (m: string) => b.push(m), warn: () => {} } } });
    writeFileSync(`${t.dir}/src/x.html`, `<p>{{ a.b }}</p>`);
    const server = { config: { logger: { error: (m: string) => a.push(m), warn: () => {} } }, moduleGraph: { getModulesByFile: () => undefined, invalidateModule: () => {} }, ws: { send: () => {} } };
    t.plugin.handleHotUpdate({ file: `${t.dir}/src/x.html`, server });
    expect(a.join("\n")).toContain("invalid-hole");
    expect(b).toEqual([]);
  });
  it("dev: a changed .html is regenerated, the old module forgotten and the page reloaded once, even when the path is relative", async () => {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const { relative } = await import("node:path");
    const t = await setup({ "x.html": `<p>{{ a }}</p>` });
    t.plugin.buildStart.call(t.ctx);
    t.plugin.configureServer({
      watcher: { add: () => {}, on: () => {} },
      config: { logger: { error: () => {}, warn: () => {} } },
    });
    const sent: unknown[] = [];
    const forgotten: string[] = [];
    const server = {
      config: { logger: { error: () => {}, warn: () => {} } },
      moduleGraph: { getModulesByFile: (f: string) => new Set([f]), invalidateModule: (m: unknown) => forgotten.push(String(m)) },
      ws: { send: (payload: unknown) => sent.push(payload) },
    };
    writeFileSync(`${t.dir}/src/x.html`, `<p>{{ b }}</p>`);
    const result = t.plugin.handleHotUpdate({ file: relative(process.cwd(), `${t.dir}/src/x.html`), server });
    expect(readFileSync(`${t.dir}/src/x.html.ts`, "utf8")).toContain(`text: "b"`);
    expect(forgotten).toEqual([`${t.dir}/src/x.html.ts`]);
    expect(sent).toEqual([{ type: "full-reload" }]);
    expect(result).toEqual([]);
    expect(t.plugin.handleHotUpdate({ file: `${t.dir}/src/x.html.ts`, server })).toEqual([]);
    expect(sent).toHaveLength(1);
    const unused = { ...server, moduleGraph: { ...server.moduleGraph, getModulesByFile: () => undefined } };
    writeFileSync(`${t.dir}/src/x.html`, `<p>{{ c }}</p>`);
    expect(t.plugin.handleHotUpdate({ file: `${t.dir}/src/x.html`, server: unused })).toEqual([]);
    expect(readFileSync(`${t.dir}/src/x.html.ts`, "utf8")).toContain(`text: "c"`);
    expect(sent).toHaveLength(1);
  });
});
