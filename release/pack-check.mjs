#!/usr/bin/env node
/**
 * Fail if the published package would carry paths it must not, or would be
 * missing files it must.
 *
 * The `files` allowlist decides what ships, and a glob broad enough to be
 * useful can reach somewhere it should not. The shape the first rule guards
 * against: the allowlist entry "**\/*.d.ts" also matched the release toolchain
 * installed at release/node_modules, which put 1330 declaration files and 24 MB
 * into the tarball until "!release/**" was added. That shipped past CI, because
 * nothing in CI looked at the packed file list.
 *
 * The second rule guards the other direction, and it is the same class of
 * mistake: an allowlist that does not mention a file silently drops it. That
 * happened to DISCLOSURE - package:lib copies it into build/, npmpublish.yml
 * stages the npm release on the basis that it sits at the root of the tarball,
 * and the allowlist filtered it out, so the dual-use declaration never shipped.
 *
 * No build is needed: `npm pack --dry-run` reports what the allowlist matches
 * against the working tree, and the files in question are present there.
 *
 * Run with `node release/pack-check.mjs`.
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Path prefixes that must never appear in the published package. */
const FORBIDDEN = [
  [
    'node_modules/',
    'a dependency tree - npm excludes these itself, so one appearing means an allowlist entry reached into one'
  ],
  ['release/', 'the release toolchain, which is not shipped']
]

/** Files the published package must carry, whatever the allowlist says. */
const REQUIRED = [
  [
    'DISCLOSURE',
    'the dual-use declaration, which npm wants at the root of the tarball and npmpublish.yml stages the release on the basis of'
  ],
  ['LICENSE', 'the licence text'],
  ['README.md', 'the readme npm renders on the package page'],
  ['package.json', 'the manifest']
]

const pack = () => {
  try {
    return execFileSync(
      'npm',
      ['pack', '--dry-run', '--ignore-scripts', '--json'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    )
  } catch (error) {
    // npm pack writes the report to stdout even when it exits non-zero.
    return error.stdout ?? ''
  }
}

let report
try {
  report = JSON.parse(pack())
} catch {
  console.error('could not read the pack report for this package')
  process.exit(1)
}

const files = (report[0]?.files ?? []).map((entry) => entry.path)
const offences = []
for (const [prefix, why] of FORBIDDEN) {
  const hits = files.filter(
    (path) => path.startsWith(prefix) || path.includes('/' + prefix)
  )
  if (hits.length) offences.push({ what: prefix, why, hits })
}
for (const [name, why] of REQUIRED) {
  if (!files.includes(name))
    offences.push({ what: name, why, hits: ['not in the packed file list'] })
}

console.log(`packed files: ${files.length}`)
if (!offences.length) {
  console.log(
    'no path outside the allowlist intent, and no required file missing'
  )
  process.exit(0)
}

console.error('\nthe package is not what it must be:')
for (const offence of offences) {
  console.error(`  ${offence.what} - ${offence.why}`)
  for (const hit of offence.hits.slice(0, 5)) console.error(`      ${hit}`)
}
console.error(
  '\nNarrow the `files` allowlist (or add an exclusion such as "!release/**"), and' +
    '\nname any required file in it - the allowlist only ships what it lists.'
)
process.exit(1)
