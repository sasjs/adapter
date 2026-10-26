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
 * fixed brace-expansion, http-cache-semantics, postcss-selector-parser and
 * undici, so the advisories against those do not appear. A lockfile that pinned
 * npm back would bring them back, and they would fail this gate until they are
 * listed again. The ip-address advisory published after that npm release does
 * appear - npm vendors the affected version - and is exempted below.
 *
 * Removed 2026-10-26: GHSA-vfj7-8cjw-p6xm (braces). The advisory was withdrawn
 * upstream on 2026-10-23 (`withdrawn_at`), so `npm audit` no longer reports it
 * against the resolved 3.0.3 and keeping the entry would fail this gate's stale
 * rule. Nothing was hidden by a bump - the lockfile still resolves braces 3.0.3,
 * which is the newest published version.
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
    'GHSA-rxp7-6hxx-x8q5',
    'ip-address 10.7.2, bundled inside npm 11.21.1, which @semantic-release/npm resolves from its npm ^11.6.2 range. 11.21.1 is the newest 11.x, and the version npm bundles cannot be overridden from here - adding `overrides` for ip-address to release/package.json leaves the lockfile at 10.7.2, which was measured. RISK ACCEPTANCE, not unreachability: the parse runs only on a proxy address that carries an Address6 zone identifier; the exposure is a stall during publish, and that string can arrive from standard npm proxy configuration (`npm_config_proxy`, `HTTPS_PROXY`), so the input path is reachable and the accepted risk is a publish-time stall rather than a package-supplied one. No bump in this repo moves it: forcing npm 12.2.1 inside the toolchain was measured too, and its own bundled tree still vendors ip-address 10.7.2. It clears only when npm ships ip-address >= 10.7.4 in its own bundled tree; the advisory then disappears and this entry fails the gate until it is deleted.'
  ],
  [
    'GHSA-4qv8-2p9j-2685',
    "undici 6.29.0, bundled inside npm 11.21.1 and reached through @semantic-release/npm. The advisory range is >=6.5.0 <6.29.1, and the copies this repo resolves are outside it - node_modules/undici 7.30.1 and the 6.29.1 under @actions/http-client - so what fails here is npm's own vendored copy, which no `overrides` entry can reach (measured for ip-address above; forcing npm 12 inside the toolchain does not move it either). RISK ACCEPTANCE: the parser runs inside npm's own network operations during the publish step, on responses from the registry over TLS, so the input path is reachable and the exposure is a publish-time stall. It clears when npm ships undici >= 6.29.1 in its bundle, and this entry then fails the gate until it is deleted."
  ],
  [
    'GHSA-xjj6-f33q-929c',
    'Same undici 6.29.0 bundled inside npm 11.21.1 (range >=6.23.0 <6.29.1), same reasoning as GHSA-4qv8-2p9j-2685: the copies this repo resolves are 7.30.1 and 6.29.1, both outside the affected range, and the vendored one cannot be overridden. RISK ACCEPTANCE, exposure is a publish-time stall.'
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
