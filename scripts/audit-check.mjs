#!/usr/bin/env node
/**
 * Fail on an npm advisory, except the dev-tree ones named below with a reason.
 *
 * WHAT THIS REPLACES
 *
 * The gate used to be `npm audit --audit-level=low`, which fails the build on ANY
 * advisory in the tree. That is the right bar and it stays the bar for everything
 * that ships - but it also fails on a dev dependency the registry has no fixed
 * version of, which stops every pull request in this repository for a reason no
 * branch can act on. `GHSA-fc5q-39xc-vjpf` is that advisory: its range is
 * `<= 4.0.7`, 4.0.7 was the newest version published on 2026-11-18, and there is
 * no `@socketregistry/picomatch` to override to - so `npm audit fix` offers only a
 * downgrade of ts-loader, and there is nothing to take.
 *
 * WHAT IS STRICT
 *
 * A production dependency is never exemptible. `npm audit --omit=dev` is run on
 * its own and any advisory there fails, whatever the list below says: the tree
 * that ships is not a risk to accept, it is a version to change.
 *
 * WHAT IS NOT
 *
 * A dev-tree advisory fails unless its id is listed in EXEMPT with an argument:
 * where the affected package sits, what input reaches the affected code, and what
 * clears it. The list is a claim about the locked tree, so an entry that stops
 * appearing FAILS this check rather than rotting - a stale exemption is invisible
 * in a passing build, which is how an exemption outlives the problem it describes.
 *
 * AN ADVISORY THIS SCRIPT CANNOT NAME IS A FAILURE
 *
 * An exemption is a claim about a specific advisory, so an advisory with no GHSA
 * id cannot be exempted and is reported as a failure rather than dropped: npm
 * raises advisories of its own that carry a `source` and no `url`, and silently
 * skipping them would turn "I cannot name this" into "there is nothing to fix".
 *
 * A BROKEN AUDIT IS A FAILURE
 *
 * `npm audit --json` writes its own errors to STDOUT and exits non-zero, so a
 * missing lockfile or an unreachable registry parses as JSON with no
 * `vulnerabilities` key. That is not a clean tree and it must not become a pass
 * once EXEMPT empties out.
 *
 * Run with `node scripts/audit-check.mjs`, or point it at recorded output with
 * `--audit <full.json> --prod <prod.json>` (the spec does this).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * Dev-tree advisories this repository cannot clear, each with its argument and the
 * packages the argument covers.
 *
 * Keyed by advisory id, and `packages` names every package npm reports the id
 * against - an id exempted for `picomatch` says nothing about the same id arriving
 * under `micromatch`, so the package has to match too. A package that starts
 * reporting the id fails the gate until the argument is extended to it, which is
 * the point: the exemption is a statement about a set of packages, not a waiver for
 * an id. The `reason` is what a reader needs to judge the claim: where the package
 * sits, what input reaches the affected code, and the condition that clears it.
 */
export const EXEMPT = new Map([
  [
    'GHSA-fc5q-39xc-vjpf',
    {
      packages: ['picomatch'],
      reason:
        "picomatch, reached only from the dev toolchain (ts-loader and the webpack chain, and jest through micromatch). No production dependency resolves picomatch - `npm audit --omit=dev` is clean - and no version this repository can resolve is outside the advisory range: 4.0.7 was the newest published on 2026-11-18, and an `overrides` entry would pin a vulnerable copy. RISK ACCEPTANCE: the ReDoS input is a glob pattern, and the patterns this tree matches are the repository's own build and test configuration - written and reviewed by a contributor - not data a package supplies at runtime. It clears when picomatch publishes above the range; this entry then fails the stale rule until it is deleted."
    }
  ]
])

/**
 * Every advisory in one `npm audit --json` report, keyed by advisory and package.
 *
 * A single advisory reaches several packages, and a reader has to fix each path,
 * so the key carries both. `id` is the GHSA identifier when npm supplied one and
 * `undefined` otherwise - the caller decides what an unnamed advisory means, which
 * is never "nothing".
 */
export const advisoriesOf = (audit) => {
  const found = new Map()

  for (const [packageName, vulnerability] of Object.entries(
    audit?.vulnerabilities ?? {}
  )) {
    for (const via of vulnerability?.via ?? []) {
      if (typeof via !== 'object' || via === null) continue

      const id = /GHSA-[a-z0-9-]+/i.exec(via.url ?? '')?.[0]

      // keyed by advisory AND package: one advisory reaches several packages and
      // a reader has to fix each path, so each is reported
      const key = id
        ? `${id}|${packageName}`
        : `source:${via.source ?? 'unknown'}:${via.name ?? packageName}:${packageName}`

      if (!found.has(key))
        found.set(key, {
          id,
          key,
          severity: via.severity,
          title: via.title,
          package: packageName
        })
    }
  }

  return found
}

/**
 * What is wrong with a pair of audit results, in the order a reader needs it:
 * what ships first, then what is unargued, then what is no longer true.
 */
export const evaluate = ({ full, prod, exempt = EXEMPT }) => {
  const failures = []
  const shipped = advisoriesOf(prod)
  const all = advisoriesOf(full)

  for (const advisory of shipped.values())
    failures.push(
      advisory.id
        ? `${advisory.severity} ${advisory.id} in a PRODUCTION dependency (${advisory.package}): ${advisory.title}. A shipping dependency is a version to change, not a risk to accept, so this cannot be exempted.`
        : `${advisory.severity} advisory in a PRODUCTION dependency (${advisory.package}) with no GHSA id: ${advisory.title}. It cannot be exempted by name, so it has to be fixed.`
    )

  for (const advisory of all.values()) {
    if (shipped.has(advisory.key)) continue

    if (!advisory.id) {
      failures.push(
        `${advisory.severity} advisory in the dev tree (${advisory.package}) with no GHSA id: ${advisory.title}. It cannot be exempted by name, so it has to be fixed.`
      )

      continue
    }

    const entry = exempt.get(advisory.id)

    if (!entry) {
      failures.push(
        `${advisory.severity} ${advisory.id} in the dev tree (${advisory.package}): ${advisory.title}. Fix it, or add it to EXEMPT in scripts/audit-check.mjs with the reason it cannot be fixed.`
      )

      continue
    }

    if (!entry.packages.includes(advisory.package))
      failures.push(
        `${advisory.severity} ${advisory.id} in the dev tree (${advisory.package}): ${advisory.title}. The exemption covers ${entry.packages.join(', ')}, not ${advisory.package} - extend the entry with the argument for this package, or fix it.`
      )
  }

  const reportedIds = new Set(
    [...all.values(), ...shipped.values()]
      .map((advisory) => advisory.id)
      .filter(Boolean)
  )

  for (const [id, entry] of exempt) {
    if (!reportedIds.has(id)) {
      failures.push(
        `${id} is exempt but no longer reported, so the exemption can go: ${entry.reason}`
      )

      continue
    }

    const reportedPackages = new Set(
      [...all.values(), ...shipped.values()]
        .filter((advisory) => advisory.id === id)
        .map((advisory) => advisory.package)
    )

    for (const packageName of entry.packages)
      if (!reportedPackages.has(packageName))
        failures.push(
          `${id} is exempt for ${packageName}, but no longer reported against it, so that part of the entry can go: ${entry.reason}`
        )
  }

  return failures
}

/**
 * The report in an `npm audit --json` run, or a failure that says what happened.
 *
 * npm writes its own errors to stdout as JSON (`{"error": {"code": "ENOLOCK"}}`)
 * and exits non-zero, so neither the exit status nor a successful parse is a
 * verdict by itself: the report has to carry a `vulnerabilities` object.
 */
export const reportOf = (result, label) => {
  let parsed

  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    const detail = (result.stderr || result.stdout || '').trim().slice(0, 400)

    throw new Error(
      `${label} did not produce a report: ${detail || `exit ${result.status}`}`
    )
  }

  if (parsed?.error)
    throw new Error(
      `${label} failed: ${parsed.error.code ?? 'error'} ${
        parsed.error.summary ?? parsed.error.detail ?? ''
      }`.trim()
    )

  if (!parsed || typeof parsed.vulnerabilities !== 'object' || !parsed.vulnerabilities)
    throw new Error(
      `${label} returned no vulnerabilities object, so this gate cannot tell a clean tree from a broken audit`
    )

  return parsed
}

const readJson = (path, label) => {
  let text

  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`${label}: cannot read ${path}: ${error.message}`)
  }

  return reportOf({ stdout: text, status: 0 }, label)
}

const runAudit = (omit) => {
  const args = ['audit', '--json']

  if (omit) args.push('--omit=dev')

  const result = spawnSync('npm', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })

  return reportOf(result, `npm audit${omit ? ' --omit=dev' : ''}`)
}

const argument = (flag) => {
  const index = process.argv.indexOf(flag)

  return index === -1 ? undefined : process.argv[index + 1]
}

const main = () => {
  const bare = ['--audit', '--prod'].filter(
    (flag) => process.argv.includes(flag) && !argument(flag)
  )

  if (bare.length) {
    console.error(
      'Usage: node scripts/audit-check.mjs [--audit <full-audit.json> --prod <prod-audit.json>]'
    )
    process.exitCode = 1
    return
  }

  const fullPath = argument('--audit')
  const prodPath = argument('--prod')

  let full
  let prod

  try {
    full = fullPath ? readJson(fullPath, '--audit') : runAudit(false)
    prod = prodPath ? readJson(prodPath, '--prod') : runAudit(true)
  } catch (error) {
    console.error(String(error?.message ?? error))
    process.exitCode = 1
    return
  }

  const failures = evaluate({ full, prod })

  if (failures.length) {
    console.error(
      `\n${failures.length} audit problem(s) this gate will not pass:\n`
    )

    for (const failure of failures) console.error(`  - ${failure}`)

    console.error('')
    process.exitCode = 1
    return
  }

  console.log(
    `npm audit: nothing in a production dependency, ${
      advisoriesOf(full).size
    } dev advisory (advisory, package) pair(s), all ${EXEMPT.size} id(s) exempted by name`
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main()
