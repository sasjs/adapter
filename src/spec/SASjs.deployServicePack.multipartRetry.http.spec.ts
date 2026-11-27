import * as http from 'http'
import { AddressInfo } from 'net'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ServerType } from '@sasjs/utils/types'
import SASjs from '../SASjs'

jest.unmock('axios')

describe('Viya deployment multipart CSRF retry', () => {
  it('replays complete file bytes with a matching boundary after a 403', async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    const attempts: { body: Buffer; type: string; csrf: string | undefined }[] =
      []
    const server = http.createServer((req, res) => {
      if (req.url?.startsWith('/folders/folders/@item')) {
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ id: 'parent' }))
      }
      if (req.url?.startsWith('/types/types')) {
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ items: [] }))
      }
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        attempts.push({
          body: Buffer.concat(chunks),
          type: req.headers['content-type'] || '',
          csrf: req.headers['x-csrf-token'] as string | undefined
        })
        if (attempts.length === 1) {
          res.writeHead(403, {
            'x-csrf-header': 'x-csrf-token',
            'x-csrf-token': 'renewed'
          })
          res.end()
        } else {
          res.writeHead(201, { 'Content-Type': 'application/json' })
          res.end('{}')
        }
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const sasjs = new SASjs({
      serverUrl: origin,
      serverType: ServerType.SasViya,
      appLoc: '/Public'
    })
    let timer: NodeJS.Timeout | undefined
    try {
      await Promise.race([
        sasjs.deployServicePack(
          {
            members: [
              {
                type: 'file',
                name: 'asset.bin',
                code: Buffer.from([0, 255, 42])
              }
            ]
          },
          undefined,
          undefined,
          'token',
          false
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('multipart retry timed out')),
            1500
          )
        })
      ])
      expect(attempts).toHaveLength(2)
      expect(attempts[1].csrf).toBe('renewed')
      for (const attempt of attempts) {
        const boundary = /boundary=([^;]+)/.exec(attempt.type)?.[1]
        expect(boundary).toBeTruthy()
        expect(attempt.body.includes(Buffer.from([0, 255, 42]))).toBe(true)
        expect(attempt.body.includes(Buffer.from(`--${boundary}--`))).toBe(true)
      }
    } finally {
      if (timer) clearTimeout(timer)
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
