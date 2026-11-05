# Nativele: instructions for coding agents

## Position

Nativele is for people who build with TypeScript and HTML and want to keep things light. HTML describes the structure and where data goes, TypeScript owns behavior and state, and the DOM is the single source of truth for what is rendered. The library is public and used by many kinds of projects; it is never shaped around one of them.

Nativele is a reliable, light, composable UI foundation layer inside larger applications. It does not grow into a framework that does everything: routing, global state, data fetching, validation, styling, testing and the dev server belong to mature tools, and Nativele provides the components they work with. Its integration abilities grow through Skills, not through the core.

Names: the brand and the GitHub repository are Nativele (`Pixmi/nativele`); the npm package is `@nativele/ts-dom` (scoped, because npm rejects the unscoped `ts-dom` as too similar to an existing package); the command line tool and the lint rule namespace are `ts-dom`. Imports are always written `@nativele/ts-dom`.

## Core principles

Use these to decide whether a feature or change belongs in the library:

- HTML holds names, not expressions: `{{ name }}` is a single identifier, with no paths or operations. Compute in TypeScript and fill a named hole. The library does not grow toward a template language.
- Types are derived from the HTML by codegen, and `tsc` and lint check that the HTML and the TypeScript agree. This is the library's core value.
- No virtual DOM: updates are explicit, local DOM operations, never a whole-tree diff.
- The lifecycle is the Custom Elements lifecycle; there is no second one.
- Data flows one way: a component changes its own state, the parent changes props, events go up. `emit` does not bubble by default; crossing layers is explicit or goes through a shared store, never implicit.
- Rendering is synchronous, with no implicit asynchronous batching; `batch` combines updates explicitly.
- No fine-grained reactivity: behavior stays predictable, with no dependency-tracking magic.
- `state` is optional; shared data goes through `createStore`, and subscriptions happen only where `bind` is called.
- No icon management, no built-in i18n, no ready-made UI components: users build those with their own components or `this.text`, and the library only offers the hooks to connect them.
- Without a bundler, `ts-dom gen` plus `tsc` must be enough. Templates are always imported as `./x.html.js`, which works with and without Vite. The Vite plugin is a convenience, never a requirement.
- Pages that enforce Trusted Types must work as they are: no HTML string is parsed at runtime, templates are built from generated node data with DOM calls, and no feature may use `innerHTML` or another parsing API.
- As few dependencies as possible, and none at runtime; `parse5` is used only by codegen and lint.
- Do not make developers learn a new abstraction invented by this library just so an agent writes a few lines less: help for agents comes from better checks, messages, documentation and Skills, never from new syntax or implicit behavior.
- Each tool checks only what it can see: markup well-formedness belongs to a formatter (oxfmt), template rules to `ts-dom gen`, names and types to `tsc`, usage and data flow to lint, the project set-up to `ts-dom doctor`. A new check goes into the right layer, without duplicating another.

The Design Decisions section of the design guide lists deliberate trade-offs, not missing features: do not implement them as to-dos.

## Skills

Integration with frameworks and other tools is delivered as Skills, not as runtime code:

- A Skill is a task procedure for an agent: set-up steps, a complete example, known limitations and verification commands. Facts about the library's API live in `docs/`; a Skill links to them instead of restating them.
- Every Skill states the versions it was verified with (Nativele and each third-party tool) and the date of that verification. Outdated guidance is more dangerous than none.
- A Skill never adds a dependency to the library's core or changes its runtime.
- Tiers: Official (verified and maintained by the maintainers, with an example project checked in CI), Community (contributed, with its author and last verified versions), Experimental (not fully verified yet). New contributions start as Experimental.
- Skills live in `skills/<name>/SKILL.md` and follow `skills/README.md`. An Official Skill's `example/` is verified by `.github/workflows/skills.yml`; after changing the runtime or a Skill, run `npm run build:lib` and `npm run verify` in that example. A new minor version updates every Skill's `nativele` range and `verified` date once it has been verified again.
- Reviewing a PR that adds or changes a Skill: follow "How a Skill pull request is accepted" in `skills/README.md`. Run the trial with a fresh subagent that gets only the packed package, the Skill and a task the Skill claims to cover, then check the result yourself instead of trusting the subagent's report. Report every guess or error the subagent hit that the Skill does not cover; the Skill is not accepted until a trial passes with nothing to add.

## Language

- Everything public is in English: `README.md`, the guides in `docs/`, `CHANGELOG.md`, `llms.txt`, Skills, code comments, error and diagnostic messages, PR descriptions, and this file.
- Only `README.zh-TW.md` is in Traditional Chinese and mirrors `README.md`; change both together. The guides in `docs/` are English only.
- `README.md` holds only the introduction (the short version, the rules for agents, the quick start, the example list, links to the guides); details go into the matching file in `docs/`. The README links to the guides with full GitHub URLs so they also work on the npm page.

## Development

- Before committing, run `npm run check`, `npm test` and `npm run lint`; when runtime behavior changes, also run `npm run test:browser`.
- Write no comments by default: only a reason the code cannot show (an outside constraint, an order that must not change), never a restatement of what the code does.
- Diagnostics use the format `file:line:col severity [rule-id] message` and end with a `Fix:` hint; every new rule follows it.
- A new rule or public API updates the matching guide in `docs/`, `llms.txt` and `CHANGELOG.md`; update `README.md` and `README.zh-TW.md` only when it changes the introduction.
- Breaking changes to the public API go into `CHANGELOG.md` under their version; the versioning policy is in that file.
- The generated `*.html.ts` files and `ts-dom-tags.ts` are never committed.
- Releasing: the version lives only in `version` in `package.json`. After a commit that changes it is merged into `main`, `.github/workflows/release.yml` checks the version format and the matching `CHANGELOG.md` heading, then stages the version on npm with Trusted Publishing (`npm stage publish`, OIDC, no token) and creates the `v<version>` tag and GitHub Release (nothing happens when the tag exists; a version with `-` is a prerelease tagged `next` on npm). A maintainer approves the staged version with 2FA on npmjs.com or with `npm stage approve` before it is public. The release notes come from the description of the PR that changed the version, so that description is written as release notes (Summary, Changes, Breaking Changes).
