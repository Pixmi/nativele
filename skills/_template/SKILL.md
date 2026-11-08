---
name: nativele-<tool>
description: "What the Skill lets an agent do, and when to use it (the dependencies or files that call for it)."
metadata:
  tier: experimental
  nativele: ">=0.7.0 <0.8.0"
  verified: "YYYY-MM-DD"
  tools: "<tool>@<exact version> <other tool>@<exact version>"
  author: "<your name or GitHub handle>"
  detects: "<package.json dependency names, space-separated>"
---

# Nativele + <tool>

## When to use

- The situation that calls for this Skill.
- Signals: the dependencies and files that show it.
- When not to use it, and which Skill to use instead.

## Versions

| Tool | Verified version |
|---|---|
| @nativele/ts-dom | x.y.z |
| <tool> | x.y.z |

Verified on YYYY-MM-DD, in the browser and the starter the trial used.

With a different major version of <tool>, treat every step as unverified.

## Set-up

Start from a working project of <tool>. Cover only what Nativele adds or changes.

1. One action per step, with the exact command or file contents.
   - A known failure of this step, and its fix, as a bullet under it.
2. The next action.

## Example

One sentence on what the example shows, then every file it needs, each in its own code block, short.

## Known limitations

1. **A short title.** What to do instead, first. Then the fact that makes it necessary.
   - A condition, exception or measured case, one per bullet.
2. Not verified: what was not tried.

## Verify

```sh
npx ts-dom check     # expect: ts-dom check: no issues
npx tsc --noEmit     # expect: no errors
```

What to check in the browser or with a test:

- one observable result per bullet.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| the message or behavior seen | why, in one phrase | the change, in one phrase |

## See also

- What the link covers: a full GitHub URL to the guide in https://github.com/Pixmi/nativele/tree/main/docs that states the fact.
