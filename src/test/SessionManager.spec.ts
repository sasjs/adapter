import { SessionManager } from '../SessionManager'
import * as dotenv from 'dotenv'
import { RequestClient } from '../request/RequestClient'
import axios from 'axios'
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('SessionManager', () => {
  dotenv.config()

  const sessionManager = new SessionManager(
    process.env.SERVER_URL as string,
    process.env.DEFAULT_COMPUTE_CONTEXT as string,
    new RequestClient('https://sample.server.com')
  )

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

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: sampleResponse })
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
