import { describe, expect, it } from "vitest";
import { checkA11y } from "../src/lib/a11y.ts";
import type { A11yChildren } from "../src/lib/a11y.ts";

// The templates of the components the checked template uses.
const children: A11yChildren = new Map(
  Object.entries({
    "x-box": `<div class="box"><slot></slot></div>`,
    "x-named": `<div><slot name="action"></slot><slot></slot></div>`,
    "x-fallback": `<div><slot>Default</slot></div>`,
    "x-action": `<button type="button">Act</button>`,
    "x-plain": `<span class="plain"></span>`,
    "x-wrap": `<div><vendor-thing></vendor-thing></div>`,
    "x-tree": `<ul><li><x-tree></x-tree></li></ul>`,
    "x-tree-link": `<div><a href="/node">Node</a><x-tree-link></x-tree-link></div>`,
    "x-field": `<label>{{ label }} <slot></slot></label>`,
    "x-labelled": `<label>Name <x-box><slot></slot></x-box></label>`,
    "x-named-field": `<label>Name <slot name="control"></slot></label><slot></slot>`,
  }).map(([tag, html]) => [tag, { template: { file: `${tag}.html`, html } }]),
);

// The element each rule judges, around the content of a case; the content is given as [for a click, for a name].
const RULES = {
  "click-semantics": (inner: string) => `<div data-on-click="go">${inner}</div>`,
  "control-name": (inner: string) => `<button type="button">${inner}</button>`,
  "heading-empty": (inner: string) => `<h2>${inner}</h2>`,
} as const;
const button = `<button type="button">Open</button>`;

// Each case: what goes inside the judged element (for the click rule, for the two name rules), and whether the rules report it.
const CASES: [name: string, click: string, text: string, reported: boolean][] = [
  ["a slot that gets the content", `<x-box>${button}</x-box>`, `<x-box>Open</x-box>`, false],
  ["a slot that gets nothing", `<x-box></x-box>`, `<x-box></x-box>`, true],
  ["the child template has it", `<x-action></x-action>`, `<x-action></x-action>`, false],
  ["the child template has nothing", `<x-plain></x-plain>`, `<x-plain></x-plain>`, true],
  ["a named slot that gets the content", `<x-named><span slot="action">${button}</span></x-named>`, `<x-named><span slot="action">Open</span></x-named>`, false],
  ["content for a slot the child does not have", `<x-named><span slot="nope">${button}</span></x-named>`, `<x-named><span slot="nope">Open</span></x-named>`, true],
  ["a slot's fallback content", `<x-fallback></x-fallback>`, `<x-fallback></x-fallback>`, true],
  ["a third-party element inside the child template", `<x-wrap></x-wrap>`, `<x-wrap></x-wrap>`, false],
  ["a third-party element", `<vendor-icon></vendor-icon>`, `<vendor-icon></vendor-icon>`, false],
  ["a component that contains itself and nothing else", `<x-tree></x-tree>`, `<x-tree></x-tree>`, true],
  ["a component that contains itself and a link", `<x-tree-link></x-tree-link>`, `<x-tree-link></x-tree-link>`, false],
  ["an operable element of its own", button, "Open", false],
  ["a list whose item holds a link", `<ul><li><a href="/x">Link</a></li></ul>`, `<ul><li>Link</li></ul>`, false],
];

describe("an element's composed content: its own descendants and what the components inside it render", () => {
  for (const [rule, wrap] of Object.entries(RULES)) {
    for (const [name, click, text, reported] of CASES) {
      // A slot's fallback text names a button or heading, but is no click source.
      const expected = name === "a slot's fallback content" ? rule === "click-semantics" : reported;
      it(`${rule}: ${name}`, () => {
        const html = wrap(rule === "click-semantics" ? click : text);
        expect(checkA11y(html, [], children).filter((d) => d.rule === rule).length > 0).toBe(expected);
      });
    }
  }
  it("click-semantics on a component's tag reads what its slots get", () => {
    expect(checkA11y(`<x-box data-on-click="go">${button}</x-box>`, [], children)).toEqual([]);
    expect(checkA11y(`<x-box data-on-click="go">Open</x-box>`, [], children).map((d) => d.rule)).toEqual(["click-semantics"]);
  });
  it("form-label: a control is labelled by a <label> around the slot it goes to, also through a component inside that template", () => {
    const formLabel = (html: string) => checkA11y(html, [], children).filter((d) => d.rule === "form-label").length;
    expect(formLabel(`<x-field label="Name"><input></x-field>`)).toBe(0);
    expect(formLabel(`<x-labelled><input></x-labelled>`)).toBe(0);
    expect(formLabel(`<x-named-field><input slot="control"></x-named-field>`)).toBe(0);
    expect(formLabel(`<x-named-field><input></x-named-field>`)).toBe(1);
    expect(formLabel(`<x-box><input></x-box>`)).toBe(1);
    expect(formLabel(`<vendor-field><input></vendor-field>`)).toBe(1);
  });
});

describe("unchecked-content: an element a rule cannot judge because its composed content holds content lint cannot read", () => {
  const found = (html: string) => checkA11y(html, [], children).map((d) => [d.rule, d.message] as const);
  const UNREADABLE: [name: string, inner: string, names: string][] = [
    ["a third-party element", `<wa-icon name="x"></wa-icon>`, `<wa-icon>`],
    ["a third-party element inside a child template", `<x-wrap></x-wrap>`, `<vendor-thing> in the template of <x-wrap>`],
    ["a slot of the template being checked", `<slot name="icon"></slot>`, `<slot name="icon">`],
  ];
  for (const [rule, wrap] of Object.entries(RULES)) {
    for (const [name, inner, names] of UNREADABLE) {
      it(`${rule}: ${name} gives one unchecked-content warning that names the rule and the content, and no ${rule}`, () => {
        const ds = found(wrap(inner));
        expect(ds.map(([r]) => r)).toEqual(["unchecked-content"]);
        expect(ds[0]?.[1]).toContain(`not checked for ${rule}`);
        expect(ds[0]?.[1]).toContain(names);
        expect(ds[0]?.[1]).toContain("Fix: ");
      });
    }
  }
  it("the keyboard-inaccessible div around a third-party icon and text", () => {
    const ds = checkA11y(`<div data-on-click="open"><wa-icon name="x"></wa-icon> Open</div>`, [], children);
    expect(ds.map((d) => [d.rule, d.line, d.col, d.severity])).toEqual([["unchecked-content", 1, 1, "warning"]]);
  });
  it("one warning per element, naming every rule that could not judge it", () => {
    const ds = found(`<h2 data-on-click="go"><wa-icon></wa-icon><slot></slot></h2>`);
    expect(ds.map(([r]) => r)).toEqual(["unchecked-content"]);
    expect(ds[0]?.[1]).toContain("not checked for heading-empty and click-semantics");
    expect(ds[0]?.[1]).toContain("<wa-icon>");
    expect(ds[0]?.[1]).toContain("<slot>");
  });
  it("content lint can read decides, whatever else is there", () => {
    expect(found(`<button type="button"><wa-icon></wa-icon> Save</button><h2><slot></slot>Title</h2><div data-on-click="go"><wa-icon></wa-icon>${button}</div>`)).toEqual([]);
    expect(found(`<button type="button"><slot>Save</slot></button>`)).toEqual([]);
  });
  it("a third-party element with data-on-click itself is left to unchecked-custom-elements", () => {
    expect(found(`<wa-button data-on-click="go">Save</wa-button>`)).toEqual([]);
  });
  it("is left out with the rules it names", () => {
    expect(checkA11y(`<div data-on-click="go"><wa-icon></wa-icon></div>`, ["click-semantics"], children)).toEqual([]);
    expect(checkA11y(`<div data-on-click="go"><wa-icon></wa-icon></div>`, ["unchecked-content"], children)).toEqual([]);
  });
});
