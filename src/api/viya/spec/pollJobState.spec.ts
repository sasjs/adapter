import { Logger, LogLevel } from '@sasjs/utils'
import { RequestClient } from '../../../request/RequestClient'
import { mockAuthConfig, mockJob } from './mockResponses'
import { pollJobState } from '../pollJobState'
import * as getTokensModule from '../../../auth/getTokens'
import * as saveLogModule from '../saveLog'
import * as getFileStreamModule from '../getFileStream'
import * as isNodeModule from '../../../utils/isNode'
import * as delayModule from '../../../utils/delay'
import { PollOptions } from '../../../types'
import { WriteStream } from 'fs'

const baseUrl = 'http://localhost'
const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()
requestClient['httpClient'].defaults.baseURL = baseUrl

const defaultPollOptions: PollOptions = {
  maxPollCount: 100,
  pollInterval: 500,
  streamLog: false
}

describe('pollJobState', () => {
  beforeEach(() => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    setupMocks()
  })

  it('should get valid tokens if the authConfig has been provided', async () => {
    await pollJobState(
      requestClient,
      mockJob,
      false,
      mockAuthConfig,
      defaultPollOptions
    )

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
      defaultPollOptions
    )

    expect(getTokensModule.getTokens).not.toHaveBeenCalled()
  })

  it('should throw an error if the job does not have a state link', async () => {
    const error = await pollJobState(
      requestClient,
      { ...mockJob, links: mockJob.links.filter((l) => l.rel !== 'state') },
      false,
      undefined,
      defaultPollOptions
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
      defaultPollOptions
    )

    expect(getTokensModule.getTokens).toHaveBeenCalledTimes(3)
  })

  it('should attempt to fetch and save the log after each poll when streamLog is true', async () => {
    mockSimplePoll()
    const { saveLog } = require('../saveLog')

    await pollJobState(requestClient, mockJob, false, mockAuthConfig, {
      ...defaultPollOptions,
      streamLog: true
    })

    expect(saveLog).toHaveBeenCalledTimes(2)
  })

  it('should create a write stream in Node.js environment when streamLog is true', async () => {
    mockSimplePoll()
    const { getFileStream } = require('../getFileStream')
    const { saveLog } = require('../saveLog')

    await pollJobState(requestClient, mockJob, false, mockAuthConfig, {
      ...defaultPollOptions,
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
      ...defaultPollOptions,
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
      defaultPollOptions
    )

    expect(saveLogModule.saveLog).not.toHaveBeenCalled()
  })

  it('should return the current status when the max poll count is reached', async () => {
    mockRunningPoll()

    const pollOptions = {
      ...defaultPollOptions,
      maxPollCount: 1
    }
    const pollStrategies = [pollOptions]

    const state = await pollJobState(
      requestClient,
      mockJob,
      false,
      mockAuthConfig,
      pollOptions,
      pollStrategies
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
        ...defaultPollOptions,
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
      defaultPollOptions
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
      defaultPollOptions
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
      defaultPollOptions
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
      defaultPollOptions
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

    const pollStrategies = [
      { maxPollCount: 1, pollInterval: pollIntervals[0], streamLog: false },
      { maxPollCount: 2, pollInterval: pollIntervals[1], streamLog: false },
      { maxPollCount: 3, pollInterval: pollIntervals[2], streamLog: false },
      { maxPollCount: 4, pollInterval: pollIntervals[3], streamLog: false }
    ]

    await pollJobState(
      requestClient,
      mockJob,
      false,
      undefined,
      undefined,
      pollStrategies
    )

    expect(delays).toEqual([pollIntervals[0], ...pollIntervals])
  })

  it('should throw an error if not valid poll strategies provided', async () => {
    // INFO: No strategies provided.
    let expectedError = new Error(
      'Poll strategies are not valid. No strategies provided.'
    )

    let pollStrategies: PollOptions[] = []

    await expect(
      pollJobState(
        requestClient,
        mockJob,
        false,
        undefined,
        undefined,
        pollStrategies
      )
    ).rejects.toThrow(expectedError)

    // INFO: 'maxPollCount' has to be > 0
    let invalidPollStrategy = {
      maxPollCount: 0,
      pollInterval: 3,
      streamLog: false
    }

    pollStrategies.push(invalidPollStrategy)

    expectedError = new Error(
      `Poll strategies are not valid. 'maxPollCount' has to be greater than 0. Invalid poll strategy: \n${JSON.stringify(
        invalidPollStrategy,
        null,
        2
      )}`
    )

    await expect(
      pollJobState(
        requestClient,
        mockJob,
        false,
        undefined,
        undefined,
        pollStrategies
      )
    ).rejects.toThrow(expectedError)

    // INFO: 'maxPollCount' has to be > than 'maxPollCount' of the previous strategy
    const validPollStrategy = {
      maxPollCount: 5,
      pollInterval: 2,
      streamLog: false
    }

    invalidPollStrategy = {
      maxPollCount: validPollStrategy.maxPollCount,
      pollInterval: 3,
      streamLog: false
    }

    pollStrategies = [validPollStrategy, invalidPollStrategy]

    expectedError = new Error(
      `Poll strategies are not valid. 'maxPollCount' has to be greater than 'maxPollCount' in previous poll strategy. Invalid poll strategy: \n${JSON.stringify(
        invalidPollStrategy,
        null,
        2
      )}`
    )

    await expect(
      pollJobState(
        requestClient,
        mockJob,
        false,
        undefined,
        undefined,
        pollStrategies
      )
    ).rejects.toThrow(expectedError)

    // INFO: invalid 'pollInterval'
    invalidPollStrategy = {
      maxPollCount: 1,
      pollInterval: 0,
      streamLog: false
    }

    pollStrategies = [invalidPollStrategy]

    expectedError = new Error(
      `Poll strategies are not valid. 'pollInterval' has to be greater than 0. Invalid poll strategy: \n${JSON.stringify(
        invalidPollStrategy,
        null,
        2
      )}`
    )

    await expect(
      pollJobState(
        requestClient,
        mockJob,
        false,
        undefined,
        undefined,
        pollStrategies
      )
    ).rejects.toThrow(expectedError)
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
