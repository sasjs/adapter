import * as http from 'http'
import { AddressInfo } from 'net'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ServerType } from '@sasjs/utils/types'
import SASjs from '../SASjs'

jest.unmock('axios')

describe('file creation HTTP status', () => {
  let server: http.Server
  let origin: string
  let status: number
  let writes: string[]
  beforeEach(async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    writes = []
    status = 400
    server = http.createServer((req, res) => {
      req.resume()
      res.setHeader('Content-Type', 'application/json')
      if (req.url?.startsWith('/folders/folders/@item'))
        return res.end(JSON.stringify({ id: 'parent' }))
      if (req.url?.startsWith('/types/types'))
        return res.end(JSON.stringify({ items: [] }))
      writes.push(`${req.method} ${req.url}`)
      res.statusCode = status
      res.end(JSON.stringify({ message: 'secret server payload' }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve()))
    )
  })
  it.each([false, true])(
    'rejects a swallowed 502 response with force=%s',
    async (force) => {
      status = 502
      const sasjs = new SASjs({
        serverUrl: origin,
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
          undefined,
          'secret-access-token',
          force
        )
      ).rejects.toThrow(/file.*no HTTP success response/i)
      expect(writes).toHaveLength(1)
    }
  )
  it('accepts a 201 file creation response', async () => {
    status = 201
    const sasjs = new SASjs({
      serverUrl: origin,
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
        undefined,
        'token',
        false
      )
    ).resolves.toBeUndefined()
    expect(writes).toHaveLength(1)
  })
  it.each([false, true])(
    'rejects 400 file creation with force=%s without leaking secrets',
    async (force) => {
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public'
      })
      let failure: any
      try {
        await sasjs.deployServicePack(
          {
            members: [
              { type: 'file', name: 'asset.bin', code: Buffer.from('data') }
            ]
          },
          undefined,
          undefined,
          'secret-access-token',
          force
        )
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(Error)
      expect(failure.message).toMatch(/file.*400/i)
      expect(JSON.stringify(failure)).not.toContain('secret')
      expect(failure.message).not.toContain('secret')
      expect(writes).toHaveLength(1)
      expect(writes[0]).toMatch(/^POST \/files\/files\?/)
    }
  )
})
