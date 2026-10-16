#!/usr/bin/env node
/**
 * A strict audit of the RELEASE TOOLCHAIN in release/.
 *
 * Kept separate from the package's own `npm audit` on purpose. The toolchain is
 * not shipped, so its advisories should not gate the package - but it runs in CI
 * with publish credentials, so it must not be invisible either. This reports it
 * in its own scope, by name.
 *
 * Anything not listed in EXEMPT fails the build, and so does an exemption that
 * stops appearing: the list is a claim about the locked tree, and a claim that
 * no longer holds is deleted rather than left to rot. Both are failures because
 * a stale entry is invisible in a passing build, and a list that only warns
 * drifts out of step with the tree it describes.
 *
 * The list is short because the locked npm is current: npm 11.21.1 vendors
 * fixed brace-expansion, http-cache-semantics, ip-address,
 * postcss-selector-parser and undici, so the advisories against those do not
 * appear. A lockfile that pinned npm back would bring them back, and they would
 * fail this gate until they are listed again.
 *
 * Every exemption carries its own argument - where the affected code sits,
 * whether this repo's release path runs it, and whose input reaches it. An
 * advisory whose input arrives from outside this repo is a risk acceptance
 * rather than a non-issue, and its entry says so rather than claiming
 * unreachability.
 *
 * Uses --package-lock-only, so it needs no install and runs cheaply on a PR.
 *
 * The same script ships in adapter, cli, sas-language, utils and
 * vscode-extension. EXEMPT describes the tree it sits in, so each repo carries
 * its own list: a lockfile bump that clears an entry in one has to land in the
 * others before theirs can shrink.
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
    "braces 3.0.3, reached via semantic-release -> micromatch. Affected through 3.0.3, which is the latest release, so no bump clears it. NOT REACHABLE HERE: the stack exhaustion needs a deeply nested brace PATTERN, and the patterns the release flow matches against come from this repo's own release config (branch globs and releaseRules), not from the commits being matched."
  ]
])

const run = () => {
  try {
    return execFileSync(
      'npm',
      ['audit', '--package-lock-only', '--json', '--prefix', releaseDir],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    )
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
    `  ${mark} ${entry.severity.padEnd(8)} ${entry.id}  ${[
      ...entry.packages
    ].join(', ')}`
  )
  console.log(`         ${entry.title}`)
}

// An exemption that is no longer needed should be deleted, not left to rot.
// Aggregated with the failing gate, so an unexempted advisory is never masked
// by a stale-exemption report (or vice versa).
const stale = [...EXEMPT.keys()].filter((id) => !found.has(id))

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
}

if (stale.length) {
  console.error(
    '\nexempt advisories that no longer appear, so the exemption can go:'
  )
  for (const id of stale) console.error(`  ${id}  ${EXEMPT.get(id)}`)
}

if (failing.length || stale.length) process.exit(1)

console.log(
  `\nno advisory in the release toolchain outside the documented exemptions` +
    (exempt.length ? ` (${exempt.length} exempt)` : '')
)
