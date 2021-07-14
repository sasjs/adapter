import { SessionManager } from '../SessionManager'
import { RequestClient } from '../request/RequestClient'
import { NoSessionStateError } from '../types/errors'
import * as dotenv from 'dotenv'
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

      const expectedResponse = {
        etag: '',
        result: sampleResponse
      }

      await expect(
        sessionManager.getVariable(
          'fakeSessionId',
          'SYSJOBID',
          'fakeAccessToken'
        )
      ).resolves.toEqual(expectedResponse)
    })
  })

  describe('waitForSession', () => {
    it('should reject with NoSessionStateError if SAS server did not provide session state', async () => {
      const responseStatus = 304

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: '', status: responseStatus })
      )

      await expect(
        sessionManager['waitForSession'](
          {
            id: 'id',
            state: '',
            links: [
              { rel: 'state', href: '', uri: '', type: '', method: 'GET' }
            ],
            attributes: {
              sessionInactiveTimeout: 0
            },
            creationTimeStamp: ''
          },
          null,
          'access_token'
        )
      ).rejects.toEqual(
        new NoSessionStateError(
          responseStatus,
          process.env.SERVER_URL as string,
          'logUrl'
        )
      )
    })
  })
})
