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
 * branch can act on. Measured 2026-11-18: 39 advisories, all of them
 * `GHSA-fc5q-39xc-vjpf` against picomatch, whose advisory range is `<= 4.0.7`
 * while 4.0.7 is the newest version published - so `npm audit fix` offers only a
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
 * Run with `node scripts/audit-check.mjs`, or point it at recorded output with
 * `--audit <full.json> --prod <prod.json>` (the spec does this).
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * Dev-tree advisories this repository cannot clear, each with its argument.
 *
 * Keyed by advisory id. The value is what a reader needs to judge the claim:
 * where the package sits, what input reaches the affected code, and the condition
 * that clears it.
 */
export const EXEMPT = new Map([
  [
    'GHSA-fc5q-39xc-vjpf',
    "picomatch, reached only from the dev toolchain (ts-loader and the webpack chain, and jest through micromatch). The advisory range is <= 4.0.7 and 4.0.7 is the newest version on the registry as of 2026-11-18, so no version this repository can resolve is outside it, and an `overrides` entry would pin a vulnerable copy. NOT SHIPPED: no production dependency resolves picomatch, and `npm audit --omit=dev` is clean. RISK ACCEPTANCE: the ReDoS input is a glob pattern, and the patterns this tree matches are the repository's own build and test configuration - written and reviewed by a contributor - not data a package supplies at runtime. It clears when picomatch publishes above the range; this entry then fails the stale rule until it is deleted."
  ]
])

/** The advisory ids inside one `npm audit --json` result. */
export const advisoriesOf = (audit) => {
  const found = new Map()

  for (const [name, vulnerability] of Object.entries(
    audit?.vulnerabilities ?? {}
  )) {
    for (const via of vulnerability?.via ?? []) {
      if (typeof via !== 'object' || via === null) continue

      const id = /GHSA-[a-z0-9-]+/i.exec(via.url ?? '')?.[0]

      if (id && !found.has(id))
        found.set(id, {
          id,
          severity: via.severity,
          title: via.title,
          package: name
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

  for (const advisory of shipped.values())
    failures.push(
      `${advisory.severity} ${advisory.id} in a PRODUCTION dependency (${advisory.package}): ${advisory.title}. A shipping dependency is a version to change, not a risk to accept, so this cannot be exempted.`
    )

  const devOnly = [...advisoriesOf(full).values()].filter(
    (advisory) => !shipped.has(advisory.id)
  )

  for (const advisory of devOnly)
    if (!exempt.has(advisory.id))
      failures.push(
        `${advisory.severity} ${advisory.id} in the dev tree (${advisory.package}): ${advisory.title}. Fix it, or add it to EXEMPT in scripts/audit-check.mjs with the reason it cannot be fixed.`
      )

  const reported = new Set([
    ...shipped.keys(),
    ...devOnly.map((advisory) => advisory.id)
  ])

  for (const [id, reason] of exempt)
    if (!reported.has(id))
      failures.push(
        `${id} is exempt but no longer reported, so the exemption can go: ${reason}`
      )

  return failures
}

const readJson = (path, label) => {
  let text

  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`${label}: cannot read ${path}: ${error.message}`)
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label}: ${path} is not JSON`)
  }
}

/**
 * `npm audit --json` exits non-zero when it finds anything, so its STATUS is not
 * a verdict - the report on stdout is. A run that produced no parseable report
 * fails, because a gate that cannot read its input is not a pass.
 */
const runAudit = (omit) => {
  const args = ['audit', '--json']

  if (omit) args.push('--omit=dev')

  const result = spawnSync('npm', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })

  try {
    return JSON.parse(result.stdout)
  } catch {
    throw new Error(
      `npm audit${omit ? ' --omit=dev' : ''} did not produce a report: ${
        (result.stderr || result.stdout || '').trim().slice(0, 400) ||
        `exit ${result.status}`
      }`
    )
  }
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
    } dev advisory id(s), all ${EXEMPT.size} exempted by name`
  )
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main()
