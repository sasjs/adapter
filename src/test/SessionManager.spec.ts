import { SessionManager } from '../SessionManager'
import * as dotenv from 'dotenv'

describe('SessionManager', () => {
  dotenv.config()

  let originalFetch: any

  const sessionManager = new SessionManager(
    process.env.SERVER_URL as string,
    process.env.DEFAULT_COMPUTE_CONTEXT as string,
    () => {}
  )

  beforeAll(() => {
    originalFetch = (global as any).fetch
  })

  afterEach(() => {
    ;(global as any).fetch = originalFetch
  })

  describe('getVariable', () => {
    it('should fetch session variable', async () => {
      const sampleResponse = {
        ok: true,
        links: [],
        name: 'SYSJOBID',
        scope: 'GLOBAL',
        value: '25218',
        version: 1
      }

      ;(global as any).fetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          headers: { get: () => '' },
          json: () => Promise.resolve(sampleResponse)
        })
      )

      const expectedResponse = { etag: '', result: sampleResponse }

      await expect(
        sessionManager.getVariable(
          'fakeSessionId',
          'SYSJOBID',
          'fakeAccessToken'
        )
      ).resolves.toEqual(expectedResponse)
    })
  })
})
