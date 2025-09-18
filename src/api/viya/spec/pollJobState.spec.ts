import { Logger, LogLevel } from '@sasjs/utils/logger'
import { RequestClient } from '../../../request/RequestClient'
import { mockAuthConfig, mockJob } from './mockResponses'
import { pollJobState, doPoll, JobState } from '../pollJobState'
import * as getTokensModule from '../../../auth/getTokens'
import * as saveLogModule from '../saveLog'
import * as getFileStreamModule from '../getFileStream'
import * as isNodeModule from '../../../utils/isNode'
import * as delayModule from '../../../utils/delay'
import {
  PollOptions,
  PollStrategy,
  SessionState,
  JobSessionManager
} from '../../../types'
import { WriteStream } from 'fs'
import { SessionManager } from '../../../SessionManager'
import { JobStatePollError } from '../../../types'

const baseUrl = 'http://localhost'
const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()
const sessionManager = new (<jest.Mock<SessionManager>>SessionManager)()
requestClient['httpClient'].defaults.baseURL = baseUrl

const defaultStreamLog = false
const defaultPollStrategy: PollOptions = {
  maxPollCount: 100,
  pollInterval: 500
}

describe('pollJobState', () => {
  beforeEach(() => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    setupMocks()
  })

  it('should get valid tokens if the authConfig has been provided', async () => {
    await pollJobState(requestClient, mockJob, false, mockAuthConfig, {
      ...defaultPollStrategy,
      streamLog: defaultStreamLog
    })

    expect(getTokensModule.getTokens).toHaveBeenCalledWith(
      requestClient,
      mockAuthConfig
    )
  })

  it('should not attempt to get tokens if the authConfig has not been provided', async () => {
    await pollJobState(
      requestClient,
      mockJob,
      false,
      undefined,
      defaultPollStrategy
    )

    expect(getTokensModule.getTokens).not.toHaveBeenCalled()
  })

  it('should throw an error if the job does not have a state link', async () => {
    const error = await pollJobState(
      requestClient,
      { ...mockJob, links: mockJob.links.filter((l) => l.rel !== 'state') },
      false,
      undefined,
      defaultPollStrategy
    ).catch((e: any) => e)

    expect((error as Error).message).toContain('Job state link was not found.')
  })

  it('should attempt to refresh tokens before each poll', async () => {
    mockSimplePoll()

    await pollJobState(
      requestClient,
      mockJob,
      false,
      mockAuthConfig,
      defaultPollStrategy
    )

    expect(getTokensModule.getTokens).toHaveBeenCalledTimes(3)
  })

  it('should attempt to fetch and save the log after each poll when streamLog is true', async () => {
    mockSimplePoll()
    const { saveLog } = require('../saveLog')

    await pollJobState(requestClient, mockJob, false, mockAuthConfig, {
      ...defaultPollStrategy,
      streamLog: true
    })

    expect(saveLog).toHaveBeenCalledTimes(2)
  })

  it('should create a write stream in Node.js environment when streamLog is true', async () => {
    mockSimplePoll()
    const { getFileStream } = require('../getFileStream')
    const { saveLog } = require('../saveLog')

    await pollJobState(requestClient, mockJob, false, mockAuthConfig, {
      ...defaultPollStrategy,
      streamLog: true
    })

    expect(getFileStream).toHaveBeenCalled()
    expect(saveLog).toHaveBeenCalledTimes(2)
  })

  it('should not create a write stream in a non-Node.js environment', async () => {
    mockSimplePoll()
    jest.spyOn(isNodeModule, 'isNode').mockImplementation(() => false)
    const { saveLog } = require('../saveLog')
    const { getFileStream } = require('../getFileStream')

    await pollJobState(requestClient, mockJob, false, mockAuthConfig, {
      ...defaultPollStrategy,
      streamLog: true
    })

    expect(getFileStream).not.toHaveBeenCalled()
    expect(saveLog).not.toHaveBeenCalled()
  })

  it('should not attempt to fetch and save the log after each poll when streamLog is false', async () => {
    mockSimplePoll()

    await pollJobState(
      requestClient,
      mockJob,
      false,
      mockAuthConfig,
      defaultPollStrategy
    )

    expect(saveLogModule.saveLog).not.toHaveBeenCalled()
  })

  it('should return the current status when the max poll count is reached', async () => {
    mockRunningPoll()

    const pollOptions: PollOptions = {
      ...defaultPollStrategy,
      maxPollCount: 1,
      pollStrategy: []
    }

    const state = await pollJobState(
      requestClient,
      mockJob,
      false,
      mockAuthConfig,
      pollOptions
    )

    expect(state).toEqual('running')
  })

  it('should poll with a larger interval for longer running jobs', async () => {
    mockLongPoll()

    const state = await pollJobState(
      requestClient,
      mockJob,
      false,
      mockAuthConfig,
      {
        ...defaultPollStrategy,
        maxPollCount: 200,
        pollInterval: 10
      }
    )

    expect(state).toEqual('completed')
  }, 200000)

  it('should continue polling until the job completes or errors', async () => {
    mockSimplePoll(1)

    const state = await pollJobState(
      requestClient,
      mockJob,
      false,
      undefined,
      defaultPollStrategy
    )

    expect(requestClient.get).toHaveBeenCalledTimes(2)
    expect(state).toEqual('completed')
  })

  it('should print the state to the console when debug is on', async () => {
    jest.spyOn((process as any).logger, 'info')
    mockSimplePoll()

    await pollJobState(
      requestClient,
      mockJob,
      true,
      undefined,
      defaultPollStrategy
    )

    expect((process as any).logger.info).toHaveBeenCalledTimes(4)
    expect((process as any).logger.info).toHaveBeenNthCalledWith(
      1,
      `Polling: ${baseUrl}/job/state`
    )
    expect((process as any).logger.info).toHaveBeenNthCalledWith(
      2,
      'Current job state: running'
    )
    expect((process as any).logger.info).toHaveBeenNthCalledWith(
      3,
      `Polling: ${baseUrl}/job/state`
    )
    expect((process as any).logger.info).toHaveBeenNthCalledWith(
      4,
      'Current job state: completed'
    )
  })

  it('should continue polling when there is a single error in between', async () => {
    mockPollWithSingleError()

    const state = await pollJobState(
      requestClient,
      mockJob,
      false,
      undefined,
      defaultPollStrategy
    )

    expect(requestClient.get).toHaveBeenCalledTimes(2)
    expect(state).toEqual('completed')
  })

  it('should throw an error when the error count exceeds the set value of 5', async () => {
    mockErroredPoll()

    const error = await pollJobState(
      requestClient,
      mockJob,
      false,
      undefined,
      defaultPollStrategy
    ).catch((e: any) => e)

    expect(error.message).toEqual(
      'Error while polling job state for job j0b: Status Error'
    )
  })

  it('should change poll strategies', async () => {
    mockSimplePoll(6)

    const delays: number[] = []

    jest.spyOn(delayModule, 'delay').mockImplementation((ms: number) => {
      delays.push(ms)

      return Promise.resolve()
    })

    const pollIntervals = [3, 4, 5, 6]

    const pollStrategy = [
      { maxPollCount: 2, pollInterval: pollIntervals[1] },
      { maxPollCount: 3, pollInterval: pollIntervals[2] },
      { maxPollCount: 4, pollInterval: pollIntervals[3] }
    ]

    const pollOptions: PollOptions = {
      maxPollCount: 1,
      pollInterval: pollIntervals[0],
      pollStrategy: pollStrategy
    }

    await pollJobState(requestClient, mockJob, false, undefined, pollOptions)

    expect(delays).toEqual([pollIntervals[0], ...pollIntervals])
  })

  it('should change default poll strategies after completing provided poll options', async () => {
    const delays: number[] = []

    jest.spyOn(delayModule, 'delay').mockImplementation((ms: number) => {
      delays.push(ms)

      return Promise.resolve()
    })

    const customPollOptions: PollOptions = {
      maxPollCount: 0,
      pollInterval: 0
    }

    const requests = [
      { maxPollCount: 202, pollInterval: 300 },
      { maxPollCount: 300, pollInterval: 3000 },
      { maxPollCount: 500, pollInterval: 30000 },
      { maxPollCount: 3400, pollInterval: 60000 }
    ]

    // ~200 requests with delay 300ms
    let request = requests.splice(0, 1)[0]
    let { maxPollCount, pollInterval } = request

    // should be only one interval because maxPollCount is equal to 0
    const pollIntervals = [customPollOptions.pollInterval]

    pollIntervals.push(...Array(maxPollCount - 2).fill(pollInterval))

    // ~300 requests with delay 3000
    request = requests.splice(0, 1)[0]
    let newAmount = request.maxPollCount
    pollInterval = request.pollInterval

    pollIntervals.push(...Array(newAmount - maxPollCount).fill(pollInterval))
    pollIntervals.push(...Array(2).fill(pollInterval))

    // ~500 requests with delay 30000
    request = requests.splice(0, 1)[0]

    let oldAmount = newAmount
    newAmount = request.maxPollCount
    pollInterval = request.pollInterval

    pollIntervals.push(...Array(newAmount - oldAmount - 2).fill(pollInterval))
    pollIntervals.push(...Array(2).fill(pollInterval))

    // ~3400 requests with delay 60000
    request = requests.splice(0, 1)[0]

    oldAmount = newAmount
    newAmount = request.maxPollCount
    pollInterval = request.pollInterval

    mockSimplePoll(newAmount)

    pollIntervals.push(...Array(newAmount - oldAmount - 2).fill(pollInterval))

    await pollJobState(
      requestClient,
      mockJob,
      false,
      undefined,
      customPollOptions
    )

    expect(delays).toEqual(pollIntervals)
  })

  it('should throw an error if not valid poll strategies provided', async () => {
    // INFO: 'maxPollCount' has to be > 0
    let invalidPollStrategy = {
      maxPollCount: 0,
      pollInterval: 3
    }

    let pollStrategy: PollStrategy = [invalidPollStrategy]

    let expectedError = new Error(
      `Poll strategies are not valid. 'maxPollCount' has to be greater than 0. Invalid poll strategy: \n${JSON.stringify(
        invalidPollStrategy,
        null,
        2
      )}`
    )

    await expect(
      pollJobState(requestClient, mockJob, false, undefined, {
        ...defaultPollStrategy,
        pollStrategy: pollStrategy
      })
    ).rejects.toThrow(expectedError)

    // INFO: 'maxPollCount' has to be > than 'maxPollCount' of the previous strategy
    const validPollStrategy = {
      maxPollCount: 5,
      pollInterval: 2
    }

    invalidPollStrategy = {
      maxPollCount: validPollStrategy.maxPollCount,
      pollInterval: 3
    }

    pollStrategy = [validPollStrategy, invalidPollStrategy]

    expectedError = new Error(
      `Poll strategies are not valid. 'maxPollCount' has to be greater than 'maxPollCount' in previous poll strategy. Invalid poll strategy: \n${JSON.stringify(
        invalidPollStrategy,
        null,
        2
      )}`
    )

    await expect(
      pollJobState(requestClient, mockJob, false, undefined, {
        ...defaultPollStrategy,
        pollStrategy: pollStrategy
      })
    ).rejects.toThrow(expectedError)

    // INFO: invalid 'pollInterval'
    invalidPollStrategy = {
      maxPollCount: 1,
      pollInterval: 0
    }

    pollStrategy = [invalidPollStrategy]

    expectedError = new Error(
      `Poll strategies are not valid. 'pollInterval' has to be greater than 0. Invalid poll strategy: \n${JSON.stringify(
        invalidPollStrategy,
        null,
        2
      )}`
    )

    await expect(
      pollJobState(requestClient, mockJob, false, undefined, {
        ...defaultPollStrategy,
        pollStrategy: pollStrategy
      })
    ).rejects.toThrow(expectedError)
  })
})

describe('doPoll', () => {
  const sessionStateLink = '/compute/sessions/session-id-ses0000/state'
  const jobSessionManager: JobSessionManager = {
    sessionManager,
    session: {
      id: ['id', new Date().getTime(), Math.random()].join('-'),
      state: SessionState.NoState,
      links: [
        {
          href: sessionStateLink,
          method: 'GET',
          rel: 'state',
          type: 'text/plain',
          uri: sessionStateLink
        }
      ],
      attributes: {
        sessionInactiveTimeout: 900
      },
      creationTimeStamp: `${new Date(new Date().getTime()).toISOString()}`,
      stateUrl: '',
      etag: ''
    }
  }

  beforeEach(() => {
    setupMocks()
  })

  it('should check session state on every 10th job state poll', async () => {
    const mockedGetSessionState = jest
      .spyOn(sessionManager as any, 'getSessionState')
      .mockImplementation(() => {
        return Promise.resolve({
          result: SessionState.Idle,
          responseStatus: 200
        })
      })

    let getSessionStateCount = 0
    jest.spyOn(requestClient, 'get').mockImplementation(() => {
      getSessionStateCount++

      return Promise.resolve({
        result:
          getSessionStateCount < 20 ? JobState.Running : JobState.Completed,
        etag: 'etag-string',
        status: 200
      })
    })

    await doPoll(
      requestClient,
      mockJob,
      JobState.Running,
      false,
      1,
      defaultPollStrategy,
      mockAuthConfig,
      undefined,
      undefined,
      jobSessionManager
    )

    expect(mockedGetSessionState).toHaveBeenCalledTimes(2)
  })

  it('should handle error while checking session state', async () => {
    const sessionStateError = 'Error while getting session state.'

    jest
      .spyOn(sessionManager as any, 'getSessionState')
      .mockImplementation(() => {
        return Promise.reject(sessionStateError)
      })

    jest.spyOn(requestClient, 'get').mockImplementation(() => {
      return Promise.resolve({
        result: JobState.Running,
        etag: 'etag-string',
        status: 200
      })
    })

    await expect(
      doPoll(
        requestClient,
        mockJob,
        JobState.Running,
        false,
        1,
        defaultPollStrategy,
        mockAuthConfig,
        undefined,
        undefined,
        jobSessionManager
      )
    ).rejects.toEqual(
      new JobStatePollError(mockJob.id, new Error(sessionStateError))
    )
  })

  it('should throw an error if session state is not healthy', async () => {
    const filteredSessionStates = Object.values(SessionState).filter(
      (state) => state !== SessionState.Running && state !== SessionState.Idle
    )
    const randomSessionState =
      filteredSessionStates[
        Math.floor(Math.random() * filteredSessionStates.length)
      ]

    jest
      .spyOn(sessionManager as any, 'getSessionState')
      .mockImplementation(() => {
        return Promise.resolve({
          result: randomSessionState,
          responseStatus: 200
        })
      })

    jest.spyOn(requestClient, 'get').mockImplementation(() => {
      return Promise.resolve({
        result: JobState.Running,
        etag: 'etag-string',
        status: 200
      })
    })

    const mockedClearSession = jest
      .spyOn(sessionManager, 'clearSession')
      .mockImplementation(() => Promise.resolve())

    await expect(
      doPoll(
        requestClient,
        mockJob,
        JobState.Running,
        false,
        1,
        defaultPollStrategy,
        mockAuthConfig,
        undefined,
        undefined,
        jobSessionManager
      )
    ).rejects.toEqual(
      new JobStatePollError(
        mockJob.id,
        new Error(
          `Session state of the job is not 'running' or 'idle'. Session state is '${randomSessionState}'`
        )
      )
    )

    expect(mockedClearSession).toHaveBeenCalledWith(
      jobSessionManager.session.id,
      mockAuthConfig.access_token
    )
  })

  it('should handle throw an error if response status of session state is not 200', async () => {
    const sessionStateResponseStatus = 500
    jest
      .spyOn(sessionManager as any, 'getSessionState')
      .mockImplementation(() => {
        return Promise.resolve({
          result: SessionState.Running,
          responseStatus: sessionStateResponseStatus
        })
      })

    jest.spyOn(requestClient, 'get').mockImplementation(() => {
      return Promise.resolve({
        result: JobState.Running,
        etag: 'etag-string',
        status: 200
      })
    })

    const mockedClearSession = jest
      .spyOn(sessionManager, 'clearSession')
      .mockImplementation(() => Promise.resolve())

    await expect(
      doPoll(
        requestClient,
        mockJob,
        JobState.Running,
        false,
        1,
        defaultPollStrategy,
        mockAuthConfig,
        undefined,
        undefined,
        jobSessionManager
      )
    ).rejects.toEqual(
      new JobStatePollError(
        mockJob.id,
        new Error(
          `Session response status is not 200. Session response status is ${sessionStateResponseStatus}.`
        )
      )
    )

    expect(mockedClearSession).toHaveBeenCalledWith(
      jobSessionManager.session.id,
      mockAuthConfig.access_token
    )
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('../../../request/RequestClient')
  jest.mock('../../../auth/getTokens')
  jest.mock('../saveLog')
  jest.mock('../getFileStream')
  jest.mock('../../../utils/isNode')

  jest
    .spyOn(requestClient, 'get')
    .mockImplementation(() =>
      Promise.resolve({ result: 'completed', etag: '', status: 200 })
    )
  jest
    .spyOn(getTokensModule, 'getTokens')
    .mockImplementation(() => Promise.resolve(mockAuthConfig))
  jest
    .spyOn(saveLogModule, 'saveLog')
    .mockImplementation(() => Promise.resolve())
  jest
    .spyOn(getFileStreamModule, 'getFileStream')
    .mockImplementation(() => Promise.resolve({} as unknown as WriteStream))
  jest.spyOn(isNodeModule, 'isNode').mockImplementation(() => true)
}

const mockSimplePoll = (runningCount = 2) => {
  let count = 0

  jest.spyOn(requestClient, 'get').mockImplementation((url) => {
    count++

    if (url.includes('job')) {
      return Promise.resolve({ result: mockJob, etag: '', status: 200 })
    }

    return Promise.resolve({
      result:
        count === 0
          ? 'pending'
          : count <= runningCount
          ? 'running'
          : 'completed',
      etag: '',
      status: 200
    })
  })
}

const mockRunningPoll = () => {
  let count = 0

  jest.spyOn(requestClient, 'get').mockImplementation((url) => {
    count++

    if (url.includes('job')) {
      return Promise.resolve({ result: mockJob, etag: '', status: 200 })
    }

    return Promise.resolve({
      result: count === 0 ? 'pending' : 'running',
      etag: '',
      status: 200
    })
  })
}

const mockLongPoll = () => {
  let count = 0

  jest.spyOn(requestClient, 'get').mockImplementation((url) => {
    count++

    if (url.includes('job')) {
      return Promise.resolve({ result: mockJob, etag: '', status: 200 })
    }

    return Promise.resolve({
      result: count <= 102 ? 'running' : 'completed',
      etag: '',
      status: 200
    })
  })
}

const mockPollWithSingleError = () => {
  let count = 0

  jest.spyOn(requestClient, 'get').mockImplementation((url) => {
    count++

    if (url.includes('job')) {
      return Promise.resolve({ result: mockJob, etag: '', status: 200 })
    }

    if (count === 1) {
      return Promise.reject('Status Error')
    }

    return Promise.resolve({
      result: count === 0 ? 'pending' : 'completed',
      etag: '',
      status: 200
    })
  })
}

const mockErroredPoll = () => {
  jest.spyOn(requestClient, 'get').mockImplementation((url) => {
    if (url.includes('job')) {
      return Promise.resolve({ result: mockJob, etag: '', status: 200 })
    }

    return Promise.reject('Status Error')
  })
}
