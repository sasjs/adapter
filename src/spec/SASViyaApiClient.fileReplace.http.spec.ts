import * as http from 'http'
import { AddressInfo } from 'net'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { SASViyaApiClient } from '../SASViyaApiClient'
import { RequestClient } from '../request/RequestClient'

jest.unmock('axios')

const id = 'cc4760b1-e3de-40d4-916c-950cb4e40128'
describe('conditional file replacement over HTTP', () => {
  let server: http.Server
  let origin: string
  let status: number
  let listStatus: number
  let resourceStatus: number
  let putCount: number
  let payload: Buffer
  let ifMatch: string | undefined
  let resourceName: string
  beforeEach(async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    status = 200
    listStatus = 200
    resourceStatus = 200
    putCount = 0
    resourceName = 'asset.json'
    payload = Buffer.alloc(0)
    server = http.createServer((req, res) => {
      if (req.url?.includes('/members?')) {
        res.statusCode = listStatus
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            count: 1,
            items: [
              {
                name: 'asset.json',
                contentType: 'file',
                uri: `/files/files/${id}`
              }
            ]
          })
        )
      } else if (req.method === 'GET') {
        res.statusCode = resourceStatus
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('ETag', '"version1"')
        res.end(
          JSON.stringify({
            id,
            name: resourceName,
            contentType: 'application/json'
          })
        )
      } else {
        putCount++
        ifMatch = req.headers['if-match']
        req.on('data', (chunk) => {
          payload = Buffer.concat([payload, chunk])
        })
        req.on('end', () => {
          res.statusCode = status
          res.end()
        })
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve()))
    )
  })
  const replace = (content: any, hardened = true) =>
    new SASViyaApiClient(
      origin,
      '/Public',
      'context',
      hardened
        ? new RequestClient(origin).forDeployment(origin)
        : new RequestClient(origin)
    ).replaceConflictingFile(
      'asset.json',
      content,
      '/Public',
      `/folders/folders/${id}`,
      'token',
      {
        response: {
          status: 409,
          data: {
            errorCode: 0,
            httpStatusCode: 409,
            message: `File with name "asset.json" already exists in folder "${id}".`
          }
        }
      }
    )
  it('refuses direct replacement over an ordinary redirect-following client', async () => {
    await expect(replace('data', false)).rejects.toThrow(
      /deployment transport/i
    )
    expect(putCount).toBe(0)
  })
  it('refuses an API server different from the hardened client origin', async () => {
    const client = new SASViyaApiClient(
      origin,
      '/Public',
      'context',
      new RequestClient('http://127.0.0.1:1').forDeployment(
        'http://127.0.0.1:1'
      )
    )
    await expect(
      client.replaceConflictingFile(
        'asset.json',
        'data',
        '/Public',
        `/folders/folders/${id}`,
        'token',
        {
          response: {
            status: 409,
            data: {
              errorCode: 0,
              httpStatusCode: 409,
              message: `File with name "asset.json" already exists in folder "${id}".`
            }
          }
        }
      )
    ).rejects.toThrow(/deployment transport/i)
    expect(putCount).toBe(0)
  })
  it('refuses replacement after a hardened client is reconfigured', async () => {
    const rc = new RequestClient(origin).forDeployment(origin)
    rc.setConfig(origin)
    const client = new SASViyaApiClient(origin, '/Public', 'context', rc)
    await expect(
      client.replaceConflictingFile(
        'asset.json',
        'data',
        '/Public',
        `/folders/folders/${id}`,
        'token',
        {}
      )
    ).rejects.toThrow(/deployment transport/i)
    expect(putCount).toBe(0)
  })
  it.each(['list', 'resource'])(
    'rejects a 400 %s GET even with a valid-looking body',
    async (which) => {
      if (which === 'list') listStatus = 400
      else resourceStatus = 400
      await expect(replace(Buffer.from('data'))).rejects.toBeDefined()
      expect(putCount).toBe(0)
    }
  )
  it('does not PUT when the listed file was renamed before the resource GET', async () => {
    resourceName = 'renamed.json'
    await expect(replace(Buffer.from('data'))).rejects.toBeDefined()
    expect(putCount).toBe(0)
  })
  it.each([' { "key" : "é" }\n', Buffer.from([0, 255, 42])])(
    'preserves the exact content bytes and sends the file ETag',
    async (content) => {
      await expect(replace(content)).resolves.toBeUndefined()
      expect(putCount).toBe(1)
      expect(ifMatch).toBe('"version1"')
      expect(payload).toEqual(Buffer.from(content))
    }
  )
  it('sends only the bytes of a nonzero-offset Uint8Array view', async () => {
    const backing = new Uint8Array([99, 0, 255, 42, 88])
    await expect(replace(backing.subarray(1, 4))).resolves.toBeUndefined()
    expect(putCount).toBe(1)
    expect(payload).toEqual(Buffer.from([0, 255, 42]))
  })
  it.each([400, 412, 502])('rejects PUT status %i', async (code) => {
    status = code
    await expect(replace('data')).rejects.toBeDefined()
    expect(putCount).toBe(1)
  })
})
