#!/usr/bin/env node
/**
 * Fail if the published package would carry paths it must not.
 *
 * The `files` allowlist decides what ships, and a glob broad enough to be
 * useful can reach somewhere it should not. The shape this guards against: the
 * allowlist entry "**\/*.d.ts" also matched the release toolchain installed at
 * release/node_modules, which put 1330 declaration files and 24 MB into the
 * tarball until "!release/**" was added. That shipped past CI, because nothing
 * in CI looked at the packed file list.
 *
 * No build is needed: `npm pack --dry-run` reports what the allowlist matches
 * against the working tree, and the offending paths are present there.
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

const pack = () => {
  try {
    return execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
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
  const hits = files.filter((path) => path.startsWith(prefix) || path.includes('/' + prefix))
  if (hits.length) offences.push({ prefix, why, hits })
}

console.log(`packed files: ${files.length}`)
if (!offences.length) {
  console.log('no path in the package outside the allowlist intent')
  process.exit(0)
}

console.error('\nthe package would carry paths it must not:')
for (const offence of offences) {
  console.error(`  ${offence.prefix}  (${offence.hits.length} files) - ${offence.why}`)
  for (const hit of offence.hits.slice(0, 5)) console.error(`      ${hit}`)
}
console.error(
  '\nNarrow the `files` allowlist, or add an exclusion such as "!release/**".'
)
process.exit(1)
