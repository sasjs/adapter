import { SessionManager } from '../SessionManager'
import { RequestClient } from '../request/RequestClient'
import * as dotenv from 'dotenv'
import axios from 'axios'
import { Logger, LogLevel } from '@sasjs/utils'
import { Session } from '../types'

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
    const session: Session = {
      id: 'id',
      state: '',
      links: [{ rel: 'state', href: '', uri: '', type: '', method: 'GET' }],
      attributes: {
        sessionInactiveTimeout: 0
      },
      creationTimeStamp: ''
    }

    beforeEach(() => {
      ;(process as any).logger = new Logger(LogLevel.Off)
    })

    it('should reject with NoSessionStateError if SAS server did not provide session state', async () => {
      let requestAttempt = 0
      const requestAttemptLimit = 10
      const sessionState = 'idle'

      mockedAxios.get.mockImplementation(() => {
        requestAttempt += 1

        if (requestAttempt >= requestAttemptLimit) {
          return Promise.resolve({ data: sessionState, status: 200 })
        }

        return Promise.resolve({ data: '', status: 304 })
      })

      jest.spyOn((process as any).logger, 'info')

      sessionManager.debug = true

      await expect(
        sessionManager['waitForSession'](session, null, 'access_token')
      ).resolves.toEqual(sessionState)

      expect(mockedAxios.get).toHaveBeenCalledTimes(requestAttemptLimit)
      expect((process as any).logger.info).toHaveBeenCalledTimes(3)
      expect((process as any).logger.info).toHaveBeenNthCalledWith(
        1,
        'Polling session status...'
      )
      expect((process as any).logger.info).toHaveBeenNthCalledWith(
        2,
        `Could not get session state. Server responded with 304 whilst checking state: ${process.env.SERVER_URL}`
      )
      expect((process as any).logger.info).toHaveBeenNthCalledWith(
        3,
        `Current session state is '${sessionState}'`
      )
    })

    it('should throw an error if there is no session link', async () => {
      const customSession = JSON.parse(JSON.stringify(session))
      customSession.links = []

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: customSession.state, status: 200 })
      )

      await expect(
        sessionManager['waitForSession'](customSession, null, 'access_token')
      ).rejects.toContain('Error while getting session state link.')
    })

    it('should throw an error if could not get session state', async () => {
      mockedAxios.get.mockImplementation(() => Promise.reject('Mocked error'))

      await expect(
        sessionManager['waitForSession'](session, null, 'access_token')
      ).rejects.toContain('Error while getting session state.')
    })

    it('should return session state', async () => {
      const customSession = JSON.parse(JSON.stringify(session))
      customSession.state = 'completed'

      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: customSession.state, status: 200 })
      )

      await expect(
        sessionManager['waitForSession'](customSession, null, 'access_token')
      ).resolves.toEqual(customSession.state)
    })
  })
})
