# Nativele Skills

Skills extend what Nativele can be used with, without growing the library: each one is a task procedure for a coding agent, verified with exact versions. This page is the specification every Skill follows and the guide for contributing one.

## What a Skill is

A Skill is a task procedure for a coding agent: how to do one integration or one kind of work with Nativele, step by step, with a complete example, the known limitations, and commands that prove it worked. It is not reference documentation: facts about the library's API live in `docs/`, and a Skill links to them instead of restating them.

An integration Skill (a framework, a build tool, a library) starts from a project that already uses that tool and teaches how to bring Nativele into it: what to add, what to change, and what to watch for. It does not teach how to set the tool itself up from nothing; the tool's own documentation and starter projects cover that.

A Skill never changes the library's runtime and never adds a dependency to the library's core. Third-party packages a Skill uses are dependencies of the user's project, installed by the Skill's own steps.

## Layout

```
skills/
├── README.md                     # this specification and the contribution guide
├── nativele-core/
│   └── SKILL.md
├── nativele-react/
│   ├── SKILL.md
│   └── example/                  # optional: a reference project from the agent trial
│       ├── package.json          # exact versions of every tool the Skill names
│       ├── ...                   # the minimal app the SKILL.md example comes from
│       └── verify.mjs            # browser checks run by `npm run verify` (or the project's own tests, see below)
└── ...
```

The npm package ships every `SKILL.md` (so the CLI can list and read them offline), not the `example/` folders.

## SKILL.md format

`SKILL.md` follows the Agent Skills format (YAML frontmatter with `name` and `description`, then Markdown), so Claude Code and other agents that read skills can load it as it is. Nativele's own fields go under `metadata`:

```markdown
---
name: nativele-react
description: "Use Nativele web components inside a React 19 app: props, events, children and slots, lifecycle, and TSX types. Use when a project has react and @nativele/ts-dom."
metadata:
  tier: official                 # official | community | experimental
  nativele: ">=0.5.0 <0.6.0"     # the library versions the Skill supports; the lower bound is the first one it was verified with
  verified: "2026-11-05"         # date of the last verification
  tools: "react@19.3.1 react-dom@19.3.1 vite@8.3.5 @vitejs/plugin-react@6.2.1 typescript@7.0.2"
  author: "Nativele maintainers" # for community Skills: the contributor
  detects: "react"               # package.json dependencies that make ts-dom doctor recommend this Skill
---
```

Quote the `description` and any value that contains `: `, so the frontmatter stays valid YAML for every agent that loads it.

Required sections, in this order:

1. **When to use**: the situation and the signals (dependencies, files) that call for this Skill, and when not to use it.
2. **Versions**: a table of every tool and the exact version it was verified with, and the date. The `@nativele/ts-dom` row names the version of the Skill's last agent trial. If the project uses a different major version of a tool, the Skill says so and stops treating its steps as verified.
3. **Set-up**: numbered steps with the exact commands and file contents, starting from a working project of the tool (for an integration Skill) and covering only what Nativele adds or changes.
4. **Example**: a complete, minimal working example (every file it needs, short).
5. **Known limitations**: what does not work or needs care, each with what to do instead. An agent must never have to guess these.
6. **Verify**: the commands that prove the integration works in the user's project (for example `npx ts-dom check`, `npx tsc --noEmit`, the project's build, a test), with the output to expect.
7. **Troubleshooting**: symptoms seen while verifying, their cause and fix.
8. **See also**: links to the guides in `docs/` for the facts used.

Rules for the content:

- Only what was run: every step, example and limitation comes from the verified example, not from memory of how a tool used to work.
- Version-bound statements say so ("React 19 passes object props as properties; React 18 passes everything as attributes").
- No promises beyond the verified versions.
- English, plain and concrete; no restating of `docs/`.

## Tiers

| Tier | Who maintains it | Requirements | Shown by `ts-dom skills` |
|---|---|---|---|
| Official | the Nativele maintainers | accepted through an agent trial and maintained by the maintainers; verified within the last 6 months | as official |
| Community | its author | the full SKILL.md format, `author` and `verified` filled in, accepted through a maintainer's agent trial | as community, with the author |
| Experimental | its author | the SKILL.md format; verification not complete | as experimental, with a warning |

- A new contribution starts as Experimental. It becomes Community when it passes a maintainer's agent trial (see "How a Skill pull request is accepted"), and Official when the maintainers adopt and maintain it.
- A Skill whose `verified` date is older than 6 months, or whose `nativele` range does not include the installed version, is shown as stale. A stale Official Skill is verified again with a new agent trial, or moved to Experimental until it is.

## Delivering Skills to projects

The library already lives in the user's `node_modules`, so its Skills travel with it:

- `ts-dom skills` lists the Skills shipped with the installed version: name, tier, description, verified date and versions, whether it is stale, and its path inside `node_modules`. `--json` prints the same as data for agents.
- `ts-dom skills <name>` prints that Skill (so an agent can read it without knowing the path).
- `ts-dom skills add <name...>` copies Skills into the project: into `.claude/skills/<name>/` when the project has a `.claude` folder, otherwise into `.agents/skills/<name>/` (`--to=<dir>` for another folder), where agents that load skills pick them up. It only copies; it never installs the third-party packages a Skill mentions.
- `ts-dom doctor` reads the project's `package.json` and, for each Skill whose `detects` dependency is present and that the project has no copy of, reports it as an `info` issue (`skill-available`); a copy that differs from the shipped one is reported as `skill-outdated`, for example: `package.json:1:1 info [skill-available] react is a dependency: the nativele-react Skill covers using Nativele components in React. Fix: run ts-dom skills add nativele-react, or read it with ts-dom skills nativele-react.` Info issues never change the exit code.

None of this adds a runtime dependency: listing and copying read the Markdown files with Node's file API, and the frontmatter is parsed with a small reader for the fields above.

## Examples

A Skill may keep the project from its agent trial in `skills/<name>/example/` as a reference: the files the Skill's example comes from, with exact versions and `"@nativele/ts-dom": "file:../../.."`. An example is not run in CI; the Skill is verified by its agent trials. The npm package does not ship the `example/` folders.

The workflow `.github/workflows/skills.yml` has one required check for `main`, "SKILL.md format": it checks every `SKILL.md` against this specification, and the links in the READMEs, `llms.txt` and the guides, whenever any of them changes.

## Contributing a Skill

- Copy `skills/_template/SKILL.md`, fill in every section, set `tier: experimental`.
- Run the Skill's verification commands in a fresh project with the versions you list, and paste their output in the PR description.
- The PR touches only `skills/<name>/`; a PR that changes the library and adds a Skill is split. Community and Experimental Skills live in this repository, in the same `skills/` folder, so they ship with the package and `ts-dom skills` lists them with their tier.

## How a Skill pull request is accepted

A Skill is written for agents, so the maintainers accept it by having an agent use it: a fresh agent that knows nothing about the Skill does real work with nothing but the Skill, and the result is checked. Reading the Skill or rerunning its verification commands is not enough, because neither shows what the Skill leaves out.

1. **Check the format**: the frontmatter is complete, every required section is there, the facts link to `docs/` instead of restating them, and nothing would add a dependency to the library's core.
2. **Build the package from the PR branch** (`npm run build:lib && npm pack`), so the trial uses the real delivery path.
3. **Start a fresh project** in an empty folder outside the repository: for an integration Skill, the tool's own starter project at the versions the Skill lists (for example `create-vite` with the `react-ts` template), built once to confirm it works before Nativele is added. Install the packed library and the exact tool versions the Skill lists, and install the Skill the way users do: `npx ts-dom skills add <name>`.
4. **Give a fresh agent a task** that the Skill says it covers, written from its "When to use" and "Example": a small but real piece of work that goes through every set-up step and touches every known limitation. The agent may use the Skill, `npx ts-dom` and the public guides in `docs/`, but not the Nativele source, this repository or the Skill's `example/`. It reports the files it wrote, the output of every Verify command, every point where it had to guess or look elsewhere, and every error it hit and how it fixed it.
5. **Check the result independently**, without relying on the agent's report: run the Verify commands again and check the behavior in a real browser or with a test.

The Skill is accepted when:

- every Verify command gives the expected output, and the work does what the task asked;
- the agent followed the Skill's steps as written, and no step was wrong for the stated versions;
- every guess, outside search or unexplained error in the report is already covered by the Skill; a guess about the tool itself (how to configure the framework, the build tool or the test runner beyond what Nativele needs) is not a gap in the Skill.

Otherwise the maintainers send the gaps back to the contributor as review comments (a missing step, a limitation to list, a Troubleshooting row to add), and the trial runs again, with a new agent, on the updated Skill. Each trial is recorded on the PR as a review comment in this form, so a reader can see which agent passed which task, what it ran into, and whether a later change to the Skill needs a new trial:

```yaml
trial:
  skill: nativele-vue
  round: 2                      # 1 for the first trial; a new agent each round
  date: 2026-11-05
  nativele: 0.5.4               # the packed version the agent installed
  tools: vue@3.5.44 vite@8.3.6 vue-tsc@3.3.14 typescript@6.0.3
  agent: Claude Code            # or Codex, Cursor, ...
  model: <model id>
  start: create-vite vue-ts, built once before Nativele was added
  task: |
    An inventory screen: an item component in a keyed list Vue sorts, a two-way bound input,
    Light DOM and shadow slots with Vue-managed children, a store bound under <KeepAlive>.
  verify:                       # the Skill's Verify commands, as the maintainer re-ran them
    "npx ts-dom check src/nv": "ts-dom check: no issues"
    "npm run build": "built"
    browser: 22 checks passed, no console errors or Vue warnings
  gaps: []                      # each guess or error the Skill did not cover; empty to accept
  result: accepted              # or: gaps sent back
```

## Skills

| Skill | Tier | Status | Covers |
|---|---|---|---|
| `nativele-core` | Official | available | building with Nativele itself: the `ts-dom check` loop, components, lists, data flow |
| `nativele-react` | Official | available | Nativele components in React 19: props, events, children and slots, lifecycle, TSX types |
| `nativele-integration` | Official | available | Nativele components in a framework without its own Skill: defining before render, properties and attributes, events, slots, lifecycle, types; verified with Preact |
| `nativele-vite` | Official | available | Nativele in a Vite app: the plugin and `root`, multi-page builds, the build script, hot updates, Vite+ |
| `nativele-vue` | Official | available | Nativele components in Vue 3: `isCustomElement`, props, events, `v-model`, slots, `<KeepAlive>`, template types |
| `nativele-svelte` | Experimental | available | Nativele components in Svelte 5: props, event attributes, slots, `bind:this`, template types |
| `nativele-angular` | Experimental | available | Nativele components in Angular: `CUSTOM_ELEMENTS_SCHEMA`, bindings, zoneless change detection, `ts-dom gen` in the build, content projection |
| `nativele-state-management` | Official | available | where state lives; `createStore`, and Zustand, Redux Toolkit or nanostores through `bind` with a selector adapter |
| `nativele-testing` | Official | available | component tests with Vitest and happy-dom or jsdom, real-browser tests with Vitest browser mode or Playwright |
| `nativele-tanstack-query` | Experimental | available | `@tanstack/query-core` observers through `bind`: loading and error states, keys from props, mutations |
| `nativele-zod` | Experimental | available | form validation with Zod or Valibot: per-field messages, nested and array fields, `aria-invalid` |
| `nativele-tailwind` | Experimental | available | Tailwind CSS v4 in templates: source detection, `shadow: true` with adopted style sheets, `<style scoped>` layers |
| `nativele-architecture` | Official | available | app layout: feature folders, shared components and stores, pages as custom elements mounted by a router (Navigation API or universal-router), lazy pages, one scanned folder, unit/browser/end-to-end split |
| Other libraries | Experimental or Community | open for contributions | |
