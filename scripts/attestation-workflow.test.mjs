import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const workflow = readFileSync('.github/workflows/npmpublish.yml', 'utf8')
const job = workflow.match(/^  build:[ \t]*\n([\s\S]*?)(?=^  [\w-]+:|^\S|(?![\s\S]))/m)?.[1]
assert.ok(job, 'release build job is missing')
const step = (pattern, description) => {
  const steps = job.split(/(?=^      - \S)/m)
  const matches = steps.filter((s) => pattern.test(s))
  assert.equal(matches.length, 1, `expected one ${description} step`)
  return matches[0]
}

test('the staged local tarball is attested and the same bundle is attached', () => {
  const stage = step(/^(?:      - |[ \t]+)id: publish$/m, 'stage')
  assert.match(stage, /npm stage publish/)
  const pack = step(/^[ \t]+npm pack --pack-destination dist$/m, 'pack')
  assert.match(pack, /^[ \t]+if: steps\.publish\.outputs\.released == 'true'$/m)
  const attest = step(/^(?:      - |[ \t]+)uses: sasjs\/release\/\.github\/actions\/attest-assets@/m, 'attest')
  assert.match(attest, /^[ \t]+if: steps\.publish\.outputs\.released == 'true'$/m)
  assert.match(attest, /^(?:      - |[ \t]+)uses: sasjs\/release\/\.github\/actions\/attest-assets@[0-9a-f]{40}(?:[ \t]+#.*)?$/m)
  assert.match(attest, /^[ \t]+subject-path: 'dist\/\*\.tgz'$/m)
  assert.match(attest, /^[ \t]+version: \$\{\{ steps\.prepare\.outputs\.version \}\}$/m)
  const attach = step(/gh release upload "\$TAG" dist\/\*\.tgz "\$BUNDLE" --clobber/, 'attach')
  assert.match(attach, /^[ \t]+if: steps\.publish\.outputs\.released == 'true'$/m)
  assert.match(attach, /^[ \t]+TAG: \$\{\{ steps\.release\.outputs\.tag \}\}$/m)
  assert.match(attach, /^[ \t]+BUNDLE: \$\{\{ steps\.attest\.outputs\.bundle-path \}\}$/m)
  const permissions = job.match(/^    permissions:[ \t]*\n((?:^      [^\n]*\n)+)/m)?.[1]
  assert.ok(permissions, 'release job permissions are missing')
  assert.match(permissions, /^      id-token: write\b/m)
  assert.match(permissions, /^      attestations: write\b/m)
  assert.ok(workflow.indexOf(stage) < workflow.indexOf(pack) && workflow.indexOf(pack) < workflow.indexOf(attest) && workflow.indexOf(attest) < workflow.indexOf(attach))
})

test('the release refuses a missing provenance asset', () => {
  const attach = step(/gh release upload "\$TAG" dist\/\*\.tgz "\$BUNDLE" --clobber/, 'attach')
  const block = attach.split(/^        run: \|[ \t]*\n/m)[1]
  assert.ok(block, 'attach run block is missing')
  const script = block.split('\n').filter((line) => line.startsWith('          ')).map((line) => line.slice(10)).join('\n')
  const dir = mkdtempSync(join(tmpdir(), 'attest-assets-'))
  try {
    mkdirSync(join(dir, 'dist'))
    writeFileSync(join(dir, 'dist', 'package.tgz'), 'tarball')
    writeFileSync(join(dir, 'gh'), '#!/bin/sh\nif [ "$2" = view ]; then printf "%s\\n" "$ASSETS"; fi\n', { mode: 0o755 })
    const cases = [
      ['package.tgz', 'dist/provenance-1.0.0.intoto.jsonl', 1],
      ['package.tgz\nprovenance-older.intoto.jsonl', 'dist/provenance-1.0.0.intoto.jsonl', 1],
      ['package.tgz\nprovenance-1.0.0.intoto.jsonl', 'dist/provenance-1.0.0.intoto.jsonl', 0],
      ['package.tgz\nprovenance-1.0.0.txt', 'dist/provenance-1.0.0.txt', 1]
    ]
    for (const [assets, bundle, expected] of cases) {
      const result = spawnSync('bash', ['-c', script], {
        cwd: dir,
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TAG: 'v1.0.0', BUNDLE: bundle, ASSETS: assets },
        encoding: 'utf8'
      })
      assert.equal(result.status, expected, result.stderr)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
