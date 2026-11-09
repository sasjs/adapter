import { ServerType } from '@sasjs/utils/types'
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
})
