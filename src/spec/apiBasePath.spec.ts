import {
  apiBaseFromPathSASJS,
  apiBasePrefix,
  DEFAULT_API_BASE_PATH,
  DEFAULT_PATH_SASJS,
  normaliseApiBasePath,
  STP_EXECUTE_SUFFIX
} from '../apiBasePath'

/**
 * `pathSASJS` names the mount, and `/stp/execute` is appended by the code that
 * calls that endpoint - so a mount is all there is to read, and the only edge to
 * pin is how a value is normalised.
 */
describe('apiBaseFromPathSASJS', () => {
  it('defaults to the canonical mount', () => {
    expect(DEFAULT_PATH_SASJS).toBe('/SASjsApi')
    expect(apiBaseFromPathSASJS()).toBe('/SASjsApi')
    expect(apiBaseFromPathSASJS('')).toBe('/SASjsApi')
    expect(apiBaseFromPathSASJS('   ')).toBe('/SASjsApi')
  })

  it('reads the short mount as given', () => {
    expect(apiBaseFromPathSASJS('/api')).toBe('/api')
    expect(apiBaseFromPathSASJS('api')).toBe('/api')
    expect(apiBaseFromPathSASJS(' api/ ')).toBe('/api')
  })

  it('reads a mount that sits under a prefix, as a reverse proxy needs', () => {
    expect(apiBaseFromPathSASJS('/sasjs/api')).toBe('/sasjs/api')
  })

  it('reads a value that carries the endpoint as the mount it names', () => {
    // The spelling earlier documentation and bookmarks use, and it names the
    // same server - so it is accepted rather than turned into /api/stp/execute.
    expect(apiBaseFromPathSASJS('/api/stp/execute')).toBe('/api')
    expect(apiBaseFromPathSASJS('/SASjsApi/stp/execute')).toBe('/SASjsApi')
  })

  it('reads a mount of the root when the API sits at the origin', () => {
    expect(apiBaseFromPathSASJS('/')).toBe('/')
    expect(apiBaseFromPathSASJS('/stp/execute')).toBe('/')
  })

  it('stays linear on a long run of slashes', () => {
    expect(apiBaseFromPathSASJS('/api' + '/'.repeat(5000))).toBe('/api')
  })

  it('keeps the suffix constant the callers append', () => {
    expect(STP_EXECUTE_SUFFIX).toBe('/stp/execute')
    expect(`${apiBaseFromPathSASJS('/api')}${STP_EXECUTE_SUFFIX}`).toBe(
      '/api/stp/execute'
    )
  })
})

describe('apiBasePrefix', () => {
  it('contributes nothing for a root mount, so URLs do not double the slash', () => {
    // Every hand-composed path uses this: '//session' is a different URL to a
    // proxy, and it is what a root mount produced before.
    expect(apiBasePrefix('/')).toBe('')
    expect(apiBasePrefix('/api')).toBe('/api')
    expect(apiBasePrefix('/SASjsApi/')).toBe('/SASjsApi')
  })
})

describe('normaliseApiBasePath', () => {
  it('defaults to the canonical mount', () => {
    expect(DEFAULT_API_BASE_PATH).toBe('/SASjsApi')
    expect(normaliseApiBasePath()).toBe('/SASjsApi')
    expect(normaliseApiBasePath('')).toBe('/SASjsApi')
    expect(normaliseApiBasePath('   ')).toBe('/SASjsApi')
  })

  it('keeps a value of only slashes as the root mount, not the default', () => {
    // The distinction the consumers depend on: empty means "use the default",
    // '/' means "the API is at the origin".
    expect(normaliseApiBasePath('/')).toBe('/')
    expect(normaliseApiBasePath('///')).toBe('/')
    expect(normaliseApiBasePath(' / ')).toBe('/')
  })

  it('adds the leading slash the URL builders expect', () => {
    expect(normaliseApiBasePath('api')).toBe('/api')
    expect(normaliseApiBasePath('sasjs/api')).toBe('/sasjs/api')
  })

  it('drops trailing slashes so paths do not double up', () => {
    expect(normaliseApiBasePath('/api/')).toBe('/api')
    expect(normaliseApiBasePath('/api///')).toBe('/api')
  })

  it('trims whitespace around a configured value', () => {
    expect(normaliseApiBasePath(' /api ')).toBe('/api')
  })

  it('collapses a run of leading slashes, which would compose //host//api', () => {
    expect(normaliseApiBasePath('//api')).toBe('/api')
    expect(normaliseApiBasePath('///sasjs/api')).toBe('/sasjs/api')
    expect(apiBaseFromPathSASJS('//api')).toBe('/api')
  })

  it('strips a long run of slashes without backtracking', () => {
    // The input CodeQL flagged the old /\/+$/ for: a run of slashes is a
    // plausible typo, and the scan has to stay linear on it.
    expect(normaliseApiBasePath('/api' + '/'.repeat(5000))).toBe('/api')
  })

  it('keeps a mount that sits under a prefix', () => {
    expect(normaliseApiBasePath('/sasjs/api')).toBe('/sasjs/api')
  })
})
