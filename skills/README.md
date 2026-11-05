# Nativele Skills

Skills extend what Nativele can be used with, without growing the library: each one is a task procedure for a coding agent, verified with exact versions. This page is the specification every Skill follows and the guide for contributing one.

## What a Skill is

A Skill is a task procedure for a coding agent: how to do one integration or one kind of work with Nativele, step by step, with a complete example, the known limitations, and commands that prove it worked. It is not reference documentation: facts about the library's API live in `docs/`, and a Skill links to them instead of restating them.

A Skill never changes the library's runtime and never adds a dependency to the library's core. Third-party packages a Skill uses are dependencies of the user's project, installed by the Skill's own steps.

## Layout

```
skills/
├── README.md                     # this specification and the contribution guide
├── nativele-core/
│   └── SKILL.md
├── nativele-react/
│   ├── SKILL.md
│   └── example/                  # Official only: the project the Skill is verified with
│       ├── package.json          # exact versions of every tool the Skill names
│       ├── ...                   # the minimal app the SKILL.md example comes from
│       └── verify.mjs            # the browser checks `npm run verify` ends with
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
  nativele: ">=0.5.0 <0.6.0"     # the library versions the Skill was verified with
  verified: "2026-11-05"         # date of the last verification
  tools: "react@19.3.1 react-dom@19.3.1 vite@8.3.5 @vitejs/plugin-react@6.2.1 typescript@7.0.2"
  author: "Nativele maintainers" # for community Skills: the contributor
  detects: "react"               # package.json dependencies that make ts-dom doctor recommend this Skill
---
```

Quote the `description` and any value that contains `: `, so the frontmatter stays valid YAML for every agent that loads it.

Required sections, in this order:

1. **When to use**: the situation and the signals (dependencies, files) that call for this Skill, and when not to use it.
2. **Versions**: a table of every tool and the exact version it was verified with, and the date. If the project uses a different major version of a tool, the Skill says so and stops treating its steps as verified.
3. **Set-up**: numbered steps with the exact commands and file contents.
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
| Official | the Nativele maintainers | accepted through an agent trial, and an `example/` project that `npm run verify` checks in CI; verified within the last 6 months | as official |
| Community | its author | the full SKILL.md format, `author` and `verified` filled in, accepted through a maintainer's agent trial | as community, with the author |
| Experimental | its author | the SKILL.md format; verification not complete | as experimental, with a warning |

- A new contribution starts as Experimental. It becomes Community when it passes a maintainer's agent trial (see "How a Skill pull request is accepted"), and Official when the maintainers adopt it with an `example/` project in CI.
- A Skill whose `verified` date is older than 6 months, or whose `nativele` range does not include the installed version, is shown as stale. A stale Official Skill whose CI check fails is moved to Experimental until fixed.

## Delivering Skills to projects

The library already lives in the user's `node_modules`, so its Skills travel with it:

- `ts-dom skills` lists the Skills shipped with the installed version: name, tier, description, verified date and versions, whether it is stale, and its path inside `node_modules`. `--json` prints the same as data for agents.
- `ts-dom skills <name>` prints that Skill (so an agent can read it without knowing the path).
- `ts-dom skills add <name...>` copies Skills into the project: into `.claude/skills/<name>/` when the project has a `.claude` folder, otherwise into `.agents/skills/<name>/` (`--to=<dir>` for another folder), where agents that load skills pick them up. It only copies; it never installs the third-party packages a Skill mentions.
- `ts-dom doctor` reads the project's `package.json` and, for each Skill whose `detects` dependency is present and that the project has no copy of, reports it as an `info` issue (`skill-available`); a copy that differs from the shipped one is reported as `skill-outdated`, for example: `package.json:1:1 info [skill-available] react is a dependency: the nativele-react Skill covers using Nativele components in React. Fix: run ts-dom skills add nativele-react, or read it with ts-dom skills nativele-react.` Info issues never change the exit code.

None of this adds a runtime dependency: listing and copying read the Markdown files with Node's file API, and the frontmatter is parsed with a small reader for the fields above.

## Verification of Official Skills

- `skills/<name>/example/package.json` pins every tool version the Skill names, depends on the library through `file:../../..` (the library in the same repository), and has `npm run verify`, which runs `ts-dom check`, `ts-dom doctor`, `tsc`, the build, and a short real-browser test of what the Skill promises.
- `nativele-core` has no example of its own: the library's CI, which checks every example in the repository, verifies it.
- The workflow `.github/workflows/skills.yml` runs `npm run verify` for each Official Skill when anything under that Skill changes, when the library's runtime changes, and once a month, so a third-party release that breaks a Skill is found. It is not a required check for `main`.
- The monthly run opens nothing by itself; a failure is reported in the workflow run, and the Skill is fixed or moved to Experimental.

## Contributing a Skill

- Copy `skills/_template/SKILL.md`, fill in every section, set `tier: experimental`.
- Run the Skill's verification commands in a fresh project with the versions you list, and paste their output in the PR description.
- The PR touches only `skills/<name>/`; a PR that changes the library and adds a Skill is split. Community and Experimental Skills live in this repository, in the same `skills/` folder, so they ship with the package and `ts-dom skills` lists them with their tier.

## How a Skill pull request is accepted

A Skill is written for agents, so the maintainers accept it by having an agent use it: a fresh agent that knows nothing about the Skill does real work with nothing but the Skill, and the result is checked. Reading the Skill or rerunning its verification commands is not enough, because neither shows what the Skill leaves out.

1. **Check the format**: the frontmatter is complete, every required section is there, the facts link to `docs/` instead of restating them, and nothing would add a dependency to the library's core.
2. **Build the package from the PR branch** (`npm run build:lib && npm pack`), so the trial uses the real delivery path.
3. **Start a fresh project** in an empty folder outside the repository, install the packed library and the exact tool versions the Skill lists, and install the Skill the way users do: `npx ts-dom skills add <name>`.
4. **Give a fresh agent a task** that the Skill says it covers, written from its "When to use" and "Example": a small but real piece of work that goes through every set-up step and touches every known limitation. The agent may use the Skill, `npx ts-dom` and the public guides in `docs/`, but not the Nativele source, this repository or the Skill's `example/`. It reports the files it wrote, the output of every Verify command, every point where it had to guess or look elsewhere, and every error it hit and how it fixed it.
5. **Check the result independently**, without relying on the agent's report: run the Verify commands again and check the behavior in a real browser or with a test.

The Skill is accepted when:

- every Verify command gives the expected output, and the work does what the task asked;
- the agent followed the Skill's steps as written, and no step was wrong for the stated versions;
- every guess, outside search or unexplained error in the report is already covered by the Skill.

Otherwise the maintainers send the gaps back to the contributor as review comments (a missing step, a limitation to list, a Troubleshooting row to add), and the trial runs again, with a new agent, on the updated Skill. The record of the passing trial (agent and model, date, versions, Verify output) is added to the PR as a review comment.

## Skills

| Skill | Tier | Status | Covers |
|---|---|---|---|
| `nativele-core` | Official | available | building with Nativele itself: the `ts-dom check` loop, components, lists, data flow |
| `nativele-react` | Official | available | Nativele components in React 19: props, events, children and slots, lifecycle, TSX types |
| `nativele-integration` | Official | planned | what every framework integration shares: properties and attributes, events, slots, lifecycle, types |
| `nativele-vite` | Official | planned | the Vite plugin, `root`, hot updates |
| `nativele-vue` | Official | planned | Nativele components in Vue |
| `nativele-state-management` | Official | planned | `createStore`, and Zustand or Redux through `bind` |
| `nativele-testing` | Official | planned | Vitest and Playwright |
| Svelte, Angular, Tailwind CSS, TanStack Query, Zod | Experimental or Community | open for contributions | |
