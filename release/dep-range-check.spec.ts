import { spawnSync } from 'child_process'
import { join } from 'path'

/**
 * The check is a CLI, so it is tested as one: each fixture is a manifest and the
 * assertion is its exit code. A change that neutered the rule would pass on the
 * repo's own clean manifest and go unnoticed, which is exactly what the failing
 * fixtures prevent.
 */
const script = join(__dirname, 'dep-range-check.mjs')
const fixture = (name: string) =>
  join(__dirname, '__fixtures__', `${name}.json`)

const run = (name: string) =>
  spawnSync('node', [script, '--manifest', fixture(name)], {
    encoding: 'utf8'
  })

describe('dep-range-check', () => {
  it.each([
    'caret',
    'caret-peer',
    'caret-prerelease',
    'dev-exact',
    'third-party',
    'span-major',
    'zero-span',
    'overrides-caret',
    'overrides-parent-scoped-caret',
    'overrides-parent-third-party',
    'overrides-mixed-caret',
    'resolutions-caret'
  ])('should pass on %s', (name) => {
    const result = run(name)

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('hoists across a minor')
  })

  it.each([
    'pinned',
    'tilde',
    'tag',
    'star',
    'caret-star',
    'gte',
    'caret-gte',
    'optional',
    'overrides-pinned',
    'overrides-parent-scoped',
    'overrides-mixed',
    'overrides-unreadable',
    'span-wrong-major',
    'resolutions-pinned'
  ])('should fail on %s', (name) => {
    const result = run(name)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('must be specified so a consumer')
  })

  it('should fail a 0.x caret and offer the range that hoists', () => {
    const result = run('caret-zero')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Specifiers below 1.0 pin the minor')
    expect(result.stderr).toContain('@sasjs/sas-language')
    expect(result.stderr).toContain('>=x.y.z <1.0.0')
    // the caret hint belongs to the other branch; printing both is a contradiction
    expect(result.stderr).not.toContain('"^x.y.z" from the version you tested')

    // an exact pin below 1.0 nests for the same reason and gets the same advice
    const exact = run('zero-exact')
    expect(exact.status).toBe(1)
    expect(exact.stderr).toContain('an exact pin permits nothing')
  })

  it('should print usage when --manifest has no value', () => {
    const result = spawnSync('node', [script, '--manifest'], {
      encoding: 'utf8'
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Usage: node release/dep-range-check.mjs')
    expect(result.stderr).not.toContain('TypeError')
  })
})
