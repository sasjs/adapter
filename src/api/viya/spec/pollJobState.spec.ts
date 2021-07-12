import { RequestClient } from '../../../request/RequestClient'
import { mockAuthConfig, mockJob } from './mockResponses'
import { pollJobState } from '../pollJobState'
import * as getTokensModule from '../../../auth/getTokens'
import * as saveLogModule from '../saveLog'
import { PollOptions } from '../../../types'
import { Logger, LogLevel } from '@sasjs/utils'

const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()
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
      'test',
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
      'test',
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
      'test',
      undefined,
      defaultPollOptions
    ).catch((e) => e)

    expect((error as Error).message).toContain('Job state link was not found.')
  })

  it('should attempt to refresh tokens before each poll', async () => {
    jest
      .spyOn(requestClient, 'get')
      .mockImplementationOnce(() =>
        Promise.resolve({ result: 'pending', etag: '' })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({ result: 'running', etag: '' })
      )
      .mockImplementation(() =>
        Promise.resolve({ result: 'completed', etag: '' })
      )

    await pollJobState(
      requestClient,
      mockJob,
      false,
      'test',
      mockAuthConfig,
      defaultPollOptions
    )

    expect(getTokensModule.getTokens).toHaveBeenCalledTimes(3)
  })

  it('should attempt to fetch and save the log after each poll', async () => {
    jest
      .spyOn(requestClient, 'get')
      .mockImplementationOnce(() =>
        Promise.resolve({ result: 'pending', etag: '' })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({ result: 'running', etag: '' })
      )
      .mockImplementation(() =>
        Promise.resolve({ result: 'completed', etag: '' })
      )

    await pollJobState(
      requestClient,
      mockJob,
      false,
      'test',
      mockAuthConfig,
      defaultPollOptions
    )

    expect(saveLogModule.saveLog).toHaveBeenCalledTimes(2)
  })

  it('should return the current status when the max poll count is reached', async () => {
    jest
      .spyOn(requestClient, 'get')
      .mockImplementationOnce(() =>
        Promise.resolve({ result: 'pending', etag: '' })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({ result: 'running', etag: '' })
      )

    const state = await pollJobState(
      requestClient,
      mockJob,
      false,
      'test',
      mockAuthConfig,
      {
        ...defaultPollOptions,
        maxPollCount: 1
      }
    )

    expect(state).toEqual('running')
  })

  it('should continue polling until the job completes or errors', async () => {
    jest
      .spyOn(requestClient, 'get')
      .mockImplementationOnce(() =>
        Promise.resolve({ result: 'pending', etag: '' })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({ result: 'running', etag: '' })
      )
      .mockImplementation(() =>
        Promise.resolve({ result: 'completed', etag: '' })
      )

    const state = await pollJobState(
      requestClient,
      mockJob,
      false,
      'test',
      undefined,
      defaultPollOptions
    )

    expect(requestClient.get).toHaveBeenCalledTimes(4)
    expect(state).toEqual('completed')
  })

  it('should print the state to the console when debug is on', async () => {
    jest.spyOn((process as any).logger, 'info')
    jest
      .spyOn(requestClient, 'get')
      .mockImplementationOnce(() =>
        Promise.resolve({ result: 'pending', etag: '' })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({ result: 'running', etag: '' })
      )
      .mockImplementation(() =>
        Promise.resolve({ result: 'completed', etag: '' })
      )

    await pollJobState(
      requestClient,
      mockJob,
      true,
      'test',
      undefined,
      defaultPollOptions
    )

    expect((process as any).logger.info).toHaveBeenCalledTimes(4)
    expect((process as any).logger.info).toHaveBeenNthCalledWith(
      1,
      'Polling job status...'
    )
    expect((process as any).logger.info).toHaveBeenNthCalledWith(
      2,
      'Current job state: running'
    )
    expect((process as any).logger.info).toHaveBeenNthCalledWith(
      3,
      'Polling job status...'
    )
    expect((process as any).logger.info).toHaveBeenNthCalledWith(
      4,
      'Current job state: completed'
    )
  })

  it('should continue polling when there is a single error in between', async () => {
    jest
      .spyOn(requestClient, 'get')
      .mockImplementationOnce(() =>
        Promise.resolve({ result: 'pending', etag: '' })
      )
      .mockImplementationOnce(() => Promise.reject('Status Error'))
      .mockImplementationOnce(() =>
        Promise.resolve({ result: 'completed', etag: '' })
      )

    const state = await pollJobState(
      requestClient,
      mockJob,
      false,
      'test',
      undefined,
      defaultPollOptions
    )

    expect(requestClient.get).toHaveBeenCalledTimes(3)
    expect(state).toEqual('completed')
  })

  it('should throw an error when the error count exceeds the set value of 5', async () => {
    jest
      .spyOn(requestClient, 'get')
      .mockImplementation(() => Promise.reject('Status Error'))

    const error = await pollJobState(
      requestClient,
      mockJob,
      false,
      'test',
      undefined,
      defaultPollOptions
    ).catch((e) => e)

    expect(error).toContain('Error while getting job state after interval.')
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('../../../request/RequestClient')
  jest.mock('../../../auth/getTokens')
  jest.mock('../saveLog')

  jest
    .spyOn(requestClient, 'get')
    .mockImplementation(() =>
      Promise.resolve({ result: 'completed', etag: '' })
    )
  jest
    .spyOn(getTokensModule, 'getTokens')
    .mockImplementation(() => Promise.resolve(mockAuthConfig))
  jest
    .spyOn(saveLogModule, 'saveLog')
    .mockImplementation(() => Promise.resolve())
}
