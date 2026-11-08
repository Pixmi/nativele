# Nativele: guide for coding agents

Nativele (`@nativele/ts-dom`) builds web components from an HTML template and a TypeScript custom element. HTML names the structure and where data goes, TypeScript owns state and behavior, and the DOM is the only view. There is no virtual DOM, no runtime dependency and no bundler requirement. Imports are always written `@nativele/ts-dom`; the command line tool is `ts-dom`.

## How it works

1. Write `x.html` (markup, `{{ name }}` holes, `data-ref`, `data-if`, `data-on-<event>`, `<template data-each>`) next to `x.ts` (a class extending `Component(tpl, { state, props, derive, emits })`).
2. `ts-dom gen` turns each `x.html` into `x.html.ts` (generated types and node data), so `tsc` can check that the HTML and the TypeScript agree.
3. `ts-dom check` runs gen, `tsc` (or `vue-tsc`) and lint in one pass and points errors at the template.

Import templates as `./x.html.js`. Never edit `x.html.ts` or `ts-dom-tags.ts`: they are generated.

## Rules that shape the code you write

`llms.txt` holds the rules, one line each with a link to its guide section. Read it before writing a template or a component.

## Workflow

1. Before working on Nativele components, run `npx ts-dom skills nativele-core` and follow it.
2. After any `.html` or component change, run `npx ts-dom check --json` and fix every issue by its `Fix:` hint.

The other commands for agents are in the "Rules for agents" section of `llms.txt`.

## Where to look

- `llms.txt`: the full syntax and API reference in one page, with a link per rule to its guide section.
- `docs/`: the guides (`templates`, `components`, `lists`, `recipes`, `architecture`, `tooling`, `performance`, `design`). The same files ship in the installed package under `node_modules/@nativele/ts-dom/docs/`.
- Skills: `npx ts-dom skills` lists the task procedures shipped with the package (building components, frameworks, tooling and architecture) and shows which ones cover the project's dependencies.
- `examples/`: runnable examples, including `examples/readme/` and `examples/recipes/`.

## Scope

Nativele is a light UI foundation layer inside larger applications. Routing, global state, data fetching, validation, styling, testing and the dev server belong to other tools, and integrations with them are Skills, not core features. The "Design Decisions" section of `docs/design.md` lists deliberate trade-offs, not missing features: do not implement them as to-dos.
