You are working in a fresh project in the current directory. Do the task below, using the installed Skill as your guide.

# Task

{{task}}

# Sources

You may use:

- the Skill installed in this project: {{skills}};
- the `ts-dom` command line (`npx ts-dom`), including `npx ts-dom skills` and `npx ts-dom skills <name>` to read the other Skills shipped with the package;
- the guides under `node_modules/@nativele/ts-dom/docs/`;
- the public documentation of the other tools this project uses.

You must not use the Nativele source code or its repository, locally or on GitHub, and must not read `node_modules/@nativele/ts-dom/dist/`. If the Skill and the guides leave something open, decide, and say so in your report; do not look for the answer in the library's code.

# Report

When you are done, write `.trial/out/report.json` with this shape:

```json
{
  "files": ["every file you created or changed"],
  "verify": [{ "command": "each Verify command of the Skill, as you ran it", "output": "its output" }],
  "guesses": [{ "where": "the Skill step or section", "what": "what you had to decide or look up", "source": "guess | tool docs | other" }],
  "errors": [{ "error": "each error you hit, as printed", "fix": "what fixed it" }],
  "sources": ["every file or URL you read for the task"]
}
```

List every point where the Skill did not tell you what to do, even small ones, and every error, even ones you fixed at once. An empty list means there were none.
