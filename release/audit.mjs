#!/usr/bin/env node
/**
 * A strict audit of the RELEASE TOOLCHAIN in release/.
 *
 * Kept separate from the package's own `npm audit` on purpose. The toolchain is
 * not shipped, so its advisories should not gate the package - but it runs in CI
 * with publish credentials, so it must not be invisible either. This reports it
 * in its own scope, by name.
 *
 * Every advisory below is unfixable from this repo: the ranges cover the newest
 * published version, so no bump clears them. They are also unreachable in this
 * usage - the braces denial of service needs an attacker-controlled brace
 * PATTERN, and the patterns come from this repo's own release config (branch
 * globs and releaseRules), not from the commits being matched. So they are named
 * here, and anything else fails the build.
 *
 * Uses --package-lock-only, so it needs no install and runs cheaply on a PR.
 *
 * Kept byte-identical in adapter, cli, sas-language, utils and vscode-extension,
 * so a fix here belongs in all five. It is formatted with sas-language's
 * prettier config (printWidth 100), the only one of the five that checks it.
 *
 * Run with `node release/audit.mjs`.
 */
import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const releaseDir = dirname(fileURLToPath(import.meta.url))

/**
 * Advisories in the release toolchain that cannot be fixed from this repo, and why.
 */
const EXEMPT = new Map([
  [
    'GHSA-vfj7-8cjw-p6xm',
    'braces, reached via semantic-release -> micromatch. Affected through 3.0.3, which is the latest release.'
  ],
  [
    'GHSA-ch52-4w7c-c8xp',
    'http-cache-semantics, inside the npm package that @semantic-release/npm bundles. Affected through 4.2.0.'
  ],
  [
    'GHSA-q2hr-2g5m-vwhr',
    'brace-expansion, inside the npm package that @semantic-release/npm bundles.'
  ],
  [
    'GHSA-qhr7-859c-m2p7',
    'brace-expansion, inside the npm package that @semantic-release/npm bundles.'
  ],
  [
    'GHSA-6j4f-fj2g-mc7p',
    'brace-expansion, inside the npm package that @semantic-release/npm bundles.'
  ],
  ['GHSA-rpw4-54j3-4h4q', 'ip-address, inside the npm package that @semantic-release/npm bundles.'],
  ['GHSA-2vr4-cq9g-pvrc', 'ip-address, inside the npm package that @semantic-release/npm bundles.'],
  ['GHSA-j6r3-76f7-8jcv', 'ip-address, inside the npm package that @semantic-release/npm bundles.'],
  ['GHSA-h3mg-xc3c-68pw', 'ip-address, inside the npm package that @semantic-release/npm bundles.'],
  ['GHSA-3wwx-pv8p-q78v', 'undici, inside the npm package that @semantic-release/npm bundles.'],
  ['GHSA-r53p-7pc4-xj5r', 'undici, inside the npm package that @semantic-release/npm bundles.'],
  ['GHSA-rfgv-xxqx-mfg5', 'undici, inside the npm package that @semantic-release/npm bundles.']
])

const run = () => {
  try {
    return execFileSync('npm', ['audit', '--package-lock-only', '--json', '--prefix', releaseDir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
  } catch (error) {
    // npm audit exits non-zero when it finds anything, which is the case we are
    // here to read, so the report on stdout is the payload either way.
    if (error.stdout) return error.stdout
    throw error
  }
}

let report
try {
  report = JSON.parse(run())
} catch {
  console.error('could not read the npm audit report for release/')
  process.exit(1)
}

const ghsaOf = (via) => {
  if (typeof via === 'string') return undefined
  const match = /GHSA-[a-z0-9-]+/i.exec(via?.url ?? '')
  return match ? match[0] : undefined
}

const found = new Map()
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via ?? []) {
    const id = ghsaOf(via)
    if (!id) continue
    if (!found.has(id)) {
      found.set(id, {
        id,
        title: via.title ?? '',
        severity: via.severity ?? vulnerability.severity,
        packages: new Set()
      })
    }
    found.get(id).packages.add(vulnerability.name)
  }
}

const exempt = [...found.keys()].filter((id) => EXEMPT.has(id))
const failing = [...found.values()].filter((entry) => !EXEMPT.has(entry.id))

console.log(`release toolchain: ${found.size} advisory(s)`)
for (const entry of found.values()) {
  const mark = EXEMPT.has(entry.id) ? 'exempt' : 'FAIL  '
  console.log(
    `  ${mark} ${entry.severity.padEnd(8)} ${entry.id}  ${[...entry.packages].join(', ')}`
  )
  console.log(`         ${entry.title}`)
}

// An exemption that is no longer needed should be deleted, not left to rot.
const stale = [...EXEMPT.keys()].filter((id) => !found.has(id))
if (stale.length) {
  console.log('\nexempt advisories that no longer appear, so the exemption can go:')
  for (const id of stale) console.log(`  ${id}  ${EXEMPT.get(id)}`)
}

if (failing.length) {
  console.error(
    `\n${failing.length} advisory(s) in the release toolchain outside the documented exemptions:`
  )
  for (const entry of failing) {
    console.error(`  ${entry.severity} ${entry.id}  ${entry.title}`)
  }
  console.error(
    '\nThe toolchain is not shipped, but it runs with publish credentials. Fix it,\n' +
      'or add it to EXEMPT in release/audit.mjs with the reason it cannot be fixed.'
  )
  process.exit(1)
}

console.log(
  `\nno advisory in the release toolchain outside the documented exemptions` +
    (exempt.length ? ` (${exempt.length} exempt)` : '')
)
