---
name: nativele-<tool>
description: "What the Skill lets an agent do, and when to use it (the dependencies or files that call for it)."
metadata:
  tier: experimental
  nativele: ">=0.5.0 <0.6.0"
  verified: "YYYY-MM-DD"
  tools: "<tool>@<exact version> <other tool>@<exact version>"
  author: "<your name or GitHub handle>"
  detects: "<package.json dependency names, space-separated>"
---

# Nativele + <tool>

## When to use

- The situation, and the signals (dependencies, files) that call for this Skill.
- When not to use it.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | x.y.z |
| <tool> | x.y.z |

Verified on YYYY-MM-DD. With a different major version of <tool>, treat every step as unverified.

## Set-up

1. Numbered steps with the exact commands and file contents.

## Example

The complete, minimal working example: every file it needs.

## Known limitations

1. What does not work or needs care, and what to do instead.

## Verify

```sh
npx ts-dom check     # expect: ts-dom check: no issues
npx tsc --noEmit     # expect: no errors
```

What to check in the browser or with a test.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|

## See also

- Links to the guides in https://github.com/Pixmi/nativele/tree/main/docs for the facts used.
