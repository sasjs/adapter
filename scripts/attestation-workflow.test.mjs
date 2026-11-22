import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync('.github/workflows/npmpublish.yml', 'utf8')
const step = (name) => {
  const steps = workflow.split(/^      - name: /m)
  const matches = steps.filter((s) => s.startsWith(`${name}\n`))
  assert.equal(matches.length, 1, `expected one ${name} step`)
  return matches[0]
}

test('the staged local tarball is attested and the same bundle is attached', () => {
  const stage = step('Stage the release on npm')
  assert.match(stage, /npm stage publish/)
  const pack = step('Pack the tarball this run stages')
  assert.match(pack, /^        if: steps\.publish\.outputs\.released == 'true'$/m)
  assert.match(pack, /^          npm pack --pack-destination dist$/m)
  const attest = step("Attest the tarball's build provenance")
  assert.match(attest, /^        if: steps\.publish\.outputs\.released == 'true'$/m)
  assert.match(attest, /^        uses: sasjs\/release\/\.github\/actions\/attest-assets@6bce05cbcd9364c7097f089ea6c9132978a500ca/m)
  assert.match(attest, /^          subject-path: 'dist\/\*\.tgz'$/m)
  assert.match(attest, /^          version: \$\{\{ steps\.prepare\.outputs\.version \}\}$/m)
  const attach = step('Attach the tarball and its provenance to the release')
  assert.match(attach, /^        if: steps\.publish\.outputs\.released == 'true'$/m)
  assert.match(attach, /^          TAG: \$\{\{ steps\.release\.outputs\.tag \}\}$/m)
  assert.match(attach, /^          BUNDLE: \$\{\{ steps\.attest\.outputs\.bundle-path \}\}$/m)
  assert.match(attach, /gh release upload "\$TAG" dist\/\*\.tgz "\$BUNDLE" --clobber/)
  assert.match(workflow, /^      id-token: write\b/m)
  assert.match(workflow, /^      attestations: write\b/m)
  assert.ok(workflow.indexOf(stage) < workflow.indexOf(pack) && workflow.indexOf(pack) < workflow.indexOf(attest) && workflow.indexOf(attest) < workflow.indexOf(attach))
})
