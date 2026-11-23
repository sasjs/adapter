import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync('.github/workflows/npmpublish.yml', 'utf8')
const job = workflow.match(/^  build:[ \t]*\n([\s\S]*?)(?=^  [\w-]+:|^\S|(?![\s\S]))/m)?.[1]
assert.ok(job, 'release build job is missing')
const step = (name) => {
  const steps = job.split(/^      - name: /m)
  const matches = steps.filter((s) => s.startsWith(`${name}\n`))
  assert.equal(matches.length, 1, `expected one ${name} step`)
  return matches[0]
}

test('the staged local tarball is attested and the same bundle is attached', () => {
  const stage = step('Stage the release on npm')
  assert.match(stage, /npm stage publish/)
  const pack = step('Pack the tarball this run stages')
  assert.match(pack, /^[ \t]+if: steps\.publish\.outputs\.released == 'true'$/m)
  assert.match(pack, /^[ \t]+npm pack --pack-destination dist$/m)
  const attest = step("Attest the tarball's build provenance")
  assert.match(attest, /^[ \t]+if: steps\.publish\.outputs\.released == 'true'$/m)
  assert.match(attest, /^[ \t]+uses: sasjs\/release\/\.github\/actions\/attest-assets@[0-9a-f]{40}(?:[ \t]+#.*)?$/m)
  assert.match(attest, /^[ \t]+subject-path: 'dist\/\*\.tgz'$/m)
  assert.match(attest, /^[ \t]+version: \$\{\{ steps\.prepare\.outputs\.version \}\}$/m)
  const attach = step('Attach the tarball and its provenance to the release')
  assert.match(attach, /^[ \t]+if: steps\.publish\.outputs\.released == 'true'$/m)
  assert.match(attach, /^[ \t]+TAG: \$\{\{ steps\.release\.outputs\.tag \}\}$/m)
  assert.match(attach, /^[ \t]+BUNDLE: \$\{\{ steps\.attest\.outputs\.bundle-path \}\}$/m)
  assert.match(attach, /gh release upload "\$TAG" dist\/\*\.tgz "\$BUNDLE" --clobber/)
  const permissions = job.match(/^    permissions:[ \t]*\n((?:^      [^\n]*\n)+)/m)?.[1]
  assert.ok(permissions, 'release job permissions are missing')
  assert.match(permissions, /^      id-token: write\b/m)
  assert.match(permissions, /^      attestations: write\b/m)
  assert.ok(workflow.indexOf(stage) < workflow.indexOf(pack) && workflow.indexOf(pack) < workflow.indexOf(attest) && workflow.indexOf(attest) < workflow.indexOf(attach))
})
