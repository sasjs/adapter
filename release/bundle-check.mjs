#!/usr/bin/env node
/**
 * Fail if the browser bundle would carry the Node polyfill tree again.
 *
 * The browser build answers the handful of Node property reads it still makes
 * with `browser-shims/process.js`, and aliases `@sasjs/utils/file` away, because
 * the source guards every node-only path (`getLogger`/`getCwd` in utils/host,
 * `isNode` around the node code paths). What put the polyfill tree in the
 * bundle before was webpack's aliasing of the Node builtins - `crypto` and
 * `constants` to crypto-browserify - which pulled browserify-sign, parse-asn1,
 * asn1.js and vm-browserify in with it: roughly 555 KB of AES/RSA/ECDSA
 * polyfills plus the vm shim's dynamic code execution. sasjs/utils#275 describes
 * the same chain arriving a second way, through the utils barrel.
 *
 * Two things put the chain on the bundle's path, and both are checked here:
 *
 *   1. webpack.config.js aliases the Node builtins again (`crypto` and
 *      `constants` are the ones that reach crypto-browserify), and
 *   2. browser-reachable source imports the utils barrel - the barrel
 *      re-exports `./fs`, and `src/fs/hash.ts` imports `crypto` - so the
 *      bundle pulls the suite without the plugin's help.
 *
 * The bundle check looks for code, not package names: webpack renumbers modules
 * and rewrites requests, so a name is not evidence either way. The published
 * 4.19.4 bundle carried 19 browserify-sign modules and not one occurrence of
 * the string "browserify-sign". The source map's `sources` list is the other
 * way to see it - see sasjs/utils#275, which describes the barrel path.
 *
 * Needs a build: run `npm run build` first (or `npm run package:lib`, which
 * builds first). Run with `node release/bundle-check.mjs`.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Code that only the Node polyfill tree carries. Signatures rather than names,
 * and none of them a plain dependency of the adapter: safe-buffer and
 * string_decoder are deliberately absent from this list, because a dependency
 * bump can legitimately bring them back and that is not this guard's concern.
 */
const POLYFILL_SIGNATURES = [
  [
    'browserify/crypto-browserify',
    'crypto-browserify, the AES/RSA/ECDSA polyfill'
  ],
  [
    'createCredentials is not implemented',
    'crypto-browserify, the AES/RSA/ECDSA polyfill'
  ],
  [
    'DH_CHECK_P_NOT_SAFE_PRIME',
    "crypto-browserify's constants table, which webpack aliases the `constants` builtin to"
  ],
  ['_signType', 'browserify-sign, the signature half of the crypto suite'],
  ['function oaep (key, msg)', 'public-encrypt, the RSA padding half'],
  [
    'runInThisContext',
    'the vm shim (vm-browserify), which is where the dynamic code execution comes from'
  ],
  ['process.binding is not supported', 'the process/browser polyfill'],
  ['process.chdir is not supported', 'the process/browser polyfill']
]

/**
 * Specifiers that put the crypto chain on the browser bundle's path. The barrel
 * re-exports ./fs and ./fs/hash imports crypto; the /fs subpath is the same
 * module reached directly.
 */
const FORBIDDEN_SPECIFIERS = [/^@sasjs\/utils$/, /^@sasjs\/utils\/fs(\/|$)/]

/** The browser bundles, wherever the build has put them: dist/ after publishInit, build/dist/ before. */
const bundlePaths = () => {
  const candidates = [
    join(repoRoot, 'dist', 'sasjs-adapter.js'),
    join(repoRoot, 'dist', 'minified_sas9.js'),
    join(repoRoot, 'build', 'dist', 'sasjs-adapter.js'),
    join(repoRoot, 'build', 'dist', 'minified_sas9.js')
  ]
  return candidates.filter((path) => existsSync(path))
}

/** Every source file the browser build can reach, specs and fixtures aside. */
const sourceFiles = (dir = join(repoRoot, 'src')) => {
  const found = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (['spec', 'test', '__mocks__', 'node_modules'].includes(entry))
        continue
      found.push(...sourceFiles(path))
      continue
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(entry)) continue
    if (/\.spec\.ts$/.test(entry)) continue
    found.push(path)
  }
  return found
}

const importSpecifiers = (line) => {
  const specifiers = []
  const patterns = [
    /from\s+['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g
  ]
  for (const pattern of patterns) {
    for (const match of line.matchAll(pattern)) specifiers.push(match[1])
  }
  return specifiers
}

const offences = []

const bundles = bundlePaths()
if (!bundles.length) {
  console.error(
    'no browser bundle found - run `npm run build` (or `npm run package:lib`) before this check'
  )
  process.exit(1)
}

for (const path of bundles) {
  const code = readFileSync(path)
  const hits = POLYFILL_SIGNATURES.filter(([signature]) =>
    code.includes(signature)
  )
  if (hits.length) {
    offences.push({
      what: relative(repoRoot, path),
      why: 'carries the Node polyfill tree',
      hits: hits.map(([signature, reason]) => `${signature} - ${reason}`)
    })
  }
}

const files = sourceFiles()
for (const path of files) {
  const lines = readFileSync(path, 'utf8').split('\n')
  lines.forEach((line, index) => {
    for (const specifier of importSpecifiers(line)) {
      if (FORBIDDEN_SPECIFIERS.some((pattern) => pattern.test(specifier))) {
        offences.push({
          what: `${relative(repoRoot, path)}:${index + 1}`,
          why: 'imports the crypto chain onto the browser bundle path',
          hits: [`${specifier} - import a deep subpath instead`]
        })
      }
    }
  })
}

console.log(
  `browser bundles checked: ${bundles.map((p) => relative(repoRoot, p)).join(', ')}`
)
console.log(`source files checked: ${files.length}`)
if (!offences.length) {
  console.log(
    'no Node polyfill tree, and no barrel import, on the browser bundle path'
  )
  process.exit(0)
}

console.error('\nthe browser bundle would carry the Node polyfill tree:')
for (const offence of offences) {
  console.error(`  ${offence.what}  - ${offence.why}`)
  for (const hit of offence.hits) console.error(`      ${hit}`)
}
console.error(
  '\nKeep the polyfill plugin out of webpack.config.js, and import @sasjs/utils through' +
    '\nits deep subpaths rather than the barrel. See sasjs/utils#275.'
)
process.exit(1)
