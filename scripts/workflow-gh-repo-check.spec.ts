import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * The check is a CLI, so it is tested as one: each case is a workflow file and
 * the assertion is the exit code and the line it blames. The repo's own
 * workflows are clean, so a case built from a table is the only way to see the
 * rule at work - and the env attribution is exactly the sort of rule that reads
 * right and behaves wrong.
 */
const script = join(__dirname, 'workflow-gh-repo-check.mjs')

const dir = mkdtempSync(join(tmpdir(), 'gh-repo-check-'))

afterAll(() => rmSync(dir, { recursive: true, force: true }))

let written = 0

/** One workflow file in a directory of its own, so a case cannot see another. */
const run = (workflow: string) => {
  const own = mkdtempSync(join(dir, `case-${written++}-`))
  writeFileSync(join(own, 'workflow.yml'), workflow)
  return spawnSync('node', [script, own], { encoding: 'utf8' })
}

const job = (steps: string, env = '') => `name: probe
on: [push]
jobs:
  attach:
    runs-on: ubuntu-latest
${env}    steps:
${steps}
`

describe('workflow-gh-repo-check', () => {
  it.each([
    [
      'a --repo on the command, on a continuation line',
      job(`      - name: Attach
        run: |
          gh release upload "$TAG" "$FILE" \\
            --repo "$GITHUB_REPOSITORY" \\
            --clobber`)
    ],
    [
      'GH_REPO in the same step',
      job(`      - name: Attach
        env:
          GH_REPO: \${{ github.repository }}
        run: gh release view v1 --json assets`)
    ],
    [
      'GH_REPO on the job, which covers every step',
      job(
        `      - name: One
        run: gh release view v1 --json assets
      - name: Two
        run: gh release upload v1 file.tgz --clobber`,
        `    env:
      GH_REPO: \${{ github.repository }}
`
      )
    ],
    [
      'a checkout in the job',
      job(`      - uses: actions/checkout@v7.0.1
      - name: Comment
        run: gh api repos/o/r/issues/1/comments -f body=hi`)
    ]
  ])('accepts %s', (_label, workflow) => {
    const result = run(workflow)
    expect({ status: result.status, out: result.stdout.trim() }).toEqual({
      status: 0,
      out: 'every gh call names its repository, or runs after a checkout'
    })
  })

  it.each([
    [
      'a call with nothing to name the repository',
      job(`      - name: Attach
        run: gh release upload "$TAG" "$FILE" --clobber`),
      'gh release upload'
    ],
    [
      'GH_REPO in a step that is not the one calling gh',
      job(`      - name: Something else
        env:
          GH_REPO: \${{ github.repository }}
        run: echo hi
      - name: Attach
        run: gh release upload "$TAG" "$FILE"`),
      'gh release upload'
    ],
    [
      'an empty GH_REPO, which tells gh nothing',
      job(`      - name: Attach
        env:
          GH_REPO: ''
        run: gh release view v1`),
      'gh release view'
    ]
  ])('refuses %s', (_label, workflow, command) => {
    const result = run(workflow)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('calls gh with no --repo, no GH_REPO')
    expect(result.stderr).toContain(command)
  })

  it('names the line and the job, so the reader has somewhere to go', () => {
    const result = run(
      job(`      - name: Attach
        run: gh release view v1`)
    )

    expect(result.stderr).toMatch(/workflow\.yml:\d+ \(job attach\)/)
  })

  it('passes on the repository it is part of, with no argument', () => {
    const root = join(__dirname, '..')

    const result = spawnSync('node', [script], { cwd: root, encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toContain('every gh call names its repository')
  })
})
