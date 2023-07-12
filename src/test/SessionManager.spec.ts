import { SessionManager } from '../SessionManager'
import { RequestClient } from '../request/RequestClient'
import * as dotenv from 'dotenv'
import axios from 'axios'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { Session, Context } from '../types'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>
const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()

describe('SessionManager', () => {
  dotenv.config()

  const sessionManager = new SessionManager(
    process.env.SERVER_URL as string,
    process.env.DEFAULT_COMPUTE_CONTEXT as string,
    requestClient
  )

  const getMockSession = () => ({
    id: ['id', new Date().getTime(), Math.random()].join('-'),
    state: '',
    links: [{ rel: 'state', href: '', uri: '', type: '', method: 'GET' }],
    attributes: {
      sessionInactiveTimeout: 900
    },
    creationTimeStamp: `${new Date(new Date().getTime()).toISOString()}`
  })

  afterEach(() => {
    jest.restoreAllMocks()
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

    it('should throw an error if GET request failed', async () => {
      const responseStatus = 500
      const responseErrorMessage = `The process timed out after 60 seconds. Request failed with status code ${responseStatus}`
      const response = {
        status: responseStatus,
        data: {
          message: responseErrorMessage
        }
      }
      const testVariable = 'testVariable'

      jest.spyOn(requestClient, 'get').mockImplementation(() =>
        Promise.reject({
          response
        })
      )

      const expectedError = `Error while fetching session variable '${testVariable}'. GET request to ${process.env.SERVER_URL}/compute/sessions/testId/variables/${testVariable} failed with status code ${responseStatus}. ${responseErrorMessage}`

      await expect(
        sessionManager.getVariable('testId', testVariable)
      ).rejects.toEqual(expectedError)
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
        `Polling: ${process.env.SERVER_URL}`
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
      const gettingSessionStatus = 500
      const sessionStatusError = `Getting session status timed out after 60 seconds. Request failed with status code ${gettingSessionStatus}`

      mockedAxios.get.mockImplementation(() =>
        Promise.reject({
          response: {
            status: gettingSessionStatus,
            data: {
              message: sessionStatusError
            }
          }
        })
      )

      const expectedError = `Error while waiting for session. Error while getting session state. GET request to ${process.env.SERVER_URL}?wait=30 failed with status code ${gettingSessionStatus}. ${sessionStatusError}`

      await expect(
        sessionManager['waitForSession'](session, null, 'access_token')
      ).rejects.toEqual(expectedError)
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

  describe('isSessionValid', () => {
    const session: Session = getMockSession()

    it('should return false if not a session provided', () => {
      expect(sessionManager['isSessionValid'](undefined as any)).toEqual(false)
    })

    it('should return true if session is not expired', () => {
      expect(sessionManager['isSessionValid'](session)).toEqual(true)
    })

    it('should return false if session is expired', () => {
      session.creationTimeStamp = `${new Date(
        new Date().getTime() -
          (session.attributes.sessionInactiveTimeout * 1000 + 1000)
      ).toISOString()}`
      expect(sessionManager['isSessionValid'](session)).toEqual(false)
    })
  })

  describe('removeSessionFromPool', () => {
    it('should remove session from the pool of sessions', () => {
      const session: Session = getMockSession()
      const sessions: Session[] = [getMockSession(), session]

      sessionManager['sessions'] = sessions
      sessionManager['removeSessionFromPool'](session)

      expect(sessionManager['sessions'].length).toEqual(1)
    })
  })

  describe('getSession', () => {
    it('should return session if there is a valid session and create new session', async () => {
      jest
        .spyOn(sessionManager as any, 'createAndWaitForSession')
        .mockImplementation(async () => Promise.resolve(getMockSession()))

      const session = getMockSession()
      sessionManager['sessions'] = [session]

      await expect(sessionManager.getSession()).resolves.toEqual(session)
      expect(sessionManager['createAndWaitForSession']).toHaveBeenCalled()
    })

    it('should return a session and keep one session if there is no sessions available', async () => {
      jest
        .spyOn(sessionManager as any, 'createAndWaitForSession')
        .mockImplementation(async () => {
          const session = getMockSession()
          sessionManager['sessions'].push(session)

          return Promise.resolve(session)
        })

      const session = await sessionManager.getSession()

      expect(Object.keys(session)).toEqual(Object.keys(getMockSession()))
      expect(sessionManager['createAndWaitForSession']).toHaveBeenCalledTimes(2)
      expect(sessionManager['sessions'].length).toEqual(1)
    })

    it.concurrent(
      'should throw an error if session creation request returned 500',
      async () => {
        const sessionCreationStatus = 500
        const sessionCreationError = `The process initialization for the Compute server with the ID 'ed40398a-ec8a-422b-867a-61493ee8a57f' timed out after 60 seconds. Request failed with status code ${sessionCreationStatus}`

        jest.spyOn(requestClient, 'post').mockImplementation(() =>
          Promise.reject({
            response: {
              status: sessionCreationStatus,
              data: {
                message: sessionCreationError
              }
            }
          })
        )

        const contextId = 'testContextId'
        const context: Context = {
          name: 'testContext',
          id: contextId,
          createdBy: 'createdBy',
          version: 1
        }

        sessionManager['currentContext'] = context

        const expectedError = new Error(
          `Error while creating session. POST request to ${process.env.SERVER_URL}/compute/contexts/${contextId}/sessions failed with status code ${sessionCreationStatus}. ${sessionCreationError}`
        )

        await expect(sessionManager.getSession()).rejects.toEqual(expectedError)
      }
    )
  })

  describe('clearSession', () => {
    it('should clear session', async () => {
      jest
        .spyOn(requestClient, 'delete')
        .mockImplementation(() =>
          Promise.resolve({ result: '', etag: '', status: 200 })
        )

      const sessionToBeCleared = getMockSession()
      const sessionToStay = getMockSession()

      sessionManager['sessions'] = [sessionToBeCleared, sessionToStay]

      await sessionManager.clearSession(sessionToBeCleared.id)

      expect(sessionManager['sessions']).toEqual([sessionToStay])
    })

    it('should throw error if DELETE request failed', async () => {
      const sessionCreationStatus = 500
      const sessionDeleteError = `The process timed out after 60 seconds. Request failed with status code ${sessionCreationStatus}`

      jest.spyOn(requestClient, 'delete').mockImplementation(() =>
        Promise.reject({
          response: {
            status: sessionCreationStatus,
            data: {
              message: sessionDeleteError
            }
          }
        })
      )

      const session = getMockSession()

      sessionManager['sessions'] = [session]

      const expectedError = `Error while deleting session. DELETE request to /compute/sessions/${session.id} failed with status code ${sessionCreationStatus}. ${sessionDeleteError}`

      await expect(sessionManager.clearSession(session.id)).rejects.toEqual(
        expectedError
      )
    })
  })

  describe('waitForCurrentContext', () => {
    it('should resolve when current context is ready', async () => {
      sessionManager['settingContext'] = true
      sessionManager['contextName'] = 'test context'

      await expect(sessionManager['waitForCurrentContext']()).toResolve()
      expect(sessionManager['settingContext']).toEqual(false)
    })
  })

  describe('setCurrentContext', () => {
    it('should set current context', async () => {
      const contextName = 'test context'
      const testContext: Context = {
        name: contextName,
        id: 'string',
        createdBy: 'string',
        version: 1
      }

      jest.spyOn(requestClient, 'get').mockImplementation(() => {
        return Promise.resolve({
          result: {
            items: [testContext]
          },
          etag: '',
          status: 200
        })
      })

      sessionManager['currentContext'] = null
      sessionManager['contextName'] = contextName
      sessionManager['settingContext'] = false

      await expect(sessionManager['setCurrentContext']()).toResolve()
      expect(sessionManager['currentContext']).toEqual(testContext)
    })

    it('should throw error if GET request failed', async () => {
      const responseStatus = 500
      const responseErrorMessage = `The process timed out after 60 seconds. Request failed with status code ${responseStatus}`
      const response = {
        status: responseStatus,
        data: {
          message: responseErrorMessage
        }
      }

      jest.spyOn(requestClient, 'get').mockImplementation(() =>
        Promise.reject({
          response
        })
      )

      const expectedError = `Error while getting list of contexts. GET request to ${process.env.SERVER_URL}/compute/contexts?limit=10000 failed with status code ${responseStatus}. ${responseErrorMessage}`

      sessionManager['currentContext'] = null

      await expect(sessionManager['setCurrentContext']()).rejects.toEqual(
        expectedError
      )
    })

    it('should throw an error if current context is not in the list of contexts', async () => {
      const contextName = 'test context'
      const testContext: Context = {
        name: `${contextName} does not exist`,
        id: 'string',
        createdBy: 'string',
        version: 1
      }

      jest.spyOn(requestClient, 'get').mockImplementation(() => {
        return Promise.resolve({
          result: {
            items: [testContext]
          },
          etag: '',
          status: 200
        })
      })

      sessionManager['currentContext'] = null
      sessionManager['contextName'] = contextName
      sessionManager['settingContext'] = false

      const expectedError = new Error(
        `The context '${contextName}' was not found on the server ${process.env.SERVER_URL}.`
      )

      await expect(sessionManager['setCurrentContext']()).rejects.toEqual(
        expectedError
      )
    })
  })
})
