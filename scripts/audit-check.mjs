#!/usr/bin/env node
// Bootstrap the lock-pinned gate without installing any dependency or running
// package lifecycle scripts. The committed tarball is verified against the
// lockfile's SHA-512 before anything is extracted or executed: the lockfile is
// the trust anchor, not this script and not the committed artifact.
//
// Pure Node on purpose: no curl, no python3, no network access, so the
// pre-install audit runs on every platform the adapter itself supports,
// including Windows.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const temporary = mkdtempSync(join(tmpdir(), 'adapter-audit-'))
const wanted = new Set(['package/package.json', 'package/release.mjs'])
const maxTarballBytes = 4 * 1024 * 1024
const maxDecompressedBytes = 16 * 1024 * 1024
const maxMembers = 4096

// A deliberately restricted ustar reader: fixed 512-byte headers only, no
// sparse files, no pax/GNU extensions, no links, no device nodes. Anything
// outside that envelope is rejected rather than interpreted.
function extract(release) {
  // gunzipSync's maxOutputLength (Node >= 22.1) bounds the whole decompressed
  // stream before a single tar header is parsed.
  const raw = gunzipSync(release, { maxOutputLength: maxDecompressedBytes })
  const files = new Map()
  const seen = new Set()
  let offset = 0
  while (offset < raw.byteLength) {
    if (raw.byteLength - offset < 512) throw new Error('truncated archive header')
    const header = raw.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const field = (start, end) => {
      const slice = header.subarray(start, end)
      const nul = slice.indexOf(0)
      return slice.subarray(0, nul === -1 ? slice.length : nul).toString('utf8')
    }
    const octal = (text) => {
      const trimmed = text.replace(/[\0 ]/g, '')
      if (!/^[0-7]*$/.test(trimmed)) throw new Error('invalid archive header field')
      return parseInt(trimmed || '0', 8)
    }
    let name = field(0, 100)
    const mode = octal(field(100, 108))
    const size = octal(field(124, 136))
    const typeflag = header[156]
    const magic = field(257, 263)
    const version = header.subarray(263, 265).toString('latin1')
    const prefix = field(345, 500)
    if (magic !== 'ustar' || version !== '00') throw new Error('unsupported archive format')
    if (prefix) name = `${prefix}/${name}`
    if (!name || name.startsWith('/') || name.split('/').some((part) => !part || part === '.' || part === '..'))
      throw new Error(`unsafe archive path: ${name}`)
    if (seen.has(name)) throw new Error(`duplicate archive member: ${name}`)
    if (seen.size >= maxMembers) throw new Error('archive member limit exceeded')
    seen.add(name)
    if (typeflag !== 0x30 && typeflag !== 0x35) throw new Error(`archive link or special member: ${name}`)
    offset += 512
    const data = raw.subarray(offset, offset + size)
    if (data.byteLength !== size) throw new Error(`truncated archive member: ${name}`)
    offset += Math.ceil(size / 512) * 512
    if (wanted.has(name)) {
      if (typeflag !== 0x30 || size > maxTarballBytes) throw new Error(`invalid archive member: ${name}`)
      if (files.has(name)) throw new Error(`duplicate wanted archive member: ${name}`)
      files.set(name, data)
    }
    if (mode & 0o170000 && (mode & 0o170000) !== 0o100000) throw new Error(`archive member is not a regular file: ${name}`)
  }
  for (const name of wanted) {
    if (!files.has(name)) throw new Error('archive missing required entry')
  }
  return files
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status}): ${result.stderr || ''}`)
  return result
}

try {
  const argv = process.argv.slice(2)
  if (argv.length && (argv.length !== 4 || argv[0] !== '--audit' || argv[2] !== '--prod' || !argv[1] || !argv[3] || argv[1].startsWith('--') || argv[3].startsWith('--'))) {
    throw new Error('Usage: node scripts/audit-check.mjs [--audit <full.json> --prod <prod.json>]')
  }
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
  const version = manifest.devDependencies?.['@sasjs/release']
  const entry = lock.packages?.['node_modules/@sasjs/release']
  if (!/^\d+\.\d+\.\d+$/.test(version || '') || entry?.version !== version || lock.packages?.['']?.devDependencies?.['@sasjs/release'] !== version) throw new Error('release manifest and lock pin mismatch')
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry?.integrity || '')) throw new Error('invalid release tarball integrity')
  const tarball = readFileSync(join(root, 'scripts', 'vendor', `@sasjs-release-${version}.tgz`))
  if (tarball.byteLength > maxTarballBytes) throw new Error('release tarball exceeds the committed size limit')
  const hash = `sha512-${createHash('sha512').update(tarball).digest('base64')}`
  if (hash !== entry.integrity) throw new Error('release tarball integrity mismatch')
  const files = extract(tarball)
  const pkg = JSON.parse(files.get('package/package.json').toString('utf8'))
  if (pkg.name !== '@sasjs/release' || pkg.version !== version) throw new Error('release package identity mismatch')
  for (const key of ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies', 'bundleDependencies']) {
    if (Object.hasOwn(pkg, key) && (pkg[key] === null || typeof pkg[key] !== 'object' || Object.keys(pkg[key]).length)) throw new Error(`release package declares ${key}`)
  }
  const cli = join(temporary, 'release.mjs')
  rmSync(cli, { force: true })
  writeFileSync(cli, files.get('package/release.mjs'))
  const empty = join(temporary, 'empty.json')
  writeFileSync(empty, '[]\n')
  const common = [cli, '--repo-dir', root, '--audit', '--audit-level', 'info']
  const recordedProd = argv.length ? ['--audit-input', resolve(argv[3])] : []
  const recordedFull = argv.length ? ['--audit-input', resolve(argv[1]), '--audit-prod-input', resolve(argv[3])] : []
  // The shared tool only runs its own production audit when exemptions exist.
  // This independent first call is mandatory even for an empty list.
  run(process.execPath, [...common, '--audit-omit', 'dev', '--audit-config', empty, ...recordedProd], { stdio: 'inherit' })
  run(process.execPath, [...common, '--audit-require-packages', ...recordedFull], { stdio: 'inherit' })
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
