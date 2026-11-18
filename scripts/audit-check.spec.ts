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
 * The reports are built here rather than kept as files: a case is a row below,
 * next to the expectation it belongs to.
 */
const script = join(__dirname, 'audit-check.mjs')

/** The advisory the gate exempts, and a second one it does not. */
const EXEMPT_ID = 'GHSA-fc5q-39xc-vjpf'
const OTHER_ID = 'GHSA-aaaa-bbbb-cccc'

const dir = mkdtempSync(join(tmpdir(), 'audit-check-'))

afterAll(() => rmSync(dir, { recursive: true, force: true }))

let written = 0

/** One advisory, in the shape `npm audit --json` reports it. */
const advisory = (id: string, pkg = 'picomatch', severity = 'high') => ({
  [pkg]: {
    severity,
    via: [
      {
        source: 1,
        name: pkg,
        title: 'vulnerable to ReDoS',
        url: `https://github.com/advisories/${id}`,
        severity,
        range: '<=4.0.7'
      }
    ],
    effects: [],
    range: '<=4.0.7',
    nodes: [`node_modules/${pkg}`],
    fixAvailable: false
  }
})

const report = (vulnerabilities: object) => ({
  auditReportVersion: 2,
  vulnerabilities,
  metadata: { vulnerabilities: { total: Object.keys(vulnerabilities).length } }
})

const clean = report({})

const run = (full: object, prod: object) => {
  const fullFile = join(dir, `full-${written}.json`)
  const prodFile = join(dir, `prod-${written++}.json`)

  writeFileSync(fullFile, JSON.stringify(full))
  writeFileSync(prodFile, JSON.stringify(prod))

  return spawnSync('node', [script, '--audit', fullFile, '--prod', prodFile], {
    encoding: 'utf8'
  })
}

describe('audit-check', () => {
  it('should pass when the only advisory is the exempted one, in the dev tree', () => {
    const result = run(report(advisory(EXEMPT_ID)), clean)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('exempted by name')
  })

  it('should fail on a dev advisory that is not exempted', () => {
    const result = run(report(advisory(OTHER_ID)), clean)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(OTHER_ID)
    expect(result.stderr).toContain('in the dev tree')
    expect(result.stderr).toContain('Fix it, or add it to EXEMPT')
  })

  it('should fail on a dev advisory reported alongside an exempted one', () => {
    const both = { ...advisory(EXEMPT_ID), ...advisory(OTHER_ID) }

    const result = run(report(both), clean)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(OTHER_ID)
    expect(result.stderr).not.toContain(`${EXEMPT_ID} in the dev tree`)
  })

  it('should fail on the exempted advisory when it reaches a production dependency', () => {
    // the same id in the tree that ships: an exemption is a statement about the
    // dev tree, and it must not travel into a production one
    const result = run(report(advisory(EXEMPT_ID)), report(advisory(EXEMPT_ID)))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('PRODUCTION dependency')
    expect(result.stderr).toContain('cannot be exempted')
  })

  it('should fail on an exemption that no longer appears', () => {
    // the advisory has cleared, so the entry is a claim about a tree that no
    // longer exists and must be deleted - a stale entry is invisible in a pass
    const result = run(clean, clean)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(EXEMPT_ID)
    expect(result.stderr).toContain('is exempt but no longer reported')
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
    const notJson = join(dir, 'not-json.json')
    writeFileSync(notJson, '<html>registry unavailable</html>')

    const result = spawnSync('node', [script, '--audit', notJson], {
      encoding: 'utf8'
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('is not JSON')
  })

  it('should print usage when a flag has no value', () => {
    const result = spawnSync('node', [script, '--audit'], { encoding: 'utf8' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage: node scripts/audit-check.mjs')
    expect(result.stderr).not.toContain('TypeError')
  })
})
