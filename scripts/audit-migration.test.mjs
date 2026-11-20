import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

// During development point RELEASE_SOURCE at the merged release checkout. CI
// uses the installed exact pin, so it exercises the artifact consumers get.
const source = process.env.RELEASE_SOURCE || resolve('node_modules/@sasjs/release/release.mjs')
const bootstrap = resolve('scripts/audit-check.mjs')
const id = 'GHSA-fc5q-39xc-vjpf'
const report = (pkg, severity = 'info', advisory = id) => ({
  auditReportVersion: 2,
  vulnerabilities: pkg ? { [pkg]: { name: pkg, severity, isDirect: false, via: [{ source: 1096467, name: pkg, dependency: pkg, title: 'fixture', url: advisory ? `https://github.com/advisories/${advisory}` : '', severity, range: '<1' }], effects: [], range: '<1', nodes: [`node_modules/${pkg}`], fixAvailable: false } } : {},
  metadata: { vulnerabilities: Object.fromEntries(['info', 'low', 'moderate', 'high', 'critical', 'total'].map(k => [k, pkg && (k === severity || k === 'total') ? 1 : 0])), dependencies: {} }
})
const waiver = (packages = ['picomatch']) => ({ id, packages, devOnly: true, recheckBy: '2099-01-31', reason: 'test-only dev dependency without a fix' })

function fixture(t, { full = report(), prod = report(), exemptions = [], corrupt = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'adapter-gate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'scripts'))
  mkdirSync(join(root, 'package'))
  mkdirSync(join(root, 'bin'))
  writeFileSync(join(root, 'scripts/audit-check.mjs'), readFileSync(bootstrap))
  writeFileSync(join(root, 'package/release.mjs'), corrupt ? "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.EXECUTED, 'yes')\n" : readFileSync(source))
  writeFileSync(join(root, 'package/package.json'), JSON.stringify({ name: '@sasjs/release', version: '0.0.0', scripts: { preinstall: 'touch lifecycle-ran', install: 'touch lifecycle-ran' } }))
  const pack = spawnSync('tar', ['-czf', join(root, 'release.tgz'), '-C', root, 'package'])
  assert.equal(pack.status, 0, String(pack.stderr))
  const integrity = 'sha512-' + createHash('sha512').update(readFileSync(join(root, 'release.tgz'))).digest('base64')
  const pin = { version: '0.0.0', resolved: 'https://registry.npmjs.org/@sasjs/release/-/release-0.0.0.tgz', integrity: corrupt ? 'sha512-' + 'A'.repeat(86) + '==' : integrity }
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0', devDependencies: { '@sasjs/release': pin.version } }))
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': { devDependencies: { '@sasjs/release': pin.version } }, 'node_modules/@sasjs/release': pin } }))
  writeFileSync(join(root, 'scripts/audit-allowlist.json'), JSON.stringify(exemptions))
  writeFileSync(join(root, 'full.json'), JSON.stringify(full))
  writeFileSync(join(root, 'prod.json'), JSON.stringify(prod))
  writeFileSync(join(root, 'bin/curl'), '#!/bin/sh\nwhile [ "$1" != "-o" ]; do shift; done\ncp "$FIXTURE_TARBALL" "$2"\n', { mode: 0o755 })
  writeFileSync(join(root, 'bin/npm'), '#!/bin/sh\necho "$@" >> "$NPM_LOG"\ncase "$*" in *--omit*) cat "$NPM_PROD" ;; *) cat "$NPM_FULL" ;; esac\nexit "${NPM_STATUS:-0}"\n', { mode: 0o755 })
  const run = (...args) => spawnSync(process.execPath, [join(root, 'scripts/audit-check.mjs'), ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, FIXTURE_TARBALL: join(root, 'release.tgz'), NPM_LOG: join(root, 'npm.log'), NPM_FULL: join(root, 'full.json'), NPM_PROD: join(root, 'prod.json'), EXECUTED: join(root, 'executed') } })
  return { root, run }
}

function repack(root, kind) {
  const python = `import io, sys, tarfile
p, kind = sys.argv[1:]
with tarfile.open(p, 'r:gz') as src:
    members = [(e, src.extractfile(e).read() if e.isfile() else None) for e in src]
with tarfile.open(p, 'w:gz') as dst:
    for e, data in members:
        dst.addfile(e, io.BytesIO(data) if data is not None else None)
    e = tarfile.TarInfo({'traversal': 'package/../../escape', 'absolute': '/tmp/escape', 'symlink': 'package/link', 'hardlink': 'package/hard', 'duplicate': 'package/release.mjs'}[kind])
    if kind in ('symlink', 'hardlink'):
        e.type = tarfile.SYMTYPE if kind == 'symlink' else tarfile.LNKTYPE
        e.linkname = '../../escape'
        dst.addfile(e)
    else:
        e.size = 1
        dst.addfile(e, io.BytesIO(b'x'))
`
  const result = spawnSync('python3', ['-c', python, join(root, 'release.tgz'), kind], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const path = join(root, 'package-lock.json')
  const lock = JSON.parse(readFileSync(path))
  lock.packages['node_modules/@sasjs/release'].integrity = 'sha512-' + createHash('sha512').update(readFileSync(join(root, 'release.tgz'))).digest('base64')
  writeFileSync(path, JSON.stringify(lock))
}

test('rejects dangerous or duplicate archive members before running the gate', (t) => {
  for (const kind of ['traversal', 'absolute', 'symlink', 'hardlink', 'duplicate']) {
    const { root, run } = fixture(t)
    repack(root, kind)
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.notEqual(result.status, 0, `${kind}: ${result.stdout}`)
    assert.match(result.stderr, /unsafe archive path|archive link|duplicate archive member/)
    assert.throws(() => readFileSync(join(root, 'npm.log')))
  }
})

test('fails closed on fetch failure and mismatched manifest or lock pin', (t) => {
  for (const kind of ['fetch', 'manifest', 'root-lock', 'version', 'url']) {
    const { root, run } = fixture(t)
    const packagePath = join(root, 'package.json')
    const lockPath = join(root, 'package-lock.json')
    const manifest = JSON.parse(readFileSync(packagePath))
    const lock = JSON.parse(readFileSync(lockPath))
    if (kind === 'fetch') writeFileSync(join(root, 'bin/curl'), '#!/bin/sh\nexit 22\n', { mode: 0o755 })
    if (kind === 'manifest') manifest.devDependencies['@sasjs/release'] = '1.0.0'
    if (kind === 'root-lock') lock.packages[''].devDependencies['@sasjs/release'] = '1.0.0'
    if (kind === 'version') lock.packages['node_modules/@sasjs/release'].version = '1.0.0'
    if (kind === 'url') lock.packages['node_modules/@sasjs/release'].resolved = 'https://example.org/release.tgz'
    writeFileSync(packagePath, JSON.stringify(manifest))
    writeFileSync(lockPath, JSON.stringify(lock))
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.notEqual(result.status, 0, kind)
    assert.match(result.stderr, /curl failed|pin mismatch|invalid release tarball/)
    assert.throws(() => readFileSync(join(root, 'npm.log')))
  }
})

test('rejects wrong archive identity and runtime dependencies', (t) => {
  for (const change of [{ name: '@evil/release' }, { version: '1.0.0' }, { dependencies: { evil: '1.0.0' } }, { bundledDependencies: ['evil'] }, { dependencies: false }, { peerDependencies: null }]) {
    const { root, run } = fixture(t)
    writeFileSync(join(root, 'package/package.json'), JSON.stringify({ name: '@sasjs/release', version: '0.0.0', ...change }))
    const packed = spawnSync('tar', ['-czf', join(root, 'release.tgz'), '-C', root, 'package'])
    assert.equal(packed.status, 0)
    const path = join(root, 'package-lock.json')
    const lock = JSON.parse(readFileSync(path))
    lock.packages['node_modules/@sasjs/release'].integrity = 'sha512-' + createHash('sha512').update(readFileSync(join(root, 'release.tgz'))).digest('base64')
    writeFileSync(path, JSON.stringify(lock))
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.notEqual(result.status, 0, JSON.stringify(change))
    assert.match(result.stderr, /identity mismatch|package declares/)
  }
})

test('recorded clean reports pass without npm or install scripts', (t) => {
  const { root, run } = fixture(t)
  const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
  assert.equal(result.status, 0, result.stderr)
  assert.throws(() => readFileSync(join(root, 'npm.log')))
  assert.throws(() => readFileSync(join(root, 'lifecycle-ran')))
})

test('production info fails even when the waiver list is empty', (t) => {
  const { root, run } = fixture(t, { prod: report('axios') })
  const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
  assert.notEqual(result.status, 0, result.stdout)
  assert.match(result.stdout + result.stderr, /axios/)
})

test('integrity mismatch refuses to execute the gate', (t) => {
  const { root, run } = fixture(t, { corrupt: true })
  const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /integrity/i)
  assert.throws(() => readFileSync(join(root, 'npm.log')))
  assert.throws(() => readFileSync(join(root, 'executed')))
})

test('missing or empty package scope cannot waive an advisory', (t) => {
  for (const packages of [undefined, []]) {
    const entry = waiver(packages)
    if (packages === undefined) delete entry.packages
    const { root, run } = fixture(t, { full: report('picomatch'), exemptions: [entry] })
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.notEqual(result.status, 0, result.stdout)
    assert.match(result.stderr + result.stdout, /packages/i)
  }
})

test('allows only the named dev package and rejects mismatch and stale scopes', (t) => {
  for (const [full, exemptions, expected] of [
    [report('picomatch'), [waiver()], 0],
    [report('micromatch'), [waiver()], 1],
    [report('picomatch'), [waiver(['picomatch', 'missing'])], 1],
    [report(), [waiver()], 1]
  ]) {
    const { root, run } = fixture(t, { full, exemptions })
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.equal(result.status === 0 ? 0 : 1, expected, result.stdout + result.stderr)
  }
})

test('unnamed advisories cannot be waived and all severities fail', (t) => {
  for (const severity of ['info', 'low', 'moderate', 'high', 'critical']) {
    const { root, run } = fixture(t, { full: report('picomatch', severity, null) })
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.notEqual(result.status, 0, result.stdout)
  }
})

test('live preflight always asks npm for production and full reports, never npm ci', (t) => {
  const { root, run } = fixture(t)
  const result = run()
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const log = readFileSync(join(root, 'npm.log'), 'utf8').trim().split('\n')
  assert.equal(log.length, 2, log.join('\n'))
  assert.match(log[0], /^audit /)
  assert.match(log[0], /--omit[= ]dev/)
  assert.match(log[1], /^audit /)
  assert.doesNotMatch(log.join('\n'), /\bci\b/)
})

test('npm error output does not become a clean audit', (t) => {
  const { root, run } = fixture(t)
  writeFileSync(join(root, 'prod.json'), JSON.stringify({ error: { code: 'ENOLOCK' } }))
  const result = run()
  assert.notEqual(result.status, 0, result.stdout)
  assert.match(result.stderr + result.stdout, /ENOLOCK|audit.*fail/i)
})
