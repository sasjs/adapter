import * as http from 'http'
import { AddressInfo } from 'net'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ServerType } from '@sasjs/utils/types'
import SASjs from '../SASjs'

jest.unmock('axios')

const folderId = 'cc4760b1-e3de-40d4-916c-950cb4e40128'
const fileId = '11111111-2222-3333-4444-555555555555'

describe('deploy origin over HTTP', () => {
  const servers: http.Server[] = []
  const requests: {
    server: string
    method?: string
    url?: string
    auth?: string
    csrf?: string
  }[] = []
  let patchUri: string | undefined
  let redirectPatchTo: string | undefined
  let redirectMethod: string | undefined
  let redirectPath: string | undefined
  let challengePatch = false
  const start = async (name: string) => {
    const server = http.createServer((req, res) => {
      requests.push({
        server: name,
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        csrf: req.headers['x-old-csrf'] as string | undefined
      })
      req.resume()
      if (name === 'selected' && req.method === 'PATCH' && challengePatch) {
        challengePatch = false
        res.statusCode = 403
        res.setHeader('x-csrf-header', 'x-old-csrf')
        res.setHeader('x-old-csrf', 'new-csrf')
        return res.end()
      }
      if (
        name === 'selected' &&
        redirectPatchTo &&
        req.method === (redirectMethod || 'PATCH') &&
        (!redirectPath || req.url?.startsWith(redirectPath))
      ) {
        res.statusCode = 307
        res.setHeader('Location', redirectPatchTo)
        return res.end()
      }
      res.setHeader('Content-Type', 'application/json')
      if (req.url?.startsWith('/types/types'))
        return res.end(
          JSON.stringify({
            items: patchUri
              ? [{ extensions: ['bin'], name: 'file', properties: { x: 'y' } }]
              : []
          })
        )
      if (req.url?.includes('/members?'))
        return res.end(
          JSON.stringify({
            count: 1,
            items: [
              {
                name: 'asset.bin',
                contentType: 'file',
                uri: `/files/files/${fileId}`
              }
            ]
          })
        )
      if (req.url?.startsWith('/folders/folders/@item'))
        return res.end(JSON.stringify({ id: folderId }))
      if (req.method === 'GET' && req.url === `/files/files/${fileId}`) {
        res.setHeader('ETag', '"v1"')
        return res.end(
          JSON.stringify({
            id: fileId,
            name: 'asset.bin',
            contentType: 'application/octet-stream'
          })
        )
      }
      if (req.method === 'POST' && req.url?.startsWith('/files/files')) {
        if (patchUri) {
          res.statusCode = 201
          return res.end(
            JSON.stringify({
              links: [{ method: 'PATCH', rel: 'patch', uri: patchUri }]
            })
          )
        }
        res.statusCode = 409
        return res.end(
          JSON.stringify({
            errorCode: 0,
            httpStatusCode: 409,
            message: `File with name "asset.bin" already exists in folder "${folderId}".`
          })
        )
      }
      res.statusCode = 200
      res.end(JSON.stringify({ id: folderId }))
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }
  afterEach(async () => {
    await Promise.all(
      servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve, reject) =>
              server.close((e) => (e ? reject(e) : resolve()))
            )
        )
    )
    requests.length = 0
    patchUri = undefined
    redirectPatchTo = undefined
    redirectMethod = undefined
    redirectPath = undefined
    challengePatch = false
  })
  it('does not send deployment credentials to a cross-origin PATCH redirect', async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    const attacker = await start('attacker')
    const origin = await start('selected')
    patchUri = `/files/files/${fileId}`
    redirectPatchTo = `${attacker}/capture`
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public'
    })
    ;(sasjs as any).requestClient.csrfToken = {
      headerName: 'x-old-csrf',
      value: 'secret-csrf'
    }
    const deployment = sasjs.deployServicePack(
      {
        members: [
          { type: 'file', name: 'asset.bin', code: Buffer.from('data') }
        ]
      },
      '/Other',
      undefined,
      'secret-token'
    )
    const failure = await deployment.then(
      () => undefined,
      (error) => error
    )
    expect(requests.filter((r) => r.server === 'attacker')).toEqual([])
    expect(failure).toBeDefined()
    expect(requests).toContainEqual({
      server: 'selected',
      method: 'PATCH',
      url: patchUri,
      auth: 'Bearer secret-token',
      csrf: 'secret-csrf'
    })
  })
  it('blocks a redirect after a CSRF challenge and retry', async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    const attacker = await start('attacker')
    const origin = await start('selected')
    patchUri = `/files/files/${fileId}`
    redirectPatchTo = `${attacker}/capture`
    challengePatch = true
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public'
    })
    const failure = await sasjs
      .deployServicePack(
        {
          members: [
            { type: 'file', name: 'asset.bin', code: Buffer.from('data') }
          ]
        },
        undefined,
        undefined,
        'secret-token'
      )
      .then(
        () => undefined,
        (error) => error
      )
    expect(requests.filter((r) => r.server === 'attacker')).toEqual([])
    expect(failure).toBeDefined()
    const patches = requests.filter((r) => r.method === 'PATCH')
    expect(patches).toHaveLength(2)
    expect(patches[1].csrf).toBe('new-csrf')
  })
  it('stops folder deployment when its folder lookup redirects', async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    const attacker = await start('attacker')
    const origin = await start('selected')
    redirectPatchTo = `${attacker}/capture`
    redirectMethod = 'GET'
    redirectPath = '/folders/folders/@item'
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public/app'
    })
    await expect(
      sasjs.deployServicePack(
        { members: [{ type: 'folder', name: 'nested', members: [] }] },
        undefined,
        undefined,
        'token'
      )
    ).rejects.toBeDefined()
    expect(requests.filter((r) => r.server === 'attacker')).toEqual([])
    expect(requests).toHaveLength(1)
  })
  it.each([
    ['GET', '/types/types'],
    ['POST', '/files/files'],
    ['GET', '/folders/folders/@item'],
    ['GET', '/folders/folders/'],
    ['GET', `/files/files/${fileId}`],
    ['PUT', `/files/files/${fileId}/content`]
  ])('refuses a cross-origin redirect during %s %s', async (method, path) => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    const attacker = await start('attacker')
    const origin = await start('selected')
    redirectPatchTo = `${attacker}/capture`
    redirectMethod = method
    redirectPath = path
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public'
    })
    ;(sasjs as any).requestClient.csrfToken = {
      headerName: 'x-old-csrf',
      value: 'secret-csrf'
    }
    const failure = await sasjs
      .deployServicePack(
        {
          members: [
            { type: 'file', name: 'asset.bin', code: Buffer.from('data') }
          ]
        },
        undefined,
        undefined,
        'secret-token',
        true
      )
      .then(
        () => undefined,
        (error) => error
      )
    expect(requests.filter((r) => r.server === 'attacker')).toEqual([])
    expect(failure).toBeDefined()
    expect(
      requests.some(
        (r) =>
          r.server === 'selected' &&
          r.method === method &&
          r.url?.startsWith(path) &&
          r.csrf === 'secret-csrf'
      )
    ).toBe(true)
  })
  it.each(['absolute', 'disguised'])(
    'refuses a cross-origin %s file patch link before sending credentials',
    async (kind) => {
      ;(process as any).logger = new Logger(LogLevel.Off)
      const oldOrigin = await start('old')
      const selectedOrigin = await start('selected')
      patchUri =
        kind === 'absolute'
          ? `${oldOrigin}/files/files/${fileId}`
          : `/\t/${new URL(oldOrigin).host}/files/files/${fileId}`
      const sasjs = new SASjs({
        serverUrl: oldOrigin,
        serverType: ServerType.SasViya,
        appLoc: '/Public'
      })
      await expect(
        sasjs.deployServicePack(
          {
            members: [
              { type: 'file', name: 'asset.bin', code: Buffer.from('data') }
            ]
          },
          undefined,
          selectedOrigin,
          'selected-token'
        )
      ).rejects.toThrow()
      expect(requests.filter((r) => r.server === 'old')).toEqual([])
    }
  )
  it('keeps same-server CSRF credentials for an appLoc override and follows a same-origin patch link', async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    const origin = await start('selected')
    patchUri = `/files/files/${fileId}`
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public'
    })
    ;(sasjs as any).requestClient.csrfToken = {
      headerName: 'x-old-csrf',
      value: 'same-server-csrf'
    }
    await expect(
      sasjs.deployServicePack(
        {
          members: [
            { type: 'file', name: 'asset.bin', code: Buffer.from('data') }
          ]
        },
        '/Other',
        undefined,
        'same-server-token'
      )
    ).resolves.toBeUndefined()
    expect(
      requests.every(
        (r) =>
          r.auth === 'Bearer same-server-token' && r.csrf === 'same-server-csrf'
      )
    ).toBe(true)
    expect(
      requests.some((r) => r.method === 'PATCH' && r.url === patchUri)
    ).toBe(true)
  })
  it('uses only the selected server and does not send old-server CSRF credentials', async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    const oldOrigin = await start('old')
    const selectedOrigin = await start('selected')
    const sasjs = new SASjs({
      serverUrl: oldOrigin,
      serverType: ServerType.SasViya,
      appLoc: '/Public'
    })
    ;(sasjs as any).requestClient.csrfToken = {
      headerName: 'x-old-csrf',
      value: 'old-secret'
    }
    await sasjs.deployServicePack(
      {
        members: [
          { type: 'file', name: 'asset.bin', code: Buffer.from('new') },
          {
            type: 'folder',
            name: 'nested',
            members: [{ type: 'service', name: 'job', code: 'run;' }]
          }
        ]
      },
      undefined,
      selectedOrigin,
      'selected-token',
      true
    )
    expect(requests.filter((r) => r.server === 'old')).toEqual([])
    expect(
      requests.every((r) => r.auth === 'Bearer selected-token' && !r.csrf)
    ).toBe(true)
    expect(
      requests.some(
        (r) => r.method === 'POST' && r.url?.startsWith('/files/files')
      )
    ).toBe(true)
    expect(
      requests.some(
        (r) => r.method === 'PUT' && r.url === `/files/files/${fileId}/content`
      )
    ).toBe(true)
    expect(
      requests.some(
        (r) => r.method === 'POST' && r.url?.startsWith('/folders/folders?')
      )
    ).toBe(true)
    expect(
      requests.some(
        (r) =>
          r.method === 'POST' &&
          r.url?.startsWith('/jobDefinitions/definitions?')
      )
    ).toBe(true)
  })
})
