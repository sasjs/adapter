/*
 * Compatibility shim for typedoc 0.28 on minimatch 11.
 *
 * typedoc 0.28 discovers entry points by testing each parsed pattern row:
 *   mini.set.some((row) => mini.matchOne(childPath, row, true))
 * and minimatch 11 removed `matchOne`. The minimatch override in package.json
 * (the advisory covers everything below 11.0.1) makes minimatch 11 unavoidable,
 * so the method is supplied here rather than by forking either package.
 *
 * Two differences from the removed primitive are handled rather than assumed
 * away:
 *
 * - `matchOne` took the path as an ARRAY of segments; `match()` takes a string,
 *   so the segments are joined.
 * - `matchOne` answered for one parsed row and never applied the pattern's own
 *   negation, while `match()` folds `negate`/`flipNegate` in. A negated pattern
 *   would therefore have had its answer inverted, so those two properties are
 *   neutralised for the call and restored afterwards.
 *
 * Both module builds are patchable because they are two instances with two
 * classes: this repo's doc build loads typedoc through require(), which resolves
 * minimatch's CommonJS build, while importing the same package resolves the ESM
 * one.
 */

/**
 * Answers whether a path matches the pattern, ignoring the pattern-level
 * negation that `match()` applies.
 */
const matchRow = (matcher, file, partial) => {
  const { negate, flipNegate } = matcher

  matcher.negate = false
  matcher.flipNegate = false

  try {
    return matcher.match(Array.isArray(file) ? file.join('/') : file, partial)
  } finally {
    matcher.negate = negate
    matcher.flipNegate = flipNegate
  }
}

/**
 * Installs `matchOne` on each build that lacks it, and leaves alone any build
 * that already provides one. A build with no `Minimatch` export - a different
 * module flavour, or a future package shape - is skipped rather than fatal.
 *
 * Returns the number of builds patched.
 */
const installMatchOne = (builds) => {
  let patched = 0

  for (const build of builds) {
    const Minimatch = build && build.Minimatch

    if (typeof Minimatch !== 'function' || !Minimatch.prototype) {
      continue
    }

    if (typeof Minimatch.prototype.matchOne === 'function') {
      continue
    }

    Minimatch.prototype.matchOne = function matchOne(file, _pattern, partial) {
      return matchRow(this, file, partial)
    }

    patched += 1
  }

  return patched
}

module.exports = { installMatchOne, matchRow }
