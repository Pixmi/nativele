---
name: nativele-formatting
description: "Keep a formatter (oxfmt, Prettier, vp fmt) and Nativele (@nativele/ts-dom) consistent without replacing the formatter or its options: what reformatting does to .html templates and their rendered spacing, which whitespace mode to generate with, how to check that a reformat changed no text, and keeping the formatter off the generated files. Use when a project with @nativele/ts-dom formats its templates, when ts-dom doctor reports formatter-whitespace, or when spacing or text changed after formatting a template."
metadata:
  tier: official
  nativele: ">=0.7.0 <0.8.0"
  verified: "2026-11-06"
  tools: "oxfmt@0.76.0 prettier@3.9.10 vite-plus@1.5.0 typescript@6.0.3"
  author: "Nativele maintainers"
  detects: "prettier oxfmt"
---

# Nativele + formatters

## When to use

- The project depends on `@nativele/ts-dom` and formats its files with oxfmt, Prettier or `vp fmt` (Vite+, which runs its bundled oxfmt). Signals: `oxfmt` or `prettier` in `package.json`, a script that runs `oxfmt`, `prettier` or `vp fmt`, a `fmt` block in `vite.config.*`, a `.oxfmtrc.json`, `.oxfmtrc.jsonc`, `oxfmt.config.ts`, `.prettierrc*`, `prettier.config.*` or a `prettier` key in `package.json`.
- `ts-dom doctor` reports `formatter-whitespace`, a formatter's `--check` fails on a generated `x.html.ts`, or text on the page or in a test changed after a template was formatted (words run together, a gap appeared, `textContent` gained newlines).
- This Skill owns the formatter's configuration and ignore files as far as Nativele is concerned, and the choice of whitespace mode. It does not own the scripts or the Vite config that pass the mode to `ts-dom gen` (`nativele-vite`, or the framework's Skill), the tsconfig (`nativele-typescript`), lint (`nativele-linting`), tests (`nativele-testing`) or CI (`nativele-ci`); it states what they need and leaves the how to them.
- Not for choosing or setting up a formatter: it starts from the formatter the project already has, and never replaces it, reformats files the task did not touch, or changes its options (`printWidth`, `htmlWhitespaceSensitivity`, ...).

Why it matters: `ts-dom gen` turns every text node of a template into data, including whitespace, so where a formatter puts line breaks and indentation becomes part of the component. Which whitespace survives depends on the mode the template is generated with.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | 0.7.0 (the last agent trial) |
| oxfmt | 0.76.0 |
| prettier | 3.9.10 |
| vite-plus | 1.5.0 (`vp fmt` runs oxfmt 0.76.0) |
| typescript | 6.0.3 |

Verified on 2026-11-06 in fresh projects built from the packed library, with each formatter at its defaults, by comparing the generated node data before and after formatting and the text rendered in Google Chrome 148. With another major version of a formatter (or an oxfmt other than 0.76.x, which is pre-1.0), treat every statement about its output as unverified and run the checks in step 5.

## Set-up

Check first, then change only what fails. Keep the formatter, its configuration and its options as they are.

1. **Find the formatter and what it reaches.** Look for the signals in "When to use". Then run the formatter's own check on the folder with the templates, as the project runs it (`npx oxfmt --check <dir>`, `npx prettier --check <dir>`, `npx vp fmt --check`), after `npx ts-dom gen <dir>` so the generated files exist. The listed files show whether it formats the `.html` templates and whether it touches the generated `x.html.ts` and `ts-dom-tags.ts`. oxfmt and Prettier format `.html` by default.
2. **Read the current whitespace mode and doctor's view.**
   - A generated `x.html.ts` written with `collapse` has `// whitespace: collapse` as its second line; without that line it was written with `preserve`.
   - Look for `--whitespace=` in the `package.json` scripts and `whitespace:` in the `tsDom()` options of the Vite config.
   - Run `npx ts-dom doctor <dir>`. When it detects a formatter and nothing asks for `collapse`, it prints `warning [formatter-whitespace] A formatter (oxfmt or Prettier) is set up, and templates keep their whitespace as written, so reformatting a template can change the spacing on the page. Fix: generate with whitespace "collapse" ...`. When a script or the Vite config asks for `collapse` but a generated file was written with `preserve`, it reports that file. Warnings leave the exit code at 0.
3. **Keep the formatter off the generated files.** They are rewritten by every `ts-dom gen` and `ts-dom check`, so a reformatted one is reported as `error [stale-generated] The generated file is outdated` by `ts-dom gen --check` and `ts-dom check --no-write`, and the formatter's `--check` fails again after the next generation.
   - If `.gitignore` lists `*.html.ts` and `ts-dom-tags.ts` (as the guides recommend), there is nothing to add: oxfmt, Prettier and `vp fmt` skip git-ignored files when they format a folder.
   - If the project commits the generated files, add the two patterns to the ignore list the formatter already uses, as new lines, without touching the rest: `.prettierignore` (read by Prettier and by oxfmt) with `**/*.html.ts` and `**/ts-dom-tags.ts`; or oxfmt's `ignorePatterns` array in its existing config file; or, for `vp fmt`, `fmt.ignorePatterns` in the existing `defineConfig` of `vite.config.ts`. Do not create a second config file for a formatter that already has one.
   - Do not ignore the templates (`*.html`): the formatter is what reports misnested markup that `ts-dom gen` accepts (Known limitations 4).

   Keep it off the installed Skills too. `ts-dom skills add` copies them into `.agents/skills/` (or `.claude/skills/`), which `.gitignore` usually does not list, so a `--check` over the whole project fails on their Markdown. Add that folder to the formatter's own ignore file (`.prettierignore`, or oxfmt's `ignorePatterns`), next to whatever it already ignores.
4. **Generate with whitespace `collapse`**, which doctor asks for when a formatter reaches the templates. What each mode does to a template after formatting, measured with oxfmt and Prettier at their defaults:

   | Formatter change | `preserve` | `collapse` |
   |---|---|---|
   | Line breaks and indentation in running text | same rendering; `textContent` gains the newlines and indentation | same rendering and the same text |
   | Newline and indentation added inside a block or inline-block (`<p>`, `<button>`, `<li>`) | same rendering; `textContent` gains them (`"\n  Toggle\n"`) | same rendering and the same text (`"Toggle"`) |
   | Newline added between two elements the formatter treats as blocks (`<div>`) that CSS makes `inline-block` | a gap appears between them (4px in the test) | no gap, as before |
   | Line breaks inside an element styled `white-space: pre-line` or `pre-wrap` | the formatter's line breaks show on the page | as before |
   | A space between two inline elements (`</a> <time>`) turned into a line break | same rendering | same rendering and the same text: the line break becomes one space |
   | `<pre>`, `<textarea>` | unchanged | unchanged |

   `collapse` keeps only the whitespace the browser renders: a run of whitespace between two inline-level siblings becomes one space, and whitespace next to a block-level element or at the start and end of a block or inline-block element's content is dropped. It judges each element by its default display, as both formatters do, so reformatting changes neither the page nor `textContent`; an element whose CSS changes its display is still judged by its tag (Known limitations 1). The mode is set where `ts-dom gen` runs, which this Skill does not own. State this requirement to the owner of the scripts and the Vite config (`nativele-vite`, or the framework's Skill): every `ts-dom gen`, `ts-dom gen --watch` and `ts-dom check` in the scripts that can write the generated files passes `--whitespace=collapse`, and, when the project uses the Vite plugin, it has the same mode too (`tsDom({ dirs: [...], whitespace: "collapse" })`): both write the generated files. A run without the flag keeps the mode a file was last written with, but on a clean checkout it writes `preserve`. Then regenerate once with the flag. If the user decides to keep `preserve`, leave it: doctor keeps the warning, and the rows above say what reformatting can change.
5. **Check that a reformat changed no text** (`collapse` only). Generate before formatting, keep a copy, format, generate again, and compare the generated data one node per line:

   ```sh
   npx ts-dom gen src/nv --whitespace=collapse
   cp src/nv/issue-meta.html.ts /tmp/before.ts
   npx prettier --write src/nv/issue-meta.html   # or oxfmt, vp fmt
   npx ts-dom gen src/nv
   diff <(tail -1 /tmp/before.ts | tr ',' '\n') <(tail -1 src/nv/issue-meta.html.ts | tr ',' '\n')
   ```

   No output means the generated data, and so the text, is the same. A template with a `<style>` block can show one changed line: the formatter's CSS indentation inside the style string, which does not change the page; any other changed line is a real change. With the versions above it printed nothing for every template measured: inline elements and text broken over lines, content moved onto its own lines inside `<p>` and `<button>`, and blocks put on separate lines. Run it when the formatter's version differs from the Versions table.
6. **Page documents are not templates.** A file that starts with `<!doctype html>` or `<html>` is a page entry, which `ts-dom gen` does not process, and the browser parses it with normal HTML rules; the whitespace mode does not apply, and formatting it needs nothing from Nativele. Both formatters rewrite `<!DOCTYPE html>` to `<!doctype html>` and keep a JSON `importmap` valid; `ts-dom gen` still skips the page afterwards.
7. **State what the other areas need**, without changing them:
   - Tests (`nativele-testing`): with `collapse`, `textContent` does not change when a template is reformatted, but it is not the text the page shows between blocks: an `<h2>` followed by a `<p>` gives `"Hello, NAME!You have"`, before and after formatting, while `innerText` in a real browser separates them with a blank line. Assert on the element that holds the text, or on `innerText` in a real browser. With `preserve`, `textContent` gains the formatter's newlines and indentation (the table in step 4); compare it with its whitespace normalized (`el.textContent.replace(/\s+/g, " ").trim()`).
   - CI (`nativele-ci`): run the formatter's `--check`, and pass the same mode to every `ts-dom gen` and `ts-dom check` there (`--whitespace=collapse`): on a clean checkout a run without it writes `preserve`, and `--no-write` with a mode different from the one the files were written with reports them as `stale-generated`.
8. **Run Verify.**

### What formatting does to Nativele markup

Both formatters, at their defaults, on templates that pass `ts-dom check`; every formatted template still passed `ts-dom check`:

| Markup | What the formatter does | Effect |
|---|---|---|
| `{{ name }}` | kept as written (`{{name}}` stays without spaces); at the line width, both may break inside it: `{{` at the end of a line and `name }}` on the next | none: `{{\n  name }}` is the same hole for `ts-dom gen`, `tsc` and the runtime |
| `data-ref`, `data-if`, `data-on-*`, `data-each` values | unchanged; long attribute lists are put one per line | none |
| `class`, `style` | `class="  one   two  "` becomes `class="one two"`; `style="color:red"` becomes `style="color: red"` | none |
| `<template data-each>` | content kept against the tags (`<template data-each="rows"\n  ><li ...>...</li></template\n>`); Prettier adds whitespace inside the `<li>` | none: whitespace around or inside the item root is accepted |
| `<style scoped>` | the CSS is reformatted, `scoped` kept | none |
| Void elements | `<input>` becomes `<input />` | none: the same generated data |
| `<pre>`, `<textarea>` | a newline is added after the opening tag | none: the HTML parser drops a newline right after the tag |
| Text next to holes | reflowed at the line width | as the table in step 4 |

## Example

A component whose status line separates its parts with plain spaces, in a project that formats with Prettier and generates with `collapse`.

```html
<!-- src/nv/issue-meta.html, before formatting -->
<p class="meta"><strong>{{ status }}</strong> <a href="#owner">{{ owner }}</a> <time>{{ opened }}</time> <span>{{ comments }}</span></p>
```

```ts
// src/nv/issue-meta.ts
import { Component, define } from "@nativele/ts-dom";
import tpl from "./issue-meta.html.js";

export class IssueMeta extends Component(tpl, {
  state: { status: "Open", owner: "ann", opened: "2 days ago", comments: "3 comments" },
}) {}

define("issue-meta", IssueMeta);
```

`npx prettier --write src/nv/issue-meta.html` writes:

```html
<p class="meta">
  <strong>{{ status }}</strong> <a href="#owner">{{ owner }}</a>
  <time>{{ opened }}</time> <span>{{ comments }}</span>
</p>
```

`ts-dom check` still passes, the comparison in step 5 prints nothing, and the page shows `Open ann 2 days ago 3 comments`, as before formatting; the element's `textContent` is the same string. oxfmt (line width 100) breaks before `<span>` instead, with the same result. Each line break between the inline elements is generated as one space, like the spaces written on one line.

## Known limitations

1. **`collapse` judges an element by its tag, not by its CSS.** It drops the whitespace next to a block-level tag and inside the edges of a block or inline-block tag, as both formatters treat those tags, so a `<div>` styled `display: inline` loses the space next to it before any formatting: `<div class="il">alpha</div> <div class="il">beta</div>` renders `alphabeta` (with `preserve`, `alpha beta`); `&#32;` there is dropped too. Write inline content with an inline tag (`<span>`), around which the formatters and `collapse` keep the spaces; do not switch to `preserve` for it, which brings back the other rows of the table.
2. **Doctor finds a formatter through these signals**: `oxfmt` or `prettier` in the dependencies, a `prettier` key in `package.json`, a script running `oxfmt`, `vp fmt` or `prettier`, a `fmt` block in `vite.config.*`, `.oxfmtrc.json`, `.oxfmtrc.jsonc`, `oxfmt.config.*`, `.prettierrc`, `.prettierrc.*` or `prettier.config.*`. In a workspace package, doctor also finds them in the parent folders up to the workspace root. A formatter configured anywhere else is not reported. Apply step 4 when step 1 finds a formatter, whatever doctor says.
3. **Ignoring templates silences doctor only for Prettier.** A `.prettierignore` line `*.html` stops doctor counting Prettier as a formatter; oxfmt also honors that file and skips the templates, but doctor still warns when `oxfmt` is a dependency.
4. **The formatter is the markup check.** `<section><p><div>{{ a }}</p></div></section>` passes `ts-dom gen` (the HTML parser silently repairs it into a different tree), while `oxfmt --check` stops with `Syntax error: unexpected end tag` (exit code 2) and `prettier --check` with `SyntaxError: Unexpected closing tag "p"`. Keep the templates in the formatter's scope.
5. **oxfmt formats a git-ignored file named on its command line**: `oxfmt src/nv/user-card.html.ts` rewrites it although `.gitignore` lists `*.html.ts`; `.prettierignore` and `ignorePatterns` do stop it (oxfmt then prints `Expected at least one target file`). Prettier skips a git-ignored file in both cases. Point the formatter at folders, or use `.prettierignore`/`ignorePatterns` when tools pass file names to it.
6. **Prettier changes SVG text.** It formats the content of an SVG `<text>` as blocks, so where text and a `<tspan>` touch (`Hello<tspan>World</tspan>`) it can put a line break between them, which renders as a space in either whitespace mode; oxfmt keeps them inline. Keep such text on one line with `<!-- prettier-ignore -->` before the `<svg>`.

## Verify

```sh
npx ts-dom gen src/nv --whitespace=collapse   # writes the modules; prints nothing
sed -n 2p src/nv/<name>.html.ts               # expect: // whitespace: collapse
npx ts-dom doctor src/nv                      # expect: no formatter-whitespace issue
npx oxfmt --check src/nv                      # or prettier --check, vp fmt --check; expect: the generated *.html.ts and ts-dom-tags.ts are not listed
npx ts-dom check src/nv --no-write --whitespace=collapse   # after the gen above; expect: ts-dom check: no issues
```

Then run the project's own format check and build scripts from a clean checkout (no generated files): both pass, and the files this task edited (a Vite config with a new option, for example) are formatted too. For every template the formatter rewrote in this task, the step 5 comparison prints nothing. In the browser, the component's text reads as before formatting.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `warning [formatter-whitespace] A formatter (oxfmt or Prettier) is set up, and templates keep their whitespace as written` | templates are generated with `preserve` | step 4 |
| `warning [formatter-whitespace] The script "<name>" asks for whitespace "collapse", but this generated file was written with "preserve"` | a `ts-dom gen` or `ts-dom check` ran without the flag on a clean folder | run the named script once; make every generating run pass the flag (step 4) |
| Two words run together on the page with `collapse` (`alphabeta`) | a block-level tag (`<div>`) that CSS makes inline, next to the space | write it with an inline tag such as `<span>` (Known limitations 1) |
| A gap appears between elements, or the formatter's line breaks show on the page | `preserve` with elements styled `inline-block` or `white-space: pre-line`/`pre-wrap` | generate with `collapse` (step 4) |
| A test of `textContent` fails after formatting (`"\n  Toggle\n"`) | `preserve`: the formatter's whitespace is part of the text | generate with `collapse` (step 4), or compare normalized text (step 7) |
| `error [stale-generated] The generated file is outdated` right after `oxfmt` or `prettier --write` | the formatter rewrote a generated `x.html.ts` | step 3, then `npx ts-dom gen <dir>` |
| `oxfmt --check` or `prettier --check` fails on `*.html.ts` after every `ts-dom check` | the generated files are not ignored | step 3 |
| `Syntax error: unexpected end tag` (oxfmt) or `Unexpected closing tag` (Prettier) on a template that `ts-dom check` accepts | misnested markup | fix the nesting at the reported line (Known limitations 4) |

## See also

- Whitespace modes, the recorded mode and `--whitespace=collapse`: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#installation-and-setup
- What each tool checks, including the formatter, and `ts-dom doctor`: https://github.com/Pixmi/nativele/blob/main/docs/tooling.md#checks
- Template markup and holes: https://github.com/Pixmi/nativele/blob/main/docs/templates.md#html-syntax
- The generated files, page documents and why they are not committed: https://github.com/Pixmi/nativele/blob/main/docs/templates.md#how-types-are-generated
- How Skills share a project, and who owns which configuration: https://github.com/Pixmi/nativele/blob/main/skills/README.md#how-skills-work-together
