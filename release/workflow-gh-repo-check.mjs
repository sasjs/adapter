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
 * Three things satisfy it, and all three are accepted: `--repo` on the command;
 * `GH_REPO` in the step's env or the job's (which covers that step, or every step
 * in the job - an env entry in one step does not excuse a call in another); or a
 * checkout in the same job. The first version accepted only `--repo`, which would
 * have failed a workflow whose env already told gh what it needed. It reads the
 * workflow files as text rather
 * than parsing them - the shape it needs (job keys at two spaces, `uses:` and
 * `run:` blocks beneath them) is stable enough that a parser would be a
 * dependency for no gain, and a rule about text is what a reader can check by
 * eye.
 *
 * Run with `node release/workflow-gh-repo-check.mjs [dir]` - the directory is the
 * repo's workflows unless one is named, which is how a probe is exercised.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
/** A directory may be passed, so the rule can be exercised on a probe workflow. */
const workflows = process.argv[2] || join(repoRoot, '.github', 'workflows')

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

const indentOf = (text) => text.length - text.trimStart().length

const offences = []

for (const file of readdirSync(workflows).filter((name) =>
  /\.ya?ml$/.test(name)
)) {
  const path = join(workflows, file)
  const lines = joinedLines(readFileSync(path, 'utf8'))

  let inJobs = false
  let job = null
  let step = null
  /** The env block being read, and the indent it sits at: 4 is the job's, 8+ a step's. */
  let envIndent = null

  const jobs = new Map()
  const current = () => jobs.get(job)

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
      step = null
      envIndent = null
      if (!jobs.has(job))
        jobs.set(job, {
          checkout: false,
          envRepo: false,
          stepEnvRepo: new Set(),
          calls: []
        })
      continue
    }

    if (!job) continue

    const indent = indentOf(text)
    const trimmed = text.trim()

    if (!trimmed) continue

    // leaving the env block: anything at or above the `env:` indent is a sibling
    if (envIndent !== null && indent <= envIndent) envIndent = null

    if (/^env:\s*$/.test(trimmed)) {
      envIndent = indent
      continue
    }

    // `GH_REPO` is how gh is told the repository when it is not on the command;
    // an empty value tells it nothing, so only a value counts. A job-level env
    // covers every step; a step-level one covers only that step, which is why the
    // two are recorded apart.
    if (envIndent !== null && indent > envIndent) {
      const assigned = /^GH_REPO:\s*(.+)$/.exec(trimmed)
      const value = assigned && assigned[1].trim()
      if (value && value !== "''") {
        if (envIndent === 4) current().envRepo = true
        else if (step !== null) current().stepEnvRepo.add(step)
      }
      continue
    }

    if (/^ {6}- /.test(text)) step = number

    if (/uses:\s*actions\/checkout@/.test(text)) current().checkout = true

    if (trimmed.startsWith('#')) continue
    if (!NEEDS_A_REPO.test(text)) continue

    current().calls.push({
      line: number,
      step,
      command: trimmed.replace(/\s+/g, ' ').slice(0, 120),
      namesRepo: /--repo[\s=]/.test(text)
    })
  }

  for (const [name, { checkout, envRepo, stepEnvRepo, calls }] of jobs) {
    for (const call of calls) {
      if (call.namesRepo || envRepo || stepEnvRepo.has(call.step) || checkout)
        continue
      offences.push({
        path: join(workflows, file),
        line: call.line,
        job: name,
        command: call.command,
        why: 'calls gh with no --repo, no GH_REPO and no checkout'
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
  const where = offence.path.startsWith(repoRoot)
    ? offence.path.slice(repoRoot.length + 1)
    : offence.path
  console.error(
    `  ${where}:${offence.line} (job ${offence.job}) - ${offence.why}`
  )
  console.error(`      ${offence.command}`)
}
console.error(
  '\ngh infers the repository from a git remote, and exits with "failed to run git:' +
    '\nfatal: not a git repository" when there is none. Pass' +
    '\n--repo "$GITHUB_REPOSITORY" to the call, or add an actions/checkout step to' +
    '\nthe job - the latter only if the job actually needs the tree.'
)
process.exit(1)
