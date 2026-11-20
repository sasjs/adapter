import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'

// Read the committed exact pin so the suite needs neither npm ci nor tar.
const version = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).devDependencies['@sasjs/release']
const raw = gunzipSync(readFileSync(resolve(`scripts/vendor/@sasjs-release-${version}.tgz`)))
let releaseSource
for (let offset = 0; offset + 512 <= raw.length;) {
  const tar = raw.subarray(offset, offset + 512)
  if (tar.every(byte => byte === 0)) break
  const field = (start, end) => tar.subarray(start, end).toString('utf8').split('\0')[0]
  const name = [field(345, 500), field(0, 100)].filter(Boolean).join('/')
  const size = parseInt(field(124, 136).trim() || '0', 8)
  offset += 512
  if (name === 'package/release.mjs') releaseSource = raw.subarray(offset, offset + size)
  offset += Math.ceil(size / 512) * 512
}
assert.ok(releaseSource, 'committed release entrypoint is missing')
if (process.env.RELEASE_SOURCE) releaseSource = readFileSync(process.env.RELEASE_SOURCE)
const bootstrap = resolve('scripts/audit-check.mjs')
const id = 'GHSA-fc5q-39xc-vjpf'
const report = (pkg, severity = 'info', advisory = id) => ({
  auditReportVersion: 2,
  vulnerabilities: pkg ? { [pkg]: { name: pkg, severity, isDirect: false, via: [{ source: 1096467, name: pkg, dependency: pkg, title: 'fixture', url: advisory ? `https://github.com/advisories/${advisory}` : '', severity, range: '<1' }], effects: [], range: '<1', nodes: [`node_modules/${pkg}`], fixAvailable: false } } : {},
  metadata: { vulnerabilities: Object.fromEntries(['info', 'low', 'moderate', 'high', 'critical', 'total'].map(k => [k, pkg && (k === severity || k === 'total') ? 1 : 0])), dependencies: {} }
})
const waiver = (packages = ['picomatch']) => ({ id, packages, devOnly: true, recheckBy: '2099-01-31', reason: 'test-only dev dependency without a fix' })

// A minimal ustar writer: the bootstrap's reader accepts fixed 512-byte
// headers, so the fixtures build exactly that. No external tar, no python3 -
// the suite runs anywhere Node runs, Windows included.
function ustar(members) {
  const blocks = []
  const pad = (text, length) => Buffer.from(text, 'utf8').subarray(0, length)
  const octal = (value, length) => Buffer.from(value.toString(8).padStart(length - 1, '0') + '\0', 'utf8')
  for (const { name, data = Buffer.alloc(0), type = '0', mode = 0o644, prefix = '' } of members) {
    const header = Buffer.alloc(512)
    pad(name, 100).copy(header, 0)
    octal(mode, 8).copy(header, 100)
    pad('0', 8).copy(header, 108) // uid
    pad('0', 8).copy(header, 116) // gid
    octal(data.length, 12).copy(header, 124)
    pad(new Date().toISOString().slice(0, 10).replace(/-/g, ''), 12).copy(header, 136) // mtime
    pad('        ', 8).copy(header, 148) // checksum placeholder
    header[156] = Buffer.from(type, 'utf8')[0]
    pad('ustar', 6).copy(header, 257)
    header[263] = 0x30; header[264] = 0x30 // version '00'
    pad(prefix, 155).copy(header, 345)
    let sum = 0
    for (const byte of header) sum += byte
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf8')
    blocks.push(header, data)
    const remainder = (512 - (data.length % 512)) % 512
    if (remainder) blocks.push(Buffer.alloc(remainder))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}

function fixture(t, { full = report(), prod = report(), exemptions = [], corrupt = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'adapter-gate-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'scripts/vendor'), { recursive: true })
  const releaseCode = corrupt ? "import { writeFileSync } from 'node:fs'; writeFileSync(process.env.EXECUTED, 'yes')\n" : releaseSource
  const archive = ustar([
    { name: 'package/package.json', data: Buffer.from(JSON.stringify({ name: '@sasjs/release', version: '0.0.0', scripts: { preinstall: 'touch lifecycle-ran', install: 'touch lifecycle-ran' } })) },
    { name: 'package/release.mjs', data: Buffer.from(releaseCode) }
  ])
  const integrity = 'sha512-' + createHash('sha512').update(archive).digest('base64')
  const pin = { version: '0.0.0', resolved: 'https://registry.npmjs.org/@sasjs/release/-/release-0.0.0.tgz', integrity: corrupt ? 'sha512-' + 'A'.repeat(86) + '==' : integrity }
  writeFileSync(join(root, 'scripts/audit-check.mjs'), readFileSync(bootstrap))
  writeFileSync(join(root, 'scripts/vendor/@sasjs-release-0.0.0.tgz'), archive)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '0.0.0', devDependencies: { '@sasjs/release': pin.version } }))
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': { devDependencies: { '@sasjs/release': pin.version } }, 'node_modules/@sasjs/release': pin } }))
  writeFileSync(join(root, 'scripts/audit-allowlist.json'), JSON.stringify(exemptions))
  writeFileSync(join(root, 'full.json'), JSON.stringify(full))
  writeFileSync(join(root, 'prod.json'), JSON.stringify(prod))
  const bin = join(root, 'bin')
  const npmCode = `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
fs.appendFileSync(process.env.NPM_LOG, JSON.stringify(args) + '\\n')
const prod = args.some((arg, i) => arg === '--omit' && args[i + 1] === 'dev' || arg === '--omit=dev')
process.stdout.write(fs.readFileSync(prod ? process.env.NPM_PROD : process.env.NPM_FULL))
process.exitCode = Number(process.env.NPM_STATUS || 0)
`
  mkdirSync(bin)
  if (process.platform === 'win32') {
    // Standard global cmd-shim; the gate validates it and launches npm-cli.js
    // directly with node.exe. It does not execute the batch file.
    writeFileSync(join(bin, 'npm.cmd'), String.raw`@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\\node.exe" (
  SET "_prog=%dp0%\\node.exe"
) ELSE (
  SET "_prog=node"
)

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & set PATHEXT=%PATHEXT:;.JS;=;% & "%_prog%"  "%dp0%\\node_modules\\npm\\bin\\npm-cli.js" %*`)
    const cli = join(bin, 'node_modules', 'npm', 'bin')
    mkdirSync(cli, { recursive: true })
    writeFileSync(join(cli, 'npm-cli.js'), npmCode)
  } else {
    writeFileSync(join(bin, 'npm'), npmCode, { mode: 0o755 })
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['path', 'pathext', 'npm_status', 'release_source'].includes(key.toLowerCase())))
  Object.assign(env, {
    PATH: [bin, dirname(process.execPath)].join(delimiter),
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    NoDefaultCurrentDirectoryInExePath: '1',
    NPM_LOG: join(root, 'npm.log'), NPM_FULL: join(root, 'full.json'), NPM_PROD: join(root, 'prod.json'), EXECUTED: join(root, 'executed')
  })
  const runAt = (cwd, ...args) => spawnSync(process.execPath, [join(root, 'scripts/audit-check.mjs'), ...args], {
    cwd, encoding: 'utf8', env
  })
  const run = (...args) => runAt(root, ...args)
  return { root, run, runAt, archivePath: join(root, 'scripts/vendor/@sasjs-release-0.0.0.tgz'), pin }
}

function repin(root, archive) {
  const path = join(root, 'package-lock.json')
  const lock = JSON.parse(readFileSync(path, 'utf8'))
  lock.packages['node_modules/@sasjs/release'].integrity = 'sha512-' + createHash('sha512').update(archive).digest('base64')
  writeFileSync(path, JSON.stringify(lock))
}

test('PR and publish run the pinned-npm audit before npm ci', () => {
  for (const file of ['.github/workflows/build-unit-tests.yml', '.github/workflows/npmpublish.yml']) {
    const workflow = readFileSync(resolve(file), 'utf8')
    const runs = [...workflow.matchAll(/^\s+run: (.+)$/gm)].map(match => match[1].trim())
    const pin = runs.indexOf('bash .github/scripts/pinned-npm.sh')
    const audit = runs.indexOf('node scripts/audit-check.mjs')
    const install = runs.indexOf('npm ci')
    assert.ok(pin >= 0 && audit > pin && install > audit, `${file}: audit must run after npm pin and before npm ci`)
  }
})

test('Windows audit job executes the migration suite without npm ci', () => {
  const workflow = readFileSync(resolve('.github/workflows/build-unit-tests.yml'), 'utf8')
  const windows = workflow.split(/^  windows-audit:\s*$/m)[1]
  assert.ok(windows, 'windows-audit job missing')
  assert.match(windows, /node-version: \[22, 24\]/)
  const runs = [...windows.matchAll(/^\s+run: (.+)$/gm)].map(match => match[1].trim())
  assert.deepEqual(runs, ['node scripts/audit-check.mjs', 'node --test scripts/audit-migration.test.mjs'])
})

test('rejects directory archive members regardless of mode', (t) => {
  for (const mode of [0, 0o40755]) {
    const { root, run, archivePath } = fixture(t)
    const archive = ustar([
      { name: 'package/package.json', data: Buffer.from(JSON.stringify({ name: '@sasjs/release', version: '0.0.0' })) },
      { name: 'package/release.mjs', data: Buffer.from('export {}') },
      { name: 'package/directory', type: '5', mode }
    ])
    writeFileSync(archivePath, archive)
    repin(root, archive)
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.notEqual(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stderr, /archive link or special member: package\/directory/)
  }
})

test('reports a failed inherited-stdio gate without an empty diagnostic suffix', (t) => {
  const { root, run } = fixture(t, { prod: report('axios') })
  const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /axios/)
  assert.match(result.stderr, /failed \(exit 1\)(?:\r?\n|$)/)
  assert.doesNotMatch(result.stderr, /failed \(exit 1\):\s*(?:\r?\n|$)/)
})

test('rejects dangerous or duplicate archive members before running the gate', (t) => {
  for (const kind of ['traversal', 'absolute', 'symlink', 'hardlink', 'duplicate']) {
    const { root, run, archivePath } = fixture(t)
    const members = [
      { name: 'package/package.json', data: Buffer.from(JSON.stringify({ name: '@sasjs/release', version: '0.0.0' })) },
      { name: 'package/release.mjs', data: Buffer.from('export {}') }
    ]
    if (kind === 'traversal') members.push({ name: 'package/../../escape', data: Buffer.from('x') })
    if (kind === 'absolute') members.push({ name: '/tmp/escape', data: Buffer.from('x') })
    if (kind === 'symlink') members.push({ name: 'package/link', type: '2' })
    if (kind === 'hardlink') members.push({ name: 'package/hard', type: '1' })
    if (kind === 'duplicate') members.push({ name: 'package/release.mjs', data: Buffer.from('x') })
    const archive = ustar(members)
    writeFileSync(archivePath, archive)
    repin(root, archive)
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.notEqual(result.status, 0, `${kind}: ${result.stdout}`)
    assert.match(result.stderr, /unsafe archive path|archive link|duplicate archive member/)
    assert.throws(() => readFileSync(join(root, 'npm.log')))
  }
})

test('the committed tarball is used, never the network', (t) => {
  const { root, run } = fixture(t)
  // Replay mode must not invoke npm; fixture PATH contains only the stub and
  // Node. The bootstrap itself reads the committed tarball.
  const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.throws(() => readFileSync(join(root, 'npm.log')))
})

test('rejects an oversized committed tarball before executing the gate', (t) => {
  const { root, run, archivePath } = fixture(t)
  const archive = Buffer.concat([readFileSync(archivePath), randomBytes(5 * 1024 * 1024)])
  writeFileSync(archivePath, archive)
  repin(root, archive)
  const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
  assert.notEqual(result.status, 0, result.stdout)
  assert.match(result.stderr, /size limit|exceeds/i)
})

test('rejects compressed archive expansion beyond the resource limit', (t) => {
  const { root, run, archivePath } = fixture(t)
  const members = [
    { name: 'package/package.json', data: Buffer.from(JSON.stringify({ name: '@sasjs/release', version: '0.0.0' })) },
    { name: 'package/release.mjs', data: Buffer.from('export {}') },
    { name: 'package/padding', data: Buffer.alloc(20 * 1024 * 1024) }
  ]
  const archive = ustar(members)
  writeFileSync(archivePath, archive)
  repin(root, archive)
  const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
  assert.notEqual(result.status, 0, result.stdout)
  assert.match(result.stderr, /limit|large|size|buffer/i)
})

test('rejects archives with too many members', (t) => {
  const { root, run, archivePath } = fixture(t)
  const members = [
    { name: 'package/package.json', data: Buffer.from(JSON.stringify({ name: '@sasjs/release', version: '0.0.0' })) },
    { name: 'package/release.mjs', data: Buffer.from('export {}') }
  ]
  for (let i = 0; i < 4100; i++) members.push({ name: `package/extra${i}` })
  const archive = ustar(members)
  writeFileSync(archivePath, archive)
  repin(root, archive)
  const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
  assert.notEqual(result.status, 0, result.stdout)
  assert.match(result.stderr, /archive member limit/i)
})

test('fails closed on a missing tarball and mismatched manifest or lock pin', (t) => {
  for (const kind of ['missing-tarball', 'manifest', 'root-lock', 'version', 'integrity-shape']) {
    const { root, run, archivePath } = fixture(t)
    const packagePath = join(root, 'package.json')
    const lockPath = join(root, 'package-lock.json')
    const manifest = JSON.parse(readFileSync(packagePath, 'utf8'))
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    if (kind === 'missing-tarball') rmSync(archivePath)
    if (kind === 'manifest') manifest.devDependencies['@sasjs/release'] = '1.0.0'
    if (kind === 'root-lock') lock.packages[''].devDependencies['@sasjs/release'] = '1.0.0'
    if (kind === 'version') lock.packages['node_modules/@sasjs/release'].version = '1.0.0'
    if (kind === 'integrity-shape') lock.packages['node_modules/@sasjs/release'].integrity = 'not-a-hash'
    writeFileSync(packagePath, JSON.stringify(manifest))
    writeFileSync(lockPath, JSON.stringify(lock))
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.notEqual(result.status, 0, kind)
    assert.match(result.stderr, /pin mismatch|invalid release tarball|integrity|ENOENT/)
    assert.throws(() => readFileSync(join(root, 'npm.log')))
  }
})

test('rejects wrong archive identity and runtime dependencies', (t) => {
  for (const change of [{ name: '@evil/release' }, { version: '1.0.0' }, { dependencies: { evil: '1.0.0' } }, { bundledDependencies: ['evil'] }, { dependencies: false }, { peerDependencies: null }]) {
    const { root, run, archivePath } = fixture(t)
    const members = [
      { name: 'package/package.json', data: Buffer.from(JSON.stringify({ name: '@sasjs/release', version: '0.0.0', ...change })) },
      { name: 'package/release.mjs', data: Buffer.from('export {}') }
    ]
    const archive = ustar(members)
    writeFileSync(archivePath, archive)
    repin(root, archive)
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.notEqual(result.status, 0, JSON.stringify(change))
    assert.match(result.stderr, /identity mismatch|package declares/)
  }
})

test('recorded clean reports pass without npm or install scripts', (t) => {
  const { root, run } = fixture(t)
  const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
  assert.equal(result.status, 0, result.stderr)
  assert.throws(() => readFileSync(join(root, 'lifecycle-ran')))
})

test('relative replay paths resolve against the caller, not the repository', (t) => {
  const { root, runAt } = fixture(t, { prod: report('axios') })
  const caller = join(root, 'caller')
  mkdirSync(caller)
  writeFileSync(join(caller, 'full.json'), JSON.stringify(report()))
  writeFileSync(join(caller, 'prod.json'), JSON.stringify(report()))
  const result = runAt(caller, '--audit', 'full.json', '--prod', 'prod.json')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  writeFileSync(join(caller, 'prod.json'), JSON.stringify(report('axios')))
  const failure = runAt(caller, '--audit', 'full.json', '--prod', 'prod.json')
  assert.notEqual(failure.status, 0)
  assert.match(failure.stdout + failure.stderr, /axios/)
  writeFileSync(join(caller, 'prod.json'), JSON.stringify(report()))
  writeFileSync(join(caller, 'full.json'), JSON.stringify(report('lodash')))
  const fullFailure = runAt(caller, '--audit', 'full.json', '--prod', 'prod.json')
  assert.notEqual(fullFailure.status, 0)
  assert.match(fullFailure.stdout + fullFailure.stderr, /lodash/)
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
  assert.throws(() => readFileSync(join(root, 'executed')))
})

test('missing or empty package scope cannot waive an advisory', (t) => {
  for (const packages of [undefined, []]) {
    const entry = waiver(packages)
    if (packages === undefined) delete entry.packages
    const { root, run } = fixture(t, { full: report('picomatch'), exemptions: [entry] })
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.notEqual(result.status, 0, result.stdout)
    assert.match(result.stderr + result.stdout, /nonempty packages are required with --audit-require-packages/)
  }
})

test('allows only the named dev package and rejects mismatch and stale scopes', (t) => {
  for (const [full, exemptions, expected, diagnostic] of [
    [report('picomatch'), [waiver()], 0, /no advisory at or above info outside the allowlist/],
    [report('micromatch'), [waiver()], 1, /micromatch: not in the allowlist/],
    [report('picomatch'), [waiver(['picomatch', 'missing'])], 1, /report no longer carries it for: missing/],
    [report(), [waiver()], 1, /report no longer carries it for: picomatch/]
  ]) {
    const { root, run } = fixture(t, { full, exemptions })
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.equal(result.status, expected, result.stdout + result.stderr)
    assert.match(result.stdout, diagnostic)
  }
})

test('unnamed advisories cannot be waived and all severities fail', (t) => {
  for (const severity of ['info', 'low', 'moderate', 'high', 'critical']) {
    const { root, run } = fixture(t, { full: report('picomatch', severity, null) })
    const result = run('--audit', join(root, 'full.json'), '--prod', join(root, 'prod.json'))
    assert.notEqual(result.status, 0, result.stdout)
    assert.match(result.stdout, new RegExp(`${severity} \\(no advisory id\\) picomatch: no GHSA id, so it cannot be exempted`))
  }
})

test('live preflight always asks npm for production and full reports, never npm ci', (t) => {
  const { root, run } = fixture(t)
  const result = run()
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const log = readFileSync(join(root, 'npm.log'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.equal(log.length, 2, JSON.stringify(log))
  for (const args of log) {
    assert.equal(args[0], 'audit')
    assert.ok(args.includes('--json'))
    assert.ok(!args.includes('ci'))
  }
  assert.deepEqual(log[0].slice(-2), ['--omit', 'dev'])
  assert.ok(!log[1].includes('--omit'), JSON.stringify(log[1]))
  assert.ok(log[1].includes('dev'), JSON.stringify(log[1]))
})

test('live findings block in production first and in the full tree second', (t) => {
  for (const target of ['prod', 'full']) {
    const { root, run } = fixture(t, { [target]: report(target === 'prod' ? 'axios' : 'lodash') })
    const result = run()
    assert.notEqual(result.status, 0, result.stdout + result.stderr)
    assert.match(result.stdout, target === 'prod' ? /axios: in the production tree/ : /lodash: not in the allowlist/)
    const log = readFileSync(join(root, 'npm.log'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    assert.equal(log.length, target === 'prod' ? 1 : 2, JSON.stringify(log))
    assert.deepEqual(log[0].slice(-2), ['--omit', 'dev'])
    if (target === 'full') assert.ok(!log[1].includes('--omit'))
  }
})

test('npm error output does not become a clean audit', (t) => {
  const { root, run } = fixture(t)
  writeFileSync(join(root, 'prod.json'), JSON.stringify({ error: { code: 'ENOLOCK' } }))
  const result = run()
  assert.notEqual(result.status, 0, result.stdout)
  assert.match(result.stderr, /this is not an npm audit report: no vulnerabilities or auditReportVersion/)
  const log = readFileSync(join(root, 'npm.log'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.equal(log.length, 1, JSON.stringify(log))
  assert.deepEqual(log[0].slice(-2), ['--omit', 'dev'])
})

test('an error disguised as a clean npm audit report fails in both scopes', (t) => {
  for (const target of ['prod', 'full']) {
    const { root, run } = fixture(t)
    writeFileSync(join(root, `${target}.json`), JSON.stringify({ ...report(), error: { code: 'EVIL' } }))
    const result = run()
    assert.notEqual(result.status, 0, result.stdout)
    assert.match(result.stderr, /npm audit report contains an error:.*EVIL/)
    const log = readFileSync(join(root, 'npm.log'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    assert.equal(log.length, target === 'prod' ? 1 : 2, JSON.stringify(log))
    assert.deepEqual(log[0].slice(-2), ['--omit', 'dev'])
    if (target === 'full') assert.ok(!log[1].includes('--omit'))
  }
})

test('a malicious full report is rejected after a clean production preflight', (t) => {
  const { root, run } = fixture(t)
  writeFileSync(join(root, 'full.json'), JSON.stringify({ error: { code: 'ENOLOCK' } }))
  const result = run()
  assert.notEqual(result.status, 0, result.stdout)
  assert.match(result.stderr, /this is not an npm audit report: no vulnerabilities or auditReportVersion/)
  const log = readFileSync(join(root, 'npm.log'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.equal(log.length, 2, JSON.stringify(log))
  assert.deepEqual(log[0].slice(-2), ['--omit', 'dev'])
  assert.ok(!log[1].includes('--omit'))
})
