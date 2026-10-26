#!/usr/bin/env node
/**
 * Fail if a published @sasjs dependency is specified in a way that nests a
 * second copy in a consumer.
 *
 * An exact pin on a shared package is not a private decision: npm honours it
 * inside every consumer, so a tree that resolves a different version gets a
 * second copy nested under this package. Two instances of a module that holds
 * shared state - or that a caller checks with `instanceof` - is the failure this
 * prevents, and it is invisible from here because nothing in this repo nests.
 *
 * It happened: adapter pinned @sasjs/utils at exactly 4.0.1, and a single
 * vscode-extension install carried
 *
 *   node_modules/@sasjs/utils                              4.1.0
 *   node_modules/@sasjs/adapter/node_modules/@sasjs/utils  4.0.1
 *
 * while lint carried the same defect until 4.3.3. Both were fixed by taking a
 * range; this check is what stops the next `npm install --save-exact` from
 * putting one back, because .npmrc sets save-exact=true and every new dependency
 * is pinned by default.
 *
 * WHAT COUNTS AS HOISTING
 *
 * The guarantee a specifier buys depends on the major, and this names the two
 * shapes that hold:
 *
 *   "^4.0.1"           at 1.0 and above a caret permits minor drift, so a
 *                      consumer on any newer minor hoists one copy.
 *   ">=0.3.3 <1.0.0"   below 1.0 a caret permits patch drift only, so it does
 *                      not hoist across a minor - a range up to the next major
 *                      does.
 *
 * Everything else nests for someone: an exact version, a tilde, a dist-tag, `*`,
 * `^*`, and a caret below 1.0.
 *
 * WHERE IT LOOKS
 *
 * The blocks a consumer resolves when installing this package - dependencies,
 * peerDependencies, optionalDependencies, and hand-written overrides/resolutions,
 * which a consumer honours just as much and which nothing else lints. A
 * devDependency is not installed by a consumer and cannot nest in their tree, so
 * it is out of scope, and exact is what .npmrc wants there.
 *
 * Third-party dependencies stay exactly pinned - that is the policy, and it is
 * what .npmrc does. This check enforces the @sasjs exception, and it reads the
 * manifest rather than the lockfile: the lockfile is where the resolution
 * belongs, and it is allowed to record an exact version.
 *
 * Run with `node release/dep-range-check.mjs`, or point it at a fixture with
 * `--manifest <path>` (what release/dep-range-check.spec.ts does).
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

// The packages this rule treats as shared. A prefix rather than a list, because
// every internal package in the estate is scoped: if an unscoped shared package
// ever ships, its name goes here and the rule covers it without another edit.
const SHARED_PREFIXES = ['@sasjs/']

const SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies']

// Hand-written resolutions a consumer still honours. `resolutions` is yarn's
// spelling; both are checked because both end up in a published manifest.
const OVERRIDE_SECTIONS = ['overrides', 'resolutions']

const HOISTING_CARET = /^\^[1-9]\d*\.\d+\.\d+([-+][0-9A-Za-z.+-]+)?$/

// ">=4.0.1 <5.0.0" carries the same guarantee as "^4.0.1", and ">=0.3.3 <1.0.0"
// is the only shape that hoists below 1.0 - so a span counts when its upper bound
// is the next major, and not otherwise.
const SPAN = /^>=\s*(\d+)\.\d+\.\d+([-+][0-9A-Za-z.+-]+)?\s+<(\d+)(\.0\.0)?$/
const hoistsInSpan = (specifier) => {
  const match = SPAN.exec(specifier)
  return Boolean(match) && Number(match[3]) === Number(match[1]) + 1
}
const ZERO_MAJOR_SPECIFIER = /^[\^~=]?0\.\d+\.\d+([-+][0-9A-Za-z.+-]+)?$/

const isShared = (name) =>
  SHARED_PREFIXES.some((prefix) => name.startsWith(prefix))

const manifestFlag = process.argv.indexOf('--manifest')
let manifestPath = join(repoRoot, 'package.json')

if (manifestFlag !== -1) {
  const value = process.argv[manifestFlag + 1]
  if (!value || value.startsWith('--')) {
    console.error('Usage: node release/dep-range-check.mjs [--manifest <path>]')
    process.exit(1)
  }
  manifestPath = resolve(value)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const offenders = []
const zeroMajor = []

const classify = (section, name, specifier) => {
  if (HOISTING_CARET.test(specifier)) return
  if (hoistsInSpan(specifier)) return
  if (ZERO_MAJOR_SPECIFIER.test(specifier)) {
    zeroMajor.push({ section, name, specifier })
    return
  }
  offenders.push({ section, name, specifier })
}

for (const section of SECTIONS) {
  for (const [name, specifier] of Object.entries(manifest[section] || {})) {
    if (!isShared(name)) continue
    classify(section, name, specifier)
  }
}

/**
 * An override can name the version directly, as `{ ".": "x.y.z" }`, or scoped
 * under a parent package - and the parent may be a shared package pinning a
 * third-party dependency, which is none of this check's business. Returns whether
 * the subtree carried any string specifier at all: a map with a version inside it
 * is readable whatever package it names, and only a subtree with no specifier is
 * a shape this cannot interpret.
 */
const scanOverrides = (section, node) => {
  if (Array.isArray(node))
    return node.some((child) => scanOverrides(section, child))
  if (!node || typeof node !== 'object') return false

  let sawString = false

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      sawString = true
      if (isShared(key)) classify(section, key, value)
      continue
    }

    if (!value || typeof value !== 'object') continue

    if (isShared(key) && typeof value['.'] === 'string') {
      // `{ ".": "x", "@sasjs/utils": "y" }` honours both keys, so the dot is
      // classified and the rest of the object still walked
      sawString = true
      classify(section, key, value['.'])
    }

    const innerHasSpecifier = scanOverrides(section, value)
    sawString = sawString || innerHasSpecifier

    if (isShared(key) && !innerHasSpecifier)
      offenders.push({
        section,
        name: key,
        specifier: JSON.stringify(value),
        unreadable: true
      })
  }

  return sawString
}

for (const section of OVERRIDE_SECTIONS) {
  if (manifest[section]) scanOverrides(section, manifest[section])
}

if (offenders.length || zeroMajor.length) {
  if (offenders.length) {
    console.error(
      '@sasjs dependencies must be specified so a consumer holding a newer release hoists one copy:'
    )
    for (const { section, name, specifier, unreadable } of offenders) {
      console.error(`  ${section}: "${name}": "${specifier}"`)
      if (unreadable)
        console.error(
          '    this override shape is not readable here - write it as a string or as { ".": "version" }'
        )
    }
  }
  if (zeroMajor.length) {
    console.error(
      '\nSpecifiers below 1.0 pin the minor - a caret permits patch drift only and an exact pin permits nothing - so a consumer holding the next minor still nests a second copy:'
    )
    for (const { section, name, specifier } of zeroMajor) {
      console.error(`  ${section}: "${name}": "${specifier}"`)
    }
    console.error(
      'Write ">=x.y.z <1.0.0", which hoists across the minors below 1.0 - no caret and no exact pin can do that before 1.0.'
    )
  }
  if (offenders.length) {
    console.error(
      '\nWrite "^x.y.z" from the version you tested with (or ">=x.y.z <1.0.0" below 1.0) and let the lockfile record the exact resolution. Third-party dependencies stay exactly pinned.'
    )
  }
  process.exit(1)
}

console.log('Every @sasjs dependency is specified so it hoists across a minor.')
