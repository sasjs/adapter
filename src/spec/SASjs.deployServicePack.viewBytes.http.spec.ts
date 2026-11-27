import * as http from 'http'
import { AddressInfo } from 'net'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ServerType } from '@sasjs/utils/types'
import SASjs from '../SASjs'

jest.unmock('axios')

const folderId = 'cc4760b1-e3de-40d4-916c-950cb4e40128'
const fileId = '11111111-2222-3333-4444-555555555555'

function multipartFile(body: Buffer, contentType: string): Buffer {
  const boundary = /boundary=([^;]+)/.exec(contentType)?.[1]
  if (!boundary) throw new Error('Missing multipart boundary')
  const start = body.indexOf(Buffer.from('\r\n\r\n'))
  const end = body.indexOf(Buffer.from(`\r\n--${boundary}--`), start + 4)
  if (start < 0 || end < 0) throw new Error('Invalid multipart body')
  return body.subarray(start + 4, end)
}

describe('Viya deploy file byte views over HTTP', () => {
  let server: http.Server
  let origin: string
  let uploads: Buffer[]
  let replacements: Buffer[]
  let conflict: boolean

  beforeEach(async () => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    uploads = []
    replacements = []
    conflict = false
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      if (req.url?.startsWith('/folders/folders/@item'))
        return res.end(JSON.stringify({ id: folderId }))
      if (req.url?.startsWith('/types/types'))
        return res.end(JSON.stringify({ items: [] }))
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
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        const body = Buffer.concat(chunks)
        if (req.method === 'POST' && req.url?.startsWith('/files/files?')) {
          uploads.push(multipartFile(body, req.headers['content-type'] || ''))
          if (conflict) {
            res.statusCode = 409
            return res.end(
              JSON.stringify({
                errorCode: 0,
                httpStatusCode: 409,
                message: `File with name "asset.bin" already exists in folder "${folderId}".`
              })
            )
          }
          res.statusCode = 201
          return res.end('{}')
        }
        if (
          req.method === 'PUT' &&
          req.url === `/files/files/${fileId}/content`
        ) {
          replacements.push(body)
          return res.end('{}')
        }
        res.statusCode = 404
        res.end('{}')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    )
  })

  it.each([
    [
      'Uint8Array',
      () => new Uint8Array([99, 0, 255, 42, 88]).subarray(1, 4),
      [0, 255, 42]
    ],
    [
      'Buffer',
      () => Buffer.from([99, 0, 255, 42, 88]).subarray(1, 4),
      [0, 255, 42]
    ],
    [
      'DataView',
      () => new DataView(new Uint8Array([99, 0, 255, 42, 88]).buffer, 1, 3),
      [0, 255, 42]
    ],
    [
      'Uint16Array',
      () =>
        new Uint16Array(
          new Uint8Array([99, 98, 0, 255, 42, 17, 88, 77]).buffer,
          2,
          2
        ),
      [0, 255, 42, 17]
    ],
    ['empty view', () => new Uint8Array([99, 88]).subarray(1, 1), []]
  ])(
    'uploads and replaces exactly the %s byte range',
    async (_name, makeContent, expectedBytes) => {
      const content = makeContent()
      const expected = Buffer.from(expectedBytes)
      const sasjs = new SASjs({
        serverUrl: origin,
        serverType: ServerType.SasViya,
        appLoc: '/Public'
      })
      const deploy = () =>
        sasjs.deployServicePack(
          {
            members: [{ type: 'file', name: 'asset.bin', code: content as any }]
          },
          undefined,
          undefined,
          'token',
          true
        )
      await deploy()
      conflict = true
      await deploy()
      expect(uploads).toEqual([expected, expected])
      expect(replacements).toEqual([expected])
    }
  )
})
