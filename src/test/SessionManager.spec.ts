import { SessionManager } from '../SessionManager'
import { RequestClient } from '../request/RequestClient'
import { NoSessionStateError } from '../types/errors'
import * as dotenv from 'dotenv'
import axios from 'axios'
import { Logger, LogLevel } from '@sasjs/utils'

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
    beforeEach(() => {
      ;(process as any).logger = new Logger(LogLevel.Off)
    })

    it('should reject with NoSessionStateError if SAS server did not provide session state', async () => {
      let requestAttempt = 0

      mockedAxios.get.mockImplementation(() => {
        requestAttempt += 1

        if (requestAttempt > 10) {
          return Promise.resolve({ data: 'idle', status: 200 })
        }

        return Promise.resolve({ data: '', status: 304 })
      })

      mockedAxios

      jest.spyOn((process as any).logger, 'info')

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
      ).resolves.toEqual('idle')

      expect((process as any).logger.info).toHaveBeenCalledTimes(1)
      expect((process as any).logger.info).toHaveBeenLastCalledWith(
        `Could not get session state. Server responded with 304 whilst checking state: ${process.env.SERVER_URL}`
      )
    })
  })
})
