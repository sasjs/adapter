import { ServerType } from '@sasjs/utils/types'
import { apiBasePrefix } from '../apiBasePath'
import SASjs from '../SASjs'

/**
 * One knob for SASjs Server: `pathSASJS` names the mount, and every route -
 * deploy, code execution, triggers, sessions, auth and the stored-program
 * endpoint under it - hangs off that mount.
 *
 * The stored-program endpoint is not configurable. It is `<mount>/stp/execute`,
 * appended by the callers, so the config cannot disagree with the code about
 * where it lives.
 */
const build = (config: any = {}) =>
  new SASjs({
    serverUrl: 'https://sas.example.com',
    serverType: ServerType.Sasjs,
    ...config
  })

/** The client and the executor are internal; reading them is the point. */
const clientBase = (sasjs: SASjs) => (sasjs as any).sasJSApiClient.apiBase
const executionPath = (sasjs: SASjs) => (sasjs as any).jobsPath

describe('pathSASJS', () => {
  it('defaults to the canonical mount, with the endpoint appended', () => {
    const sasjs = build()

    expect(sasjs.getSasjsConfig().pathSASJS).toBe('/SASjsApi')
    expect(clientBase(sasjs)).toBe('/SASjsApi')
    // what the executors append `?_program=` to
    expect(executionPath(sasjs)).toBe('/SASjsApi/stp/execute')
  })

  it('gives the short /api mount when configured with it', () => {
    const sasjs = build({ pathSASJS: '/api' })

    expect(sasjs.getSasjsConfig().pathSASJS).toBe('/api')
    expect(clientBase(sasjs)).toBe('/api')
    expect(executionPath(sasjs)).toBe('/api/stp/execute')
  })

  it('normalises the mount before using it', () => {
    const sasjs = build({ pathSASJS: ' api/ ' })

    expect(clientBase(sasjs)).toBe('/api')
    expect(executionPath(sasjs)).toBe('/api/stp/execute')
  })

  it('accepts the full endpoint spelling, reading it as the mount', () => {
    // Earlier documentation told people to write the endpoint; it names the
    // same server, so it keeps working.
    const sasjs = build({ pathSASJS: '/api/stp/execute' })

    expect(clientBase(sasjs)).toBe('/api')
    expect(executionPath(sasjs)).toBe('/api/stp/execute')
  })

  it('moves everything when the mount is set later', async () => {
    const sasjs = build()
    expect(clientBase(sasjs)).toBe('/SASjsApi')

    await sasjs.setSASjsConfig({ pathSASJS: '/api' })

    expect(clientBase(sasjs)).toBe('/api')
    expect(executionPath(sasjs)).toBe('/api/stp/execute')
  })

  it('keeps a root mount on one mount, not two', () => {
    // '/' is a documented shape - a proxy that puts the API at the origin. It
    // used to give the executors '//stp/execute' while the client and the auth
    // calls normalised to '/SASjsApi': two mounts at once, which is the split
    // this PR exists to prevent.
    const sasjs = build({ pathSASJS: '/' })

    expect(clientBase(sasjs)).toBe('/')
    expect(executionPath(sasjs)).toBe('/stp/execute')
  })

  it('leaves a Viya project alone - it never reads pathSASJS', () => {
    const sasjs = new SASjs({
      serverUrl: 'https://viya.example.com',
      serverType: ServerType.SasViya,
      pathSASJS: '/not/a/mount'
    })

    expect(sasjs.getSasjsConfig().pathSASViya).toBe('/SASJobExecution')
    expect(executionPath(sasjs)).toBe('/SASJobExecution')
  })

  it('leaves a SAS 9 project alone - it never reads pathSASJS', () => {
    const sasjs = new SASjs({
      serverUrl: 'https://sas9.example.com',
      serverType: ServerType.Sas9,
      pathSASJS: '/not/a/mount'
    })

    expect(executionPath(sasjs)).toBe('/SASStoredProcess/do')
    expect(sasjs.getApiBasePath()).toBe('/SASjsApi')
  })
})

/**
 * The surface a consumer compiles against.
 *
 * A case that calls the accessor through this interface is the type-level
 * proof: ts-jest type-checks this file, so `private getApiBasePath()` fails the
 * suite with ts(2341) rather than passing a call made through `as any` (which
 * is the only way the earlier cases could reach it, and is why they read the
 * internals instead).
 */
interface MountReader {
  getApiBasePath(): string
}

const readMount = (reader: MountReader) => reader.getApiBasePath()

/**
 * `getApiBasePath()` is the read side of `pathSASJS`, and public: a consumer
 * composing `<mount>/stp/execute` for a `?_program=` link, or a route for the
 * drive and info endpoints, asks here rather than re-implementing the
 * normalisation or deep-importing `apiBasePath`.
 *
 * The other half of what this pins is the distinction from `getSasjsConfig()`:
 * that reports what the caller configured, this reports the mount it means, and
 * neither is allowed to start answering the other's question.
 */
describe('getApiBasePath', () => {
  it('is reachable as a public member, not just through the internals', () => {
    const sasjs = build({ pathSASJS: '/api/' })

    // no `as any`, no cast: this is the call a TypeScript consumer makes
    expect(readMount(sasjs)).toBe('/api')
  })

  it('answers the default mount when nothing is configured', () => {
    expect(build().getApiBasePath()).toBe('/SASjsApi')
    expect(build({ pathSASJS: '' }).getApiBasePath()).toBe('/SASjsApi')
  })

  it('answers the normalised mount, which is what every route uses', () => {
    // The invariant worth more than the individual shapes: the public answer
    // and the base the SASjs API client sends to cannot drift apart.
    const cases: [string, string][] = [
      ['/api', '/api'],
      ['/api/', '/api'],
      [' api/ ', '/api'],
      ['/sasjs/api', '/sasjs/api']
    ]

    for (const [pathSASJS, expected] of cases) {
      const sasjs = build({ pathSASJS })

      expect(sasjs.getApiBasePath()).toBe(expected)
      expect(clientBase(sasjs)).toBe(expected)
      expect(executionPath(sasjs)).toBe(`${expected}/stp/execute`)
    }
  })

  it('reads a value carrying the endpoint as the mount it names', () => {
    const sasjs = build({ pathSASJS: '/api/stp/execute' })

    expect(sasjs.getApiBasePath()).toBe('/api')
    // and the endpoint is not doubled by a caller that appends it
    expect(`${sasjs.getApiBasePath()}/stp/execute`).toBe('/api/stp/execute')
  })

  it('reports the mount while getSasjsConfig() reports the config', () => {
    // The 6.0.0 note claimed the config reads back as the mount. It does not,
    // and normalising on read would make getSasjsConfig() stop answering what
    // the caller set - so the two are separate, and this says which is which.
    const sasjs = build({ pathSASJS: '/api/' })

    expect(sasjs.getSasjsConfig().pathSASJS).toBe('/api/')
    expect(sasjs.getApiBasePath()).toBe('/api')
  })

  it('keeps a root mount as / and leaves the collapse to apiBasePrefix', () => {
    // '/' is a real deployment - a proxy with the API at the origin. A caller
    // concatenating onto it wants `apiBasePrefix` (which answers '') rather
    // than the mount verbatim, so the two are documented apart.
    const sasjs = build({ pathSASJS: '/' })

    expect(sasjs.getApiBasePath()).toBe('/')
    expect(`${apiBasePrefix(sasjs.getApiBasePath())}/stp/execute`).toBe(
      '/stp/execute'
    )
    expect(executionPath(sasjs)).toBe('/stp/execute')
  })

  it('follows a mount set after construction', async () => {
    const sasjs = build()
    expect(sasjs.getApiBasePath()).toBe('/SASjsApi')

    await sasjs.setSASjsConfig({ pathSASJS: '/api' })

    expect(sasjs.getApiBasePath()).toBe('/api')
    expect(sasjs.getApiBasePath()).toBe(clientBase(sasjs))
  })

  it('answers the default for a server type that never reads pathSASJS', () => {
    const viya = new SASjs({
      serverUrl: 'https://viya.example.com',
      serverType: ServerType.SasViya,
      pathSASJS: '/api'
    })

    expect(viya.getApiBasePath()).toBe('/SASjsApi')
  })
})
