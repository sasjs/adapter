#!/usr/bin/env node

/**
 * Blocks a pull request that lowers coverage, which is the half of the
 * `jest.config.js` threshold nobody wants to maintain by hand.
 *
 * `coverageThreshold.global` is a floor: one fixed number that only moves when
 * someone remembers to move it, so it either lags behind real coverage forever
 * or fails an unrelated pull request the moment coverage slips. Jest still
 * enforces that floor whenever it runs with `--coverage`. This script adds the
 * other half - the comparison against the tree the pull request is diffed
 * against:
 *
 * - the `coverage-baseline` workflow publishes `coverage/coverage-summary.json`
 *   as a workflow artifact on every push to `master`;
 * - a pull request compares its own summary with the one published for its base
 *   commit - or, when that commit has none, for the newest commit the base
 *   commit descends from, named in the comment - and any metric more than
 *   `--tolerance` below it fails the job;
 * - an improvement passes and is reported, so the effective bar tracks the
 *   repository without a commit;
 * - no baseline is a failure, not a pass. A gate that silently degrades to the
 *   fixed number is the state this exists to leave behind.
 *
 * A deliberate drop - deleting tested code, or a toolchain upgrade that counts
 * differently - lowers `coverageThreshold` in that same pull request, where a
 * reviewer sees it.
 *
 * `--markdown` writes the same comparison as a pull request comment, so the
 * report and the gate are one calculation rather than two.
 *
 * usage:
 *   node .github/scripts/coverage-ratchet.mjs \
 *     [--head coverage/coverage-summary.json] \
 *     [--base coverage-base/coverage-summary.json] \
 *     [--tolerance 0.05] [--markdown coverage-comment.md] \
 *     [--note "<where the baseline came from>"] [--missing-baseline fail|skip]
 */

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

export const METRICS = ['statements', 'branches', 'functions', 'lines']

/** jest wobbles by a rounding step or two between runs; ignore that much. */
export const DEFAULT_TOLERANCE = 0.05

const round = (value) => Math.round(value * 100) / 100

/** The `total` entry of a jest json-summary report. */
export const totals = (summary) => {
  if (!summary || typeof summary !== 'object' || !summary.total) {
    throw new Error('a coverage summary must carry a `total` entry')
  }
  return summary.total
}

const percentage = (report, metric, side) => {
  const entry = report[metric]
  if (!entry || typeof entry.pct !== 'number') {
    // jest's json-summary always carries all four, so a missing one is a
    // malformed report rather than a metric that does not apply. Skipping it
    // would narrow the gate without saying so.
    throw new Error(
      `the ${side} report has no numeric \`${metric}\` percentage`
    )
  }
  return entry.pct
}

/**
 * Compares two totals. Returns one row per metric, and the subset that fell by
 * more than the tolerance.
 */
export const compareToBase = (head, base, tolerance = DEFAULT_TOLERANCE) => {
  const rows = []
  const regressions = []

  for (const metric of METRICS) {
    const headPct = percentage(head, metric, 'head')
    const basePct = percentage(base, metric, 'base')

    // the tolerance is applied to the unrounded difference: rounding first
    // would turn a 0.054pt drop into -0.05 and let it pass as unchanged
    const delta = headPct - basePct
    const verdict =
      delta < -tolerance
        ? 'regressed'
        : delta > tolerance
          ? 'improved'
          : 'unchanged'

    rows.push({
      metric,
      base: basePct,
      head: headPct,
      delta: round(delta),
      verdict
    })
    if (verdict === 'regressed') {
      regressions.push({
        metric,
        base: basePct,
        head: headPct,
        delta: round(delta)
      })
    }
  }

  return { rows, regressions }
}

export const readSummary = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

const signed = (value) => `${value > 0 ? '+' : ''}${value}`

const printRows = (rows) => {
  const width = Math.max(...rows.map((row) => row.metric.length), 8)
  for (const row of rows) {
    console.log(
      `  ${row.metric.padEnd(width)}  base ${String(row.base).padStart(6)}  head ${String(row.head).padStart(6)}  ${signed(row.delta).padStart(7)}  ${row.verdict}`
    )
  }
}

/**
 * The comparison as a pull request comment. `note` carries whatever the caller
 * wants to say about where the baseline came from - the base commit, or why it
 * is not that commit.
 */
export const toMarkdown = ({ rows, regressions, tolerance, note }) => {
  const lines = [
    '<!-- coverage-ratchet -->',
    '## Coverage ratchet',
    '',
    note,
    '',
    '| Metric | Base | Head | Delta | |',
    '| --- | ---: | ---: | ---: | --- |',
    ...rows.map(
      (row) =>
        `| ${row.metric} | ${row.base}% | ${row.head}% | ${signed(row.delta)} | ${row.verdict} |`
    ),
    ''
  ]

  if (regressions.length) {
    lines.push(
      `**${regressions.length} metric(s) below the base by more than ${tolerance}pt.** Add tests for the code that lost coverage.`,
      '',
      'If the drop is intended - deleted code, or a toolchain upgrade that counts differently - lower `coverageThreshold` in `jest.config.js` in this pull request and say why in the description.'
    )
  } else {
    lines.push('No metric is below the base.')
  }

  return lines.join('\n')
}

export const parseArgs = (argv) => {
  if (argv.length % 2 !== 0) {
    throw new Error(
      `expected --option value pairs, got ${argv.length} argument(s)`
    )
  }

  const options = {
    head: 'coverage/coverage-summary.json',
    base: 'coverage-base/coverage-summary.json',
    tolerance: DEFAULT_TOLERANCE,
    markdown: null,
    note: null,
    // `fail` is the contract; `skip` exists only for a base commit that
    // predates the baseline workflow, which the caller proves by checking that
    // the workflow file is absent there.
    missingBaseline: 'fail'
  }

  for (let index = 0; index < argv.length; index += 2) {
    // `--missing-baseline` names `missingBaseline`, so the workflow can use the
    // spelling a shell expects without a second table of aliases
    const key = argv[index]
      .replace(/^--/, '')
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    const value = argv[index + 1]
    if (!(key in options))
      throw new Error(`unknown option --${argv[index].replace(/^--/, '')}`)

    options[key] = key === 'tolerance' ? Number(value) : value
  }

  if (Number.isNaN(options.tolerance))
    throw new Error('--tolerance must be a number')

  return options
}

const writeMarkdown = (file, body) => {
  if (file) fs.writeFileSync(file, `${body}\n`)
}

export const run = (options) => {
  console.log('Coverage ratchet')

  if (!fs.existsSync(options.base)) {
    const detail =
      'The coverage-baseline workflow publishes one on every push to master. Check that it has run for the base commit (its artifact lasts 90 days), or dispatch it by hand:\n' +
      '  gh workflow run coverage-baseline.yml --ref master'

    if (options.missingBaseline === 'skip') {
      console.warn(
        `\nNo baseline at ${options.base}, and the base commit predates the coverage-baseline workflow, so there is nothing to compare against.\n${detail}`
      )
      writeMarkdown(
        options.markdown,
        [
          '<!-- coverage-ratchet -->',
          '## Coverage ratchet',
          '',
          '**No comparison was made.** The base commit of this pull request predates the `coverage-baseline` workflow, so it has no published coverage. Every pull request based on a commit that carries the workflow is gated.'
        ].join('\n')
      )
      return 0
    }

    console.error(
      `\nNo baseline at ${options.base}, so there is nothing to compare against.\n${detail}\n` +
        'Falling back to the committed threshold here would leave the gate looser than it looks.'
    )
    writeMarkdown(
      options.markdown,
      [
        '<!-- coverage-ratchet -->',
        '## Coverage ratchet',
        '',
        '**No baseline was available, so the comparison did not run.** The `coverage-baseline` workflow publishes one on every push to `master`; this pull request found none for its base commit.'
      ].join('\n')
    )
    return 1
  }

  const head = totals(readSummary(options.head))
  const base = totals(readSummary(options.base))
  const { rows, regressions } = compareToBase(head, base, options.tolerance)

  printRows(rows)

  const note =
    options.note ||
    'Compared against the coverage summary published for the base commit of this pull request.'

  writeMarkdown(
    options.markdown,
    toMarkdown({ rows, regressions, tolerance: options.tolerance, note })
  )

  if (regressions.length) {
    console.error(
      `\n${regressions.length} metric(s) below the base branch by more than ${options.tolerance}pt:`
    )
    for (const entry of regressions) {
      console.error(
        `  ${entry.metric}: ${entry.base}% -> ${entry.head}% (${entry.delta})`
      )
    }
    console.error(
      '\nCoverage may not go backwards. Add tests for the code that lost it. If the drop is intended - deleted code, or a toolchain upgrade that counts differently - lower coverageThreshold in jest.config.js in this pull request and say why.'
    )
    return 1
  }

  console.log('\nNo metric is below the base branch.')
  return 0
}

const main = () => {
  try {
    process.exitCode = run(parseArgs(process.argv.slice(2)))
  } catch (error) {
    console.error(`coverage-ratchet: ${error.message}`)
    process.exitCode = 2
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
}
