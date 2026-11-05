// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Browser, Page } from "playwright-core";
import { parseFragment } from "parse5";
import { toNodes } from "../src/lib/codegen.ts";
import { launchChrome } from "./server.ts";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launchChrome();
  page = await browser.newPage();
  await page.setContent("<!doctype html><body></body>");
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

// `formatted` is what Prettier 3.9.10 and oxfmt 0.76.0 (both with printWidth 40, which give the same output) write for `line`.
const cases: { name: string; line: string; formatted: string }[] = [
  {
    name: "inline siblings",
    line: `<p class="meta"><strong>Open</strong> <a href="#owner">ann</a> <time>2 days ago</time> <span>3 comments</span></p>`,
    formatted: `<p class="meta">\n  <strong>Open</strong>\n  <a href="#owner">ann</a>\n  <time>2 days ago</time>\n  <span>3 comments</span>\n</p>\n`,
  },
  {
    name: "inline elements next to text",
    line: `<p>Posted by <a href="#">ann</a> on <time>Monday</time>, with <b>3</b> comments and <i>no</i> reactions yet.</p>`,
    formatted: `<p>\n  Posted by <a href="#">ann</a> on\n  <time>Monday</time>, with\n  <b>3</b> comments and\n  <i>no</i> reactions yet.\n</p>\n`,
  },
  {
    name: "text next to blocks",
    line: `<div>Intro text here <div>block one</div> trailing words <p>a paragraph</p> end of it</div>`,
    formatted: `<div>\n  Intro text here\n  <div>block one</div>\n  trailing words\n  <p>a paragraph</p>\n  end of it\n</div>\n`,
  },
  {
    name: "nested inline elements",
    line: `<p><span><b>bold</b> <i>italic</i></span> <span><em>emphasis</em> <strong>strong</strong></span> <small>small text here</small></p>`,
    formatted: `<p>\n  <span><b>bold</b> <i>italic</i></span>\n  <span\n    ><em>emphasis</em>\n    <strong>strong</strong></span\n  >\n  <small>small text here</small>\n</p>\n`,
  },
  {
    name: "list items",
    line: `<ul><li>one</li><li>two <b>bold</b> three</li><li><a href="#">a link</a> <span>after the link</span></li></ul>`,
    formatted: `<ul>\n  <li>one</li>\n  <li>two <b>bold</b> three</li>\n  <li>\n    <a href="#">a link</a>\n    <span>after the link</span>\n  </li>\n</ul>\n`,
  },
  {
    name: "buttons with a line break inside",
    line: `<div><button type="button"><span>Save</span> <b>now</b></button> <button type="button">Cancel this operation please</button></div>`,
    formatted: `<div>\n  <button type="button">\n    <span>Save</span> <b>now</b>\n  </button>\n  <button type="button">\n    Cancel this operation please\n  </button>\n</div>\n`,
  },
  {
    name: "custom elements",
    line: `<p><user-badge>ann</user-badge> <user-badge>bob</user-badge> <status-pill>open</status-pill> and more words here</p>`,
    formatted: `<p>\n  <user-badge>ann</user-badge>\n  <user-badge>bob</user-badge>\n  <status-pill>open</status-pill> and\n  more words here\n</p>\n`,
  },
  {
    name: "<br>",
    line: `<p>line one with words<br>line two with more words<br>line three</p>`,
    formatted: `<p>\n  line one with words<br />line two with\n  more words<br />line three\n</p>\n`,
  },
  {
    name: "comments between elements",
    line: `<p><a href="#">one</a> <!-- note --> <b>two</b><!-- x --> <i>three</i></p><!-- c --><div>block</div>`,
    formatted: `<p>\n  <a href="#">one</a>\n  <!-- note -->\n  <b>two</b><!-- x -->\n  <i>three</i>\n</p>\n<!-- c -->\n<div>block</div>\n`,
  },
  {
    name: "blocks at the top level",
    line: `<h2>Hello, <b>ann</b>!</h2><p>You have <strong>3</strong> new messages.</p>`,
    formatted: `<h2>Hello, <b>ann</b>!</h2>\n<p>\n  You have <strong>3</strong> new\n  messages.\n</p>\n`,
  },
  {
    name: "inline elements at the top level",
    line: `<span>first part</span> <span>second part</span> <a href="#">and a link</a>`,
    formatted: `<span>first part</span>\n<span>second part</span>\n<a href="#">and a link</a>\n`,
  },
  {
    name: "table",
    line: `<table><tbody><tr><td>a <b>b</b></td><td>c</td></tr></tbody></table>`,
    formatted: `<table>\n  <tbody>\n    <tr>\n      <td>a <b>b</b></td>\n      <td>c</td>\n    </tr>\n  </tbody>\n</table>\n`,
  },
  {
    name: "label with an input",
    line: `<label>Name <input name="n"> <span>a hint about the name</span></label>`,
    formatted: `<label\n  >Name <input name="n" />\n  <span\n    >a hint about the name</span\n  ></label\n>\n`,
  },
  {
    name: "non-breaking spaces",
    line: `<p>a&nbsp;&nbsp;b <b>c</b>&nbsp;<i>d</i> with some more text to wrap</p>`,
    formatted: `<p>\n  a&nbsp;&nbsp;b <b>c</b>&nbsp;<i>d</i>\n  with some more text to wrap\n</p>\n`,
  },
  {
    name: "<pre> and <textarea>",
    line: `<pre>  keep\n  this</pre><textarea>  and\n this</textarea>`,
    formatted: `<pre>\n  keep\n  this</pre>\n<textarea>\n  and\n this</textarea>\n`,
  },
];

/** The `innerText` of an inline host holding the built nodes, between two words, so whitespace at the template's edges counts too. */
const rendered = (html: string, collapse: boolean) =>
  page.evaluate((nodes) => {
    type N = string | [string, Record<string, string>, N[], string?];
    const build = (n: N): Node => {
      if (typeof n === "string") return document.createTextNode(n);
      if (n[0] === "#comment") return document.createComment(n[1] as unknown as string);
      const el = n[3] ? document.createElementNS(n[3], n[0]) : document.createElement(n[0]);
      for (const [k, v] of Object.entries(n[1])) el.setAttribute(k, v);
      for (const c of n[2]) el.append(build(c));
      return el;
    };
    const box = document.createElement("div");
    const host = document.createElement("x-host");
    for (const n of nodes as N[]) host.append(build(n));
    box.append("before", host, "after");
    document.body.replaceChildren(box);
    const text = (el: Element) => (el instanceof HTMLTextAreaElement ? el.value : "");
    return box.innerText + [...box.querySelectorAll("textarea")].map(text).join("|");
  }, toNodes(parseFragment(html), collapse));

describe("whitespace collapse renders what the browser renders (real Chrome)", () => {
  for (const c of cases) {
    it(c.name, async () => {
      const written = await rendered(c.line, false);
      expect(await rendered(c.formatted, true)).toBe(written);
      expect(await rendered(c.line, true)).toBe(written);
    });
  }
});
