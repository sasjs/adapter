import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * The check is a CLI, so it is tested as one: each case is a manifest and the
 * assertion is its exit code. A change that neutered the rule would pass on the
 * repo's own clean manifest and go unnoticed, which is what these cases prevent.
 *
 * The manifests are built from the table below rather than kept as files: a case
 * is a row here, next to the expectation it belongs to.
 */
const script = join(__dirname, 'dep-range-check.mjs')

const dir = mkdtempSync(join(tmpdir(), 'dep-range-check-'))

afterAll(() => rmSync(dir, { recursive: true, force: true }))

let written = 0

const run = (manifest: object) => {
  const file = join(dir, `manifest-${written++}.json`)
  writeFileSync(file, JSON.stringify(manifest))

  return spawnSync('node', [script, '--manifest', file], { encoding: 'utf8' })
}

const dep = (specifier: string) => ({
  dependencies: { '@sasjs/utils': specifier }
})

const overrides = (value: unknown) => ({ overrides: { '@sasjs/utils': value } })

describe('dep-range-check', () => {
  it.each([
    ['a caret', dep('^4.0.1')],
    ['a peer caret', { peerDependencies: { '@sasjs/utils': '^4.0.1' } }],
    ['a prerelease caret', dep('^4.0.0-beta.1')],
    [
      'an exact devDependency',
      { devDependencies: { '@sasjs/utils': '4.0.1' } }
    ],
    [
      'an exact pin on an external package',
      { dependencies: { axios: '1.20.0' } }
    ],
    ['a span of one major', dep('>=4.0.1 <5.0.0')],
    ['a span below 1.0', dep('>=0.3.3 <1.0.0')],
    ['an override naming the package', overrides('^4.0.1')],
    [
      'a parent-scoped override',
      { overrides: { '@sasjs/cli': { '@sasjs/utils': '^4.0.1' } } }
    ],
    [
      'a parent-scoped third-party override',
      { overrides: { '@sasjs/cli': { axios: '1.2.3' } } }
    ],
    [
      'a dot key beside a caret',
      { overrides: { '@sasjs/utils': { '.': '^4.0.1', axios: '1.2.3' } } }
    ],
    ['a resolutions caret', { resolutions: { '@sasjs/utils': '^4.0.1' } }]
  ])('should pass on %s', (_label, manifest) => {
    const result = run(manifest)

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('hoists across a minor')
  })

  it.each([
    ['an exact pin', dep('4.0.1')],
    ['a tilde', dep('~4.0.1')],
    ['a tag', dep('latest')],
    ['a star', dep('*')],
    ['a caret with a star range', dep('^4.x')],
    ['a bare >=', dep('>=4.0.1')],
    ['a caret with a bare >=', dep('>=4.0.1 <5.0.0 || ^4')],
    [
      'an optional dependency',
      { optionalDependencies: { '@sasjs/utils': '4.0.1' } }
    ],
    ['an override', overrides('4.0.1')],
    [
      'a parent-scoped exact override',
      { overrides: { '@sasjs/cli': { '@sasjs/utils': '4.0.1' } } }
    ],
    [
      'a dot key beside an exact pin',
      { overrides: { '@sasjs/utils': { '.': '4.0.1', axios: '1.2.3' } } }
    ],
    ['an override holding no specifier', overrides({ peer: true })],
    ['a span of the wrong major', dep('>=4.0.1 <6.0.0')],
    ['a resolutions exact pin', { resolutions: { '@sasjs/utils': '4.0.1' } }]
  ])('should fail on %s', (_label, manifest) => {
    const result = run(manifest)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('must be specified so a consumer')
  })

  it('should fail a 0.x caret and offer the range that hoists', () => {
    const result = run({ dependencies: { '@sasjs/sas-language': '^0.3.3' } })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Specifiers below 1.0 pin the minor')
    expect(result.stderr).toContain('@sasjs/sas-language')
    expect(result.stderr).toContain('>=x.y.z <1.0.0')
    // the caret hint belongs to the other branch; printing both is a contradiction
    expect(result.stderr).not.toContain('"^x.y.z" from the version you tested')

    // an exact pin below 1.0 nests for the same reason and gets the same advice
    const exact = run({ dependencies: { '@sasjs/sas-language': '0.3.3' } })
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
