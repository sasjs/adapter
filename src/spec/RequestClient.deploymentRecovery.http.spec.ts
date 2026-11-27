import * as http from 'http'
import { AddressInfo } from 'net'
import { RequestClient } from '../request/RequestClient'

jest.unmock('axios')

describe('restricted deployment recovery over HTTP', () => {
  it.each([
    [400, 'invalid csrf token!'],
    [200, '<form action="/SASLogon/oauth/authorize">']
  ])(
    'does not replay a write on recovery response %s',
    async (status, body) => {
      const events: string[] = []
      const server = http.createServer((req, res) => {
        events.push(`${req.method} ${req.url}`)
        if (req.method === 'POST') {
          if (events.filter((event) => event.startsWith('POST')).length > 3) {
            res.statusCode = 500
            return res.end('stop')
          }
          res.statusCode = status as number
          return res.end(body as string)
        }
        res.end('ok')
      })
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
      )
      try {
        const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
        const client = new RequestClient(origin)
        client.restrictDeploymentTransport()
        await expect(client.post('/write', {}, 'token')).rejects.toThrow()
        expect(events).toEqual(['POST /write'])
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        )
      }
    }
  )
})
