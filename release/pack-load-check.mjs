#!/usr/bin/env node
/**
 * Fail if the tarball this release would publish cannot be loaded.
 *
 * `pack-check.mjs` proves the `files` allowlist is not too BROAD. This proves it
 * is not too NARROW in the one way a consumer feels immediately: the package's
 * own entry point. The allowlist enumerates the root modules by name, so a module
 * added to `src/` and required by another is silently left out of the tarball -
 * and nothing in CI loaded the packed package, so nothing noticed.
 *
 * The shape that shipped, in 6.0.0: `auth/refreshTokensForSasjs.js` requires
 * `../apiBasePath`, which the allowlist did not name, so
 * `require('@sasjs/adapter/node')` threw `Cannot find module '../apiBasePath'`
 * for every Node consumer - the CLI, sasjs/server, and any project importing the
 * adapter in node - while the package's own suite (which loads `src/`) was green.
 *
 * Run from a tree where `npm run publishInit` has been run, which is the tree
 * `semantic-release` packs: `node release/pack-load-check.mjs`.
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const work = mkdtempSync(join(tmpdir(), 'adapter-pack-load-'))

const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  })

let tarball
try {
  const packed = run('npm', [
    'pack',
    '--quiet',
    '--ignore-scripts',
    '--pack-destination',
    work
  ]).trim()
  tarball = packed.split('\n').pop().trim()
} catch (error) {
  console.error('could not pack the package')
  console.error(String(error.stdout || '') + String(error.stderr || ''))
  process.exit(1)
}

try {
  run('tar', ['-xzf', join(work, tarball), '-C', work])
} catch (error) {
  console.error(`could not unpack ${tarball}`)
  process.exit(1)
}

const packageRoot = join(work, 'package')

/**
 * Dependency resolution comes from this repo's own install, which is what a
 * consumer has after `npm i` - the check is about the package's OWN modules, not
 * about its dependency tree.
 */
const resolveFrom = process.env.NODE_PATH
  ? `${process.env.NODE_PATH}:${join(repoRoot, 'node_modules')}`
  : join(repoRoot, 'node_modules')

const failures = []
for (const entry of [join(packageRoot, 'node'), packageRoot]) {
  try {
    execFileSync(process.execPath, ['-e', `require(${JSON.stringify(entry)})`], {
      cwd: packageRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_PATH: resolveFrom }
    })
  } catch (error) {
    failures.push({
      entry,
      output: String(error.stderr || error.message)
        .trim()
        .split('\n')
        .slice(0, 6)
        .join('\n')
    })
  }
}

rmSync(work, { recursive: true, force: true })

if (failures.length) {
  console.error(`\n${tarball} cannot be loaded by a consumer:`)
  for (const { entry, output } of failures) {
    console.error(`\n  entry: ${entry.replace(work, '<packed>')}`)
    console.error(`  ${output.replace(/\n/g, '\n  ')}`)
  }
  console.error(
    '\nThe `files` allowlist decides what ships, and it names the root modules one' +
      ' by one: a module the package requires has to be named there too.'
  )
  process.exit(1)
}

console.log(`${tarball} loads from its own entry point`)
