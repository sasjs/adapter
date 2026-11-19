import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * The check is a CLI, so it is tested as one: each case records two audit reports
 * - the full tree and the production-only tree - and the assertion is the exit
 * code and what it says. A change that turned the gate into a pass would look
 * exactly like a clean tree, which is what these cases prevent.
 *
 * The exemption list is passed as a fixture where a case needs one: `EXEMPT` is
 * empty while no dev advisory is live, and the exemption rules have to stay
 * covered anyway - a rule that is only exercised while an advisory happens to
 * exist is a rule that rots.
 */
const script = join(__dirname, 'audit-check.mjs')

/** The advisory a fixture exempts, and a second one it never does. */
const EXEMPT_ID = 'GHSA-fc5q-39xc-vjpf'
const OTHER_ID = 'GHSA-aaaa-bbbb-cccc'

const dir = mkdtempSync(join(tmpdir(), 'audit-check-'))

afterAll(() => rmSync(dir, { recursive: true, force: true }))

let written = 0

/** One advisory, in the shape `npm audit --json` reports it. */
const advisoryEntry = (
  id: string | null,
  pkg = 'picomatch',
  severity = 'high'
) => ({
  severity,
  via: [
    {
      source: 1096467,
      name: pkg,
      title: 'vulnerable to ReDoS',
      url: id ? `https://github.com/advisories/${id}` : undefined,
      severity,
      range: '<=4.0.7'
    }
  ],
  effects: [],
  range: '<=4.0.7',
  nodes: [`node_modules/${pkg}`],
  fixAvailable: false
})

const advisory = (id: string | null, pkg = 'picomatch') => ({
  [pkg]: advisoryEntry(id, pkg)
})

const report = (vulnerabilities: object) => ({
  auditReportVersion: 2,
  vulnerabilities,
  metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } }
})

const clean = report({})

/** An exemption list, in the shape the script's EXEMPT map has. */
const exemptionList = (packages = ['picomatch'], id = EXEMPT_ID) => ({
  [id]: { packages, reason: 'a reason, for the case at hand' }
})

const run = (
  full: object | string,
  prod: object | string,
  exempt?: object
) => {
  const fullFile = join(dir, `full-${written}.json`)
  const prodFile = join(dir, `prod-${written++}.json`)

  writeFileSync(
    fullFile,
    typeof full === 'string' ? full : JSON.stringify(full)
  )
  writeFileSync(
    prodFile,
    typeof prod === 'string' ? prod : JSON.stringify(prod)
  )

  const args = [script, '--audit', fullFile, '--prod', prodFile]

  if (exempt) {
    const exemptFile = join(dir, `exempt-${written}.json`)
    writeFileSync(exemptFile, JSON.stringify(exempt))
    args.push('--exempt', exemptFile)
  }

  return spawnSync('node', args, { encoding: 'utf8' })
}

describe('audit-check', () => {
  it('should pass when the only advisory is exempted by name, in the dev tree', () => {
    const result = run(report(advisory(EXEMPT_ID)), clean, exemptionList())

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('exempted by name')
  })

  it('should fail on a dev advisory when nothing is exempt, which is the list today', () => {
    // no --exempt: the shipped list is empty, so an advisory fails on the first day
    const result = run(report(advisory(EXEMPT_ID)), clean)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(EXEMPT_ID)
    expect(result.stderr).toContain('Fix it, or add it to EXEMPT')
  })

  it('should fail on a dev advisory that is not exempted', () => {
    const result = run(report(advisory(OTHER_ID)), clean, exemptionList())

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(OTHER_ID)
    expect(result.stderr).toContain('in the dev tree')
  })

  it('should fail on a dev advisory reported alongside an exempted one', () => {
    const both = { ...advisory(EXEMPT_ID), ...advisory(OTHER_ID, 'micromatch') }

    const result = run(report(both), clean, exemptionList())

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(OTHER_ID)
    expect(result.stderr).not.toContain(`${EXEMPT_ID} in the dev tree`)
  })

  it('should fail on the exempted advisory when it reaches a production dependency', () => {
    // the same id in the tree that ships: an exemption is a statement about the
    // dev tree, and it must not travel into a production one
    const result = run(
      report(advisory(EXEMPT_ID)),
      report(advisory(EXEMPT_ID)),
      exemptionList()
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('PRODUCTION dependency')
    expect(result.stderr).toContain('cannot be exempted')
  })

  it('should name every package an advisory reaches', () => {
    // one id, two packages: a reader has to fix both paths, so both are named
    const twoPackages = {
      ...advisory(OTHER_ID, 'picomatch'),
      ...advisory(OTHER_ID, 'micromatch')
    }

    const result = run(report(twoPackages), clean, exemptionList())

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('(picomatch)')
    expect(result.stderr).toContain('(micromatch)')
  })

  it('should fail when the exempted id arrives against a package the entry does not name', () => {
    // the entry argues about picomatch; the same id under another package is a
    // different path and a different argument, so it is not covered by it
    const result = run(
      report(advisory(EXEMPT_ID, 'micromatch')),
      clean,
      exemptionList()
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('The exemption covers picomatch, not micromatch')
    // and the package the entry does name is no longer reported, so that part of
    // the entry is stale rather than silently satisfied
    expect(result.stderr).toContain(
      'is exempt for picomatch, but no longer reported against it'
    )
  })

  it('should fail on an advisory it cannot name, in either tree', () => {
    // npm raises advisories of its own with no GHSA url: unexemptible, and
    // dropping it would turn "cannot name this" into "nothing to fix"
    const unnamed = run(report(advisory(null)), clean, exemptionList())

    expect(unnamed.status).toBe(1)
    expect(unnamed.stderr).toContain('no GHSA id')
    expect(unnamed.stderr).toContain('has to be fixed')

    const unnamedProd = run(clean, report(advisory(null, 'axios')))

    expect(unnamedProd.status).toBe(1)
    expect(unnamedProd.stderr).toContain('no GHSA id')
    expect(unnamedProd.stderr).toContain('PRODUCTION dependency')
  })

  it('should fail on an exemption that no longer appears', () => {
    // the advisory has cleared, so the entry is a claim about a tree that no
    // longer exists and must be deleted - a stale entry is invisible in a pass
    const result = run(clean, clean, exemptionList())

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(EXEMPT_ID)
    expect(result.stderr).toContain('is exempt but no longer reported')
  })

  it('should fail on npm error output rather than reading it as a clean tree', () => {
    // npm writes its own failures to stdout as JSON and exits non-zero; a
    // missing lockfile must not become the steady state that passes
    const errorReport = JSON.stringify({
      error: { code: 'ENOLOCK', summary: 'This command requires an existing lockfile.' }
    })

    const result = run(errorReport, clean)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('ENOLOCK')
    expect(result.stdout).not.toContain('nothing in a production dependency')
  })

  it('should fail on a report with no vulnerabilities object', () => {
    const result = run(JSON.stringify({ auditReportVersion: 2 }), clean)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('no vulnerabilities object')
  })

  it('should fail when a report cannot be read, and say which one', () => {
    const result = spawnSync(
      'node',
      [
        script,
        '--audit',
        join(dir, 'does-not-exist.json'),
        '--prod',
        join(dir, 'also-missing.json')
      ],
      { encoding: 'utf8' }
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('--audit: cannot read')
  })

  it('should fail when a report is not JSON', () => {
    const result = run('<html>registry unavailable</html>', clean)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('did not produce a report')
  })

  it('should print usage when a flag has no value', () => {
    const result = spawnSync('node', [script, '--audit'], { encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage: node scripts/audit-check.mjs')
    expect(result.stderr).not.toContain('TypeError')
  })
})
