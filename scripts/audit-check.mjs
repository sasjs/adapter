#!/usr/bin/env node
// Bootstrap the lock-pinned gate without installing any dependency or running
// package lifecycle scripts. The lockfile is the trust anchor, not this download.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const temporary = mkdtempSync(join(tmpdir(), 'adapter-audit-'))
const extract = `import sys, tarfile
p, dest = sys.argv[1:]
wanted = {'package/package.json', 'package/release.mjs'}
seen = set()
with tarfile.open(p, 'r:gz') as archive:
    for entry in archive:
        name = entry.name
        parts = name.split('/')
        if name.startswith('/') or any(x in ('.', '..', '') for x in parts):
            raise ValueError('unsafe archive path: ' + name)
        if name in seen:
            raise ValueError('duplicate archive member: ' + name)
        seen.add(name)
        if not (entry.isfile() or entry.isdir()):
            raise ValueError('archive link or special member: ' + name)
        if name in wanted:
            if not entry.isfile() or entry.size > 4 * 1024 * 1024:
                raise ValueError('invalid archive member: ' + name)
            data = archive.extractfile(entry).read()
            with open(dest + '/' + name.split('/')[-1], 'xb') as out:
                out.write(data)
if not wanted.issubset(seen):
    raise ValueError('archive missing required entry')
`

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
  const url = `https://registry.npmjs.org/@sasjs/release/-/release-${version}.tgz`
  if (entry.resolved !== url || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity || '')) throw new Error('invalid release tarball URL or integrity')
  const tarball = join(temporary, 'release.tgz')
  run('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https', '-o', tarball, url])
  const hash = `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`
  if (hash !== entry.integrity) throw new Error('release tarball integrity mismatch')
  run('python3', ['-c', extract, tarball, temporary])
  const pkg = JSON.parse(readFileSync(join(temporary, 'package.json'), 'utf8'))
  if (pkg.name !== '@sasjs/release' || pkg.version !== version) throw new Error('release package identity mismatch')
  for (const key of ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies', 'bundleDependencies']) {
    if (Object.hasOwn(pkg, key) && (pkg[key] === null || typeof pkg[key] !== 'object' || Object.keys(pkg[key]).length)) throw new Error(`release package declares ${key}`)
  }
  const empty = join(temporary, 'empty.json')
  writeFileSync(empty, '[]\n')
  const cli = join(temporary, 'release.mjs')
  const common = [cli, '--repo-dir', root, '--audit', '--audit-level', 'info']
  const recordedProd = argv.length ? ['--audit-input', argv[3]] : []
  const recordedFull = argv.length ? ['--audit-input', argv[1], '--audit-prod-input', argv[3]] : []
  // The shared tool only runs its own production audit when exemptions exist.
  // This independent first call is mandatory even for an empty list.
  run(process.execPath, [...common, '--audit-omit', 'dev', '--audit-config', empty, ...recordedProd], { stdio: 'inherit' })
  run(process.execPath, [...common, '--audit-require-packages', ...recordedFull], { stdio: 'inherit' })
} catch (error) {
  console.error(`audit bootstrap: ${error.message}`)
  process.exitCode = 1
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
