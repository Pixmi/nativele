# Nativele: guide for coding agents

Nativele (`@nativele/ts-dom`) builds web components from an HTML template and a TypeScript custom element. HTML names the structure and where data goes, TypeScript owns state and behavior, and the DOM is the only view. There is no virtual DOM, no runtime dependency and no bundler requirement. Imports are always written `@nativele/ts-dom`; the command line tool is `ts-dom`.

## How it works

1. Write `x.html` (markup, `{{ name }}` holes, `data-ref`, `data-if`, `data-on-<event>`, `<template data-each>`) next to `x.ts` (a class extending `Component(tpl, { state, props, derive, emits })`).
2. `ts-dom gen` turns each `x.html` into `x.html.ts` (generated types and node data), so `tsc` can check that the HTML and the TypeScript agree.
3. `ts-dom check` runs gen, `tsc` (or `vue-tsc`) and lint in one pass and points errors at the template.

Import templates as `./x.html.js`. Never edit or commit `x.html.ts` or `ts-dom-tags.ts`.

## Rules that shape the code you write

- HTML holds single identifiers, not expressions: `{{ a.b }}` and `{{ a + 1 }}` are errors. Compute in TypeScript and fill a named hole.
- Data flows one way: a component changes its own `state` with `this.set(...)`, the parent sets props, events go up with `emit` (no bubbling). For data several levels away use a shared `createStore` and `bind`, never forward props or re-emit events.
- `state`, `props` and `view` are deeply readonly: replace objects, never mutate them.
- Rendering is synchronous; combine updates with `this.batch(fn)`. Lists, attributes and focus go in `render(view, changed)`.
- Call `bind`, `on` and `onCleanup` in `connected()`, not in the constructor.
- Never cast a type error away: fix the template or the component.

## Workflow

1. After any `.html` or component change, run `npx ts-dom check --json` and fix every issue by its `Fix:` hint. Diagnostics read `file:line:col severity [rule-id] message`.
2. `npx ts-dom rules --explain=<id>` explains a rule id: why it exists, a wrong example, the fix.
3. If checks behave oddly (no types, a template not found), run `npx ts-dom doctor --json` first.
4. `npx ts-dom gen --check` tells whether generated files are stale before you trust `tsc` errors.

## Where to look

- `llms.txt`: the full syntax and API reference in one page, with a link per rule to its guide section.
- `docs/`: the guides (`templates`, `components`, `lists`, `recipes`, `architecture`, `tooling`, `performance`, `design`). The same files ship in the installed package under `node_modules/@nativele/ts-dom/docs/`.
- Skills: `npx ts-dom skills` lists the task procedures shipped with the package (`nativele-core` for building components, plus framework, tooling and architecture topics); `npx ts-dom skills <name>` prints one and `npx ts-dom skills add <name>` copies it into `.claude/skills/` or `.agents/skills/`. Before working on Nativele components, run `npx ts-dom skills nativele-core` and follow it.
- `examples/`: runnable examples, including `examples/readme/` and `examples/recipes/`.

## Scope

Nativele is a light UI foundation layer inside larger applications. Routing, global state, data fetching, validation, styling, testing and the dev server belong to other tools, and integrations with them are Skills, not core features. The "Design Decisions" section of `docs/design.md` lists deliberate trade-offs, not missing features: do not implement them as to-dos.
