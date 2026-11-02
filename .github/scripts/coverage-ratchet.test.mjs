import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  compareToBase,
  DEFAULT_TOLERANCE,
  parseArgs,
  run,
  toMarkdown,
  totals
} from './coverage-ratchet.mjs'

/**
 * The ratchet is a gate, so its own behaviour is worth pinning: a regression
 * that slipped through, a malformed baseline that narrowed the comparison, a
 * missing baseline that read as a pass, or a comment that disagreed with the
 * verdict would each be a failure nobody notices until coverage has been
 * falling for months.
 */

const summary = ({ statements, branches, functions, lines }) => ({
  total: {
    statements: { pct: statements },
    branches: { pct: branches },
    functions: { pct: functions },
    lines: { pct: lines }
  }
})

const withTotals = (values) => totals(summary(values))

const quiet = (fn) => {
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error
  }
  console.log = console.warn = console.error = () => {}
  try {
    return fn()
  } finally {
    Object.assign(console, original)
  }
}

const files = (headBody, baseBody) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-'))
  const head = path.join(dir, 'head.json')
  const base = path.join(dir, 'base.json')

  fs.writeFileSync(head, JSON.stringify(headBody))
  if (baseBody) fs.writeFileSync(base, JSON.stringify(baseBody))

  return { dir, head, base }
}

const options = (overrides) => ({
  head: 'coverage/coverage-summary.json',
  base: 'coverage-base/coverage-summary.json',
  tolerance: DEFAULT_TOLERANCE,
  markdown: null,
  note: null,
  missingBaseline: 'fail',
  ...overrides
})

test('totals rejects a report with no total entry', () => {
  assert.throws(() => totals({}), /`total` entry/)
  assert.throws(() => totals(null), /`total` entry/)
})

test('parseArgs reads the flags the workflow passes', () => {
  const parsed = parseArgs([
    '--head',
    'coverage/coverage-summary.json',
    '--base',
    'coverage-base/coverage-summary.json',
    '--markdown',
    'coverage-comment.md',
    '--missing-baseline',
    'skip',
    '--note',
    'Compared against the base commit abc1234.'
  ])

  assert.equal(parsed.missingBaseline, 'skip')
  assert.equal(parsed.markdown, 'coverage-comment.md')
  assert.equal(parsed.note, 'Compared against the base commit abc1234.')
})

test('parseArgs rejects a trailing option with no value', () => {
  assert.throws(() => parseArgs(['--head']), /value pairs/)
})

test('parseArgs rejects an option it does not know, with the flag as written', () => {
  assert.throws(() => parseArgs(['--nosuch', 'x']), /unknown option --nosuch/)
})

test('a drop beyond the tolerance is a regression', () => {
  const base = withTotals({
    statements: 80,
    branches: 70,
    functions: 79,
    lines: 86
  })
  const head = withTotals({
    statements: 79.5,
    branches: 70,
    functions: 79,
    lines: 86
  })

  const { regressions, rows } = compareToBase(head, base)

  assert.equal(regressions.length, 1)
  assert.equal(regressions[0].metric, 'statements')
  assert.equal(regressions[0].delta, -0.5)
  assert.equal(
    rows.find((row) => row.metric === 'branches').verdict,
    'unchanged'
  )
})

test('a drop inside the tolerance is not a regression', () => {
  const base = withTotals({
    statements: 80,
    branches: 70,
    functions: 79,
    lines: 86
  })
  const head = withTotals({
    statements: 80 - DEFAULT_TOLERANCE,
    branches: 70,
    functions: 79,
    lines: 86
  })

  assert.deepEqual(compareToBase(head, base).regressions, [])
})

test('an improvement passes and is reported as such', () => {
  const base = withTotals({
    statements: 80,
    branches: 70,
    functions: 79,
    lines: 86
  })
  const head = withTotals({
    statements: 81.25,
    branches: 70,
    functions: 79,
    lines: 86
  })

  const { regressions, rows } = compareToBase(head, base)

  assert.deepEqual(regressions, [])
  assert.equal(
    rows.find((row) => row.metric === 'statements').verdict,
    'improved'
  )
})

test('the tolerance is applied before rounding', () => {
  // 79.946 - 80 is -0.054: it rounds to -0.05, which is exactly the tolerance,
  // so a rounding-first comparison would read it as unchanged and let it through
  const base = withTotals({
    statements: 80,
    branches: 70,
    functions: 79,
    lines: 86
  })
  const head = withTotals({
    statements: 79.946,
    branches: 70,
    functions: 79,
    lines: 86
  })

  const { regressions, rows } = compareToBase(head, base)

  assert.equal(regressions.length, 1)
  assert.equal(regressions[0].metric, 'statements')
  // the reported figure is still rounded
  assert.equal(regressions[0].delta, -0.05)
  assert.equal(
    rows.find((row) => row.metric === 'statements').verdict,
    'regressed'
  )
})

test('every metric is checked, not just statements', () => {
  const base = withTotals({
    statements: 80,
    branches: 70,
    functions: 79,
    lines: 86
  })
  const head = withTotals({
    statements: 80,
    branches: 69,
    functions: 79,
    lines: 85
  })

  const { regressions } = compareToBase(head, base)

  assert.deepEqual(regressions.map((entry) => entry.metric).sort(), [
    'branches',
    'lines'
  ])
})

test('a metric missing from the baseline is an error, not a narrower comparison', () => {
  const base = { statements: { pct: 80 } }
  const head = withTotals({
    statements: 80,
    branches: 70,
    functions: 79,
    lines: 86
  })

  assert.throws(
    () => compareToBase(head, base),
    /base report has no numeric `branches`/
  )
})

test('a metric missing from the head report is an error too', () => {
  const head = { statements: { pct: 80 } }
  const base = withTotals({
    statements: 80,
    branches: 70,
    functions: 79,
    lines: 86
  })

  assert.throws(
    () => compareToBase(head, base),
    /head report has no numeric `branches`/
  )
})

test('the markdown says what the verdict says', () => {
  const base = withTotals({
    statements: 80,
    branches: 70,
    functions: 79,
    lines: 86
  })
  const head = withTotals({
    statements: 78,
    branches: 70,
    functions: 79,
    lines: 86
  })

  const comparison = compareToBase(head, base)
  const body = toMarkdown({
    ...comparison,
    tolerance: DEFAULT_TOLERANCE,
    note: 'Compared against `main`.'
  })

  assert.match(body, /^<!-- coverage-ratchet -->/)
  assert.match(body, /Compared against `main`\./)
  assert.match(body, /\| statements \| 80% \| 78% \| -2 \| regressed \|/)
  assert.match(body, /1 metric\(s\) below the base/)
  assert.doesNotMatch(body, /No metric is below the base\./)
})

test('the markdown reports a clean run as clean', () => {
  const same = withTotals({
    statements: 80,
    branches: 70,
    functions: 79,
    lines: 86
  })
  const body = toMarkdown({
    ...compareToBase(same, same),
    tolerance: DEFAULT_TOLERANCE,
    note: 'Compared against the base commit `abc1234`.'
  })

  assert.match(body, /No metric is below the base\./)
  assert.doesNotMatch(body, /below the base by more than/)
})

test('run() fails the job when the base has more coverage', () => {
  const { dir, head, base } = files(
    summary({ statements: 70, branches: 60, functions: 70, lines: 70 }),
    summary({ statements: 80, branches: 70, functions: 80, lines: 80 })
  )

  assert.equal(
    quiet(() => run(options({ head, base }))),
    1
  )
  fs.rmSync(dir, { recursive: true, force: true })
})

test('run() passes when the run matches the base', () => {
  const body = summary({
    statements: 80,
    branches: 70,
    functions: 80,
    lines: 80
  })
  const { dir, head, base } = files(body, body)

  assert.equal(
    quiet(() => run(options({ head, base }))),
    0
  )
  fs.rmSync(dir, { recursive: true, force: true })
})

test('run() writes the markdown it printed the verdict from', () => {
  const { dir, head, base } = files(
    summary({ statements: 70, branches: 60, functions: 70, lines: 70 }),
    summary({ statements: 80, branches: 70, functions: 80, lines: 80 })
  )
  const markdown = path.join(dir, 'comment.md')

  quiet(() => run(options({ head, base, markdown })))

  assert.match(
    fs.readFileSync(markdown, 'utf8'),
    /4 metric\(s\) below the base/
  )
  fs.rmSync(dir, { recursive: true, force: true })
})

test('run() fails when there is no baseline rather than passing on the floor', () => {
  const { dir, head, base } = files(
    summary({ statements: 80, branches: 70, functions: 80, lines: 80 })
  )

  // `base` was never written
  assert.equal(
    quiet(() => run(options({ head, base }))),
    1
  )
  fs.rmSync(dir, { recursive: true, force: true })
})

test('run() skips only when the caller has proved the base predates the baseline workflow', () => {
  const { dir, head, base } = files(
    summary({ statements: 80, branches: 70, functions: 80, lines: 80 })
  )

  assert.equal(
    quiet(() => run(options({ head, base, missingBaseline: 'skip' }))),
    0
  )
  fs.rmSync(dir, { recursive: true, force: true })
})

test('the skip still says in the comment that no comparison was made', () => {
  const { dir, head, base } = files(
    summary({ statements: 80, branches: 70, functions: 80, lines: 80 })
  )
  const markdown = path.join(dir, 'comment.md')

  quiet(() => run(options({ head, base, markdown, missingBaseline: 'skip' })))

  const body = fs.readFileSync(markdown, 'utf8')
  assert.match(body, /No comparison was made/)
  assert.doesNotMatch(body, /No metric is below the base/)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('run() throws when the run produced no coverage report at all', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-'))
  const base = path.join(dir, 'base.json')
  fs.writeFileSync(
    base,
    JSON.stringify(
      summary({ statements: 80, branches: 70, functions: 80, lines: 80 })
    )
  )

  assert.throws(
    () =>
      quiet(() => run(options({ head: path.join(dir, 'absent.json'), base }))),
    /ENOENT/
  )

  fs.rmSync(dir, { recursive: true, force: true })
})
