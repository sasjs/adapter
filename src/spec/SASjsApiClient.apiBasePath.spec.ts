import { SASjsApiClient } from '../SASjsApiClient'

/**
 * The mount the SASjs Server API answers on is configurable, because a project
 * may prefer the short `/api` that sasjs/server also serves. The default stays
 * `/SASjsApi`: an adapter release is used against servers of many vintages, and
 * an older one answers nothing else.
 */
const mockPost = jest.fn()
const mockRequestClient = { post: mockPost }

const client = (apiBasePath?: string) =>
  new SASjsApiClient(mockRequestClient as any, apiBasePath)

const okDeploy = () => mockPost.mockResolvedValue({ result: { status: 'OK' } })

describe('SASjsApiClient apiBasePath', () => {
  beforeEach(() => {
    mockPost.mockReset()
    okDeploy()
  })

  it('defaults to the canonical mount, relative', async () => {
    await client().deploy({} as any, '/app')

    // relative, not absolute: a serverUrl may carry a path prefix, and a
    // leading slash would drop it
    expect(mockPost.mock.calls[0][0]).toBe('SASjsApi/drive/deploy')
  })

  it('uses the configured mount for a request', async () => {
    await client('/api').deploy({} as any, '/app')

    expect(mockPost.mock.calls[0][0]).toBe('api/drive/deploy')
  })

  it('sends the auth exchange to the configured mount', async () => {
    // Dropping `this.apiBase` from getAccessToken would leave login on
    // /SASjsApi while every other request moved to /api - the two-mounts-at-once
    // split this PR exists to prevent - so the wiring is pinned here.
    mockPost.mockResolvedValue({
      result: { accessToken: 'access', refreshToken: 'refresh' }
    })

    await client('/api').getAccessToken('cl13nt', 'c0de')

    expect(mockPost.mock.calls[0][0]).toBe('/api/auth/token')
  })

  it('sends the token refresh to the configured mount', async () => {
    mockPost.mockResolvedValue({
      result: { accessToken: 'access', refreshToken: 'refresh' }
    })

    await client('/api').refreshTokens('refresh-t0ken')

    expect(mockPost.mock.calls[0][0]).toBe('/api/auth/refresh')
  })

  it('composes session links at a root mount without doubling the slash', async () => {
    // A caller does `${serverUrl}${href}`, so a root mount must not produce
    // '//session/abc/state'.
    mockPost.mockResolvedValue({ result: { sessionId: 'abc' } })

    const { job } = await client('/').startComputeJob(
      'x',
      '/app',
      {} as any,
      undefined,
      false
    )
    const links = (job as any).links as { rel: string; href: string }[]

    expect(links.find((l) => l.rel === 'state')!.href).toBe(
      '/session/abc/state'
    )
    expect(links.find((l) => l.rel === 'log')!.href).toBe('/session/abc/log')
    expect(links.find((l) => l.rel === 'self')!.href).toBe('/session/abc')
  })

  it('tidies the value: no trailing slash, and a leading one is optional', async () => {
    await client('/api/').deploy({} as any, '/app')
    expect(mockPost.mock.calls[0][0]).toBe('api/drive/deploy')

    mockPost.mockReset()
    okDeploy()
    await client('sasjs/api').deploy({} as any, '/app')
    expect(mockPost.mock.calls[0][0]).toBe('sasjs/api/drive/deploy')
  })

  it('builds the session links on the configured mount', async () => {
    mockPost.mockResolvedValue({ result: { sessionId: 'abc' } })

    const { job } = await client('/api').startComputeJob(
      'prog',
      {},
      { appLoc: '/app' },
      undefined,
      false
    )

    const hrefs = (job as any).links.map((link: any) => link.href)

    // absolute here: a caller composes `${serverUrl}${href}`
    expect(hrefs).toContain('/api/session/abc/state')
    expect(hrefs).toContain('/api/session/abc/log')
    expect(hrefs).toContain('/api/session/abc')
  })
})
