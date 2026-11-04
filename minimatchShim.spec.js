// Tests for minimatchShim.js, which supplies the Minimatch#matchOne() that
// minimatch 11 removed and typedoc 0.28 still calls.
//
// These pin the behaviour that makes the shim a faithful stand-in rather than
// merely a method with the right name, and the guards that keep it harmless when
// the world moves. Written in JavaScript because the module under test is.
const { Minimatch } = require('minimatch')
const { installMatchOne } = require('./minimatchShim')

// the class the shim is installed on, before installation
const installed = installMatchOne([{ Minimatch }])

describe('installMatchOne', () => {
  it('finds the method missing in the minimatch this repo runs', () => {
    // the premise: minimatch 11 (the version the overrides pin) has no matchOne
    expect(installed).toBe(1)
  })

  it('installs matchOne, so typedoc can call it', () => {
    expect(typeof Minimatch.prototype.matchOne).toBe('function')
  })

  it('joins the array of segments typedoc passes', () => {
    const matcher = new Minimatch('src/**/*.ts')

    expect(matcher.matchOne(['src', 'a.ts'], [], true)).toBe(true)
    expect(matcher.matchOne(['docs', 'a.md'], [], true)).toBe(false)
  })

  it('does not invert the answer for a negated pattern', () => {
    // match() folds the pattern's own negation in; the matchOne it replaces was a
    // per-row primitive and never did, so a negated pattern is answered by the
    // row, not by the pattern as a whole
    const matcher = new Minimatch('!src/**/*.ts')

    expect(matcher.negate).toBe(true)
    expect(matcher.match('src/a.ts')).toBe(false)
    expect(matcher.matchOne(['src', 'a.ts'], [], true)).toBe(true)
    expect(matcher.negate).toBe(true) // restored after the call
  })

  it('never replaces an implementation that is already there', () => {
    class WithMatchOne extends Minimatch {
      matchOne() {
        return 'original'
      }
    }

    expect(installMatchOne([{ Minimatch: WithMatchOne }])).toBe(0)
    expect(new WithMatchOne('x').matchOne()).toBe('original')
  })

  it('skips a build that exposes no Minimatch, rather than throwing', () => {
    // a module flavour whose exports differ is not a reason to fail the doc build
    expect(installMatchOne([{}, { Minimatch: undefined }, null])).toBe(0)
  })

  it('agrees with minimatch itself on a plain pattern', () => {
    const matcher = new Minimatch('src/**/*.ts')

    for (const path of ['src/a.ts', 'src/x/y/b.ts', 'docs/a.md', 'src/a.js']) {
      expect(matcher.matchOne(path, [], true)).toBe(matcher.match(path, true))
    }
  })
})
