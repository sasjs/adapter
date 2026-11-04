import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * Guards the compatibility shim in createTSDocs.js.
 *
 * typedoc 0.28 calls `Minimatch#matchOne()`, which minimatch 11 removed, so the
 * doc build adds that method before generating. The shim is dead code the day
 * typedoc stops calling it, and these cases say so: the release that makes it
 * true turns this file red with the instruction above the failing case, rather
 * than leaving a comment for a reader who has no reason to look.
 *
 * The check reads typedoc's SHIPPED CODE rather than its declared minimatch
 * range, because the range is only a proxy: typedoc could widen the range and
 * keep the call, or drop the call without touching the range. Every file under
 * `dist` is searched, so a file rename does not quietly pass.
 */
const typedocDist = join(__dirname, 'node_modules/typedoc/dist')

const filesCallingMatchOne = () => {
  const entries = readdirSync(typedocDist, {
    recursive: true,
    encoding: 'utf8'
  }) as string[]

  return entries
    .filter((entry) => entry.endsWith('.js'))
    .filter((entry) =>
      // the CALL, not the name: a comment or a string mentioning matchOne would
      // otherwise keep the shim alive after the call it exists for is gone
      readFileSync(join(typedocDist, entry), 'utf8').includes('matchOne(')
    )
}

describe('the createTSDocs minimatch shim', () => {
  it('is still needed: typedoc calls matchOne, from the one place it was checked at', () => {
    // The shim ignores the pattern row it is handed (minimatch 11 has no
    // row-level API), which is equivalent for the single call site below and
    // would not be for a different one. So the SET of call sites is pinned, not
    // just its non-emptiness: a second one fails here and gets reviewed.
    //
    // Empty means typedoc no longer calls the method - delete the shim in
    // createTSDocs.js, and this spec with it.
    expect(filesCallingMatchOne()).toEqual(['node-utils.js'])
  })

  it('is still needed: the minimatch typedoc runs is a release that lacks it', () => {
    // resolved from typedoc's directory, so a nested copy is followed rather
    // than assumed to be hoisted to the top level
    const manifest = require.resolve('minimatch/package.json', {
      paths: [join(__dirname, 'node_modules/typedoc')]
    })
    const installed = JSON.parse(readFileSync(manifest, 'utf8'))
    const major = Number(String(installed.version).split('.')[0])

    // minimatch 11 removed matchOne; the overrides in package.json are what keep
    // this tree off the vulnerable majors, so this is the premise of the shim
    expect(major).toBeGreaterThanOrEqual(11)
  })
})
