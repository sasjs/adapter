#!/usr/bin/env node
/**
 * Fail if a workflow calls `gh` somewhere gh cannot tell which repository it is in.
 *
 * `gh` infers the repository from a git remote. A job with no `actions/checkout`
 * has no repository, and the call dies with `failed to run git: fatal: not a git
 * repository` - which is what happened to v6.0.1: the tarball was attested and
 * then never attached, so the release published with no assets at all, and
 * nothing noticed because the provenance job cannot run on a pull request.
 *
 * The remedy is one of two, and this check accepts either: name the repository on
 * the command itself (`--repo "$GITHUB_REPOSITORY"`, or a `--repo "$GH_REPO"` the
 * step's env supplies), or check the repository out in the same job. It reads the
 * workflow files as text rather
 * than parsing them - the shape it needs (job keys at two spaces, `uses:` and
 * `run:` blocks beneath them) is stable enough that a parser would be a
 * dependency for no gain, and a rule about text is what a reader can check by
 * eye.
 *
 * Run with `node release/workflow-gh-repo-check.mjs`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const workflows = join(repoRoot, '.github', 'workflows')

/** The subcommands that need a repository, and so fail without one. */
const NEEDS_A_REPO =
  /(?:^|[\s;|&(`"])gh\s+(?:release|api|run|pr|issue|repo|workflow|search|auth|gist)\b/

/**
 * A file's lines with backslash continuations joined, keeping the number of the
 * line the command starts on - a `--repo` on the fourth line of a command counts
 * for the command.
 */
const joinedLines = (text) => {
  const raw = text.split('\n')
  const out = []

  for (let at = 0; at < raw.length; at++) {
    let line = raw[at]
    let consumed = at

    while (/\\\s*$/.test(line) && consumed + 1 < raw.length) {
      consumed++
      line = line.replace(/\\\s*$/, '') + ' ' + raw[consumed].trim()
    }

    out.push({ number: at + 1, text: line })
    at = consumed
  }

  return out
}

const offences = []

for (const file of readdirSync(workflows).filter((name) =>
  /\.ya?ml$/.test(name)
)) {
  const path = join(workflows, file)
  const lines = joinedLines(readFileSync(path, 'utf8'))

  let inJobs = false
  let job = null
  const jobs = new Map()

  for (const { number, text } of lines) {
    if (/^jobs:\s*$/.test(text)) {
      inJobs = true
      continue
    }
    if (!inJobs) continue

    // a job key is the only key at two spaces below `jobs:`
    const jobKey = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(text)
    if (jobKey) {
      job = jobKey[1]
      if (!jobs.has(job)) jobs.set(job, { checkout: false, calls: [] })
      continue
    }

    if (!job) continue

    if (/uses:\s*actions\/checkout@/.test(text)) jobs.get(job).checkout = true

    const trimmed = text.trim()
    if (trimmed.startsWith('#')) continue
    if (!NEEDS_A_REPO.test(text)) continue

    jobs
      .get(job)
      .calls.push({ line: number, namesRepo: /--repo[\s=]|GH_REPO/.test(text) })
  }

  for (const [name, { checkout, calls }] of jobs) {
    for (const call of calls) {
      if (call.namesRepo || checkout) continue
      offences.push({
        file,
        line: call.line,
        job: name,
        why: 'calls gh in a job with no checkout and no --repo'
      })
    }
  }
}

if (!offences.length) {
  console.log('every gh call names its repository, or runs after a checkout')
  process.exit(0)
}

console.error('\na workflow calls gh where gh cannot see a repository:')
for (const offence of offences) {
  console.error(
    `  .github/workflows/${offence.file}:${offence.line} (job ${offence.job}) - ${offence.why}`
  )
}
console.error(
  '\ngh infers the repository from a git remote, and exits with "failed to run git:' +
    '\nfatal: not a git repository" when there is none. Pass' +
    '\n--repo "$GITHUB_REPOSITORY" to the call, or add an actions/checkout step to' +
    '\nthe job - the latter only if the job actually needs the tree.'
)
process.exit(1)
