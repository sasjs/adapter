# deepmerge (vendored)

deepmerge 4.3.1, MIT, with one change: `__proto__`, `constructor` and `prototype` are never copied or merged.

## Why

`GHSA-gcqx-w48m-w2h4` / `CVE-2026-93753` reports prototype poisoning in `mergeObject()`. 4.3.1 is the newest published release, upstream master still carries the same code, and the advisory has no fixed version - so an `overrides` entry cannot point at a release that fixes it, and leaving it alone leaves a known advisory in the tree.

The adapter uses deepmerge only through `jest-config`, which calls it as `deepmerge(defaults, options)` and `deepmerge.all([defaults, overrides])`, so the surface this fork has to keep is small and the repo's own test suite exercises it on every run.

## What the guard does

4.3.1 skips a key only when it is already reachable on the target object, which misses the case the advisory describes: a target with no such key anywhere up its chain - `Object.create(null)`, or the fresh `{}` that `mergeObject` writes into - where the assignment lands on the prototype setter. Its copy loop for the target's own keys had no guard at all.

Both loops now refuse the three keys by name, wherever they come from. Nothing else differs from 4.3.1.

## How it is wired in

`package.json` declares it as `"deepmerge": "file:./vendor/deepmerge"` and points the override at that same declaration with `"deepmerge": "$deepmerge"`, so every copy in the tree - including the one nested under `jest-config` - resolves here. `deepmerge.spec.js` beside this file tests both the merge semantics the fork has to preserve and the poison payloads it has to refuse.

### The `file:` spec needs the working tree

npm resolves `file:` against the directory it installs from, so an install that has only `package.json` and `package-lock.json` in place fails to resolve this dependency - a Dockerfile that copies the manifest first, or a tool that rebuilds from the manifest alone. Nothing here does that: every workflow runs `actions/checkout` of the whole repository before `npm ci`, and the repo has no container build. Anything added later that installs before copying the source has to copy `vendor/` in the same step.

## Bumping

When upstream publishes a fixed release, delete this directory, restore the registry spec in `devDependencies`, and drop the `deepmerge` entry from `overrides`.
