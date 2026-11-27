import * as http from 'http'
import { AddressInfo } from 'net'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { RequestClient } from '../request/RequestClient'
import SASjs from '../SASjs'
import { ServerType } from '@sasjs/utils/types'

jest.unmock('axios')

describe('HTTP errors in verbose mode', () => {
  let server: http.Server
  let origin: string
  let conflictMessage: string
  let updated: Buffer
  let updateIfMatch: string | undefined
  beforeEach(async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    conflictMessage = 'unknown conflict'
    updated = Buffer.alloc(0)
    updateIfMatch = undefined
    server = http.createServer((req, res) => {
      if (
        req.method === 'PUT' &&
        req.url === '/files/files/11111111-2222-3333-4444-555555555555/content'
      ) {
        updateIfMatch = req.headers['if-match']
        req.on('data', (chunk) => {
          updated = Buffer.concat([updated, chunk])
        })
        req.on('end', () => {
          res.statusCode = 200
          res.end()
        })
        return
      }
      if (req.url?.startsWith('/types/types')) {
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ items: [] }))
      }
      if (req.url?.startsWith('/folders/folders/@item')) {
        res.setHeader('Content-Type', 'application/json')
        return res.end(
          JSON.stringify({ id: 'cc4760b1-e3de-40d4-916c-950cb4e40128' })
        )
      }
      if (req.url?.includes('/members?')) {
        res.setHeader('Content-Type', 'application/json')
        return res.end(
          JSON.stringify({
            count: 1,
            items: [
              {
                name: 'asset.bin',
                contentType: 'file',
                uri: '/files/files/11111111-2222-3333-4444-555555555555'
              }
            ]
          })
        )
      }
      if (
        req.method === 'GET' &&
        req.url === '/files/files/11111111-2222-3333-4444-555555555555'
      ) {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('ETag', '"v1"')
        return res.end(
          JSON.stringify({
            id: '11111111-2222-3333-4444-555555555555',
            name: 'asset.bin'
          })
        )
      }
      res.statusCode = 409
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          message: conflictMessage,
          errorCode: 0,
          httpStatusCode: 409
        })
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve()))
    )
  })
  it('preserves errors when a browser response has no Node raw headers', () => {
    const client = new RequestClient(origin)
    const error = {
      message: 'browser failure',
      response: { status: 409, request: {}, data: {} }
    }
    try {
      ;(client as any).handleAxiosError(error)
      throw new Error('Expected rejection')
    } catch (caught) {
      expect(caught).toBe(error)
    }
  })
  it.each([false, true, 'bleached'] as const)(
    'deployment replaces recognized duplicate in mode %s',
    async (verbose) => {
      conflictMessage =
        'File with name "asset.bin" already exists in folder "cc4760b1-e3de-40d4-916c-950cb4e40128".'
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public',
        verbose
      })
      await expect(
        sasjs.deployServicePack(
          {
            members: [
              { type: 'file', name: 'asset.bin', code: Buffer.from('data') }
            ]
          },
          undefined,
          undefined,
          'token',
          true
        )
      ).resolves.toBeUndefined()
      expect(updated).toEqual(Buffer.from('data'))
      expect(updateIfMatch).toBe('"v1"')
    }
  )
  it.each([false, true, 'bleached'] as const)(
    'deployment rejects unknown POST conflict in mode %s',
    async (verbose) => {
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public',
        verbose
      })
      await expect(
        sasjs.deployServicePack(
          {
            members: [
              { type: 'file', name: 'asset.bin', code: Buffer.from('data') }
            ]
          },
          undefined,
          undefined,
          'token',
          true
        )
      ).rejects.toMatchObject({
        response: { status: 409, data: { message: 'unknown conflict' } }
      })
    }
  )
  it.each([false, true, 'bleached'] as const)(
    'preserves POST 409 in mode %s',
    async (verbose) => {
      const client = new RequestClient(origin, undefined, undefined, verbose)
      await expect(
        client.post('/files/files', 'data', undefined)
      ).rejects.toMatchObject({
        response: { status: 409, data: { message: 'unknown conflict' } },
        config: { method: 'post' }
      })
    }
  )
})
