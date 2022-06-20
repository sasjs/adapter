import { RequestClient } from '../../../request/RequestClient'
import { SessionManager } from '../../../SessionManager'
import { executeScript } from '../executeScript'
import { mockSession, mockAuthConfig, mockJob } from './mockResponses'
import * as pollJobStateModule from '../pollJobState'
import * as uploadTablesModule from '../uploadTables'
import * as getTokensModule from '../../../auth/getTokens'
import * as formatDataModule from '../../../utils/formatDataForRequest'
import * as fetchLogsModule from '../../../utils/fetchLogByChunks'
import { PollOptions } from '../../../types'
import { ComputeJobExecutionError, NotFoundError } from '../../../types/errors'
import { Logger, LogLevel } from '@sasjs/utils'

const sessionManager = new (<jest.Mock<SessionManager>>SessionManager)()
const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()
const defaultPollOptions: PollOptions = {
  maxPollCount: 100,
  pollInterval: 500,
  streamLog: false
}

describe('executeScript', () => {
  beforeEach(() => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    setupMocks()
  })

  it('should not try to get fresh tokens if an authConfig is not provided', async () => {
    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put hello'],
      'test context'
    )

    expect(getTokensModule.getTokens).not.toHaveBeenCalled()
  })

  it('should try to get fresh tokens if an authConfig is provided', async () => {
    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put hello'],
      'test context',
      mockAuthConfig
    )

    expect(getTokensModule.getTokens).toHaveBeenCalledWith(
      requestClient,
      mockAuthConfig
    )
  })

  it('should get a session from the session manager before executing', async () => {
    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put hello'],
      'test context'
    )

    expect(sessionManager.getSession).toHaveBeenCalledWith(undefined)
  })

  it('should handle errors while getting a session', async () => {
    jest
      .spyOn(sessionManager, 'getSession')
      .mockImplementation(() => Promise.reject('Test Error'))

    const error = await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put hello'],
      'test context'
    ).catch(e => e)

    expect(error).toContain('Error while getting session.')
  })

  it('should fetch the PID when printPid is true', async () => {
    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put hello'],
      'test context',
      mockAuthConfig,
      null,
      false,
      false,
      false,
      defaultPollOptions,
      true
    )

    expect(sessionManager.getVariable).toHaveBeenCalledWith(
      mockSession.id,
      'SYSJOBID',
      mockAuthConfig.access_token
    )
  })

  it('should handle errors while getting the job PID', async () => {
    jest
      .spyOn(sessionManager, 'getVariable')
      .mockImplementation(() => Promise.reject('Test Error'))

    const error = await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put hello'],
      'test context',
      mockAuthConfig,
      null,
      false,
      false,
      false,
      defaultPollOptions,
      true
    ).catch(e => e)

    expect(error).toContain('Error while getting session variable.')
  })

  it('should use the file upload approach when data contains semicolons', async () => {
    jest
      .spyOn(uploadTablesModule, 'uploadTables')
      .mockImplementation(() =>
        Promise.resolve([{ tableName: 'test', file: { id: 1 } }])
      )

    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put hello'],
      'test context',
      mockAuthConfig,
      { foo: 'bar;' },
      false,
      false,
      false,
      defaultPollOptions,
      true
    )

    expect(uploadTablesModule.uploadTables).toHaveBeenCalledWith(
      requestClient,
      { foo: 'bar;' },
      mockAuthConfig.access_token
    )
  })

  it('should format data as CSV when it does not contain semicolons', async () => {
    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put hello'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      false,
      false,
      false,
      defaultPollOptions,
      true
    )

    expect(formatDataModule.formatDataForRequest).toHaveBeenCalledWith({
      foo: 'bar'
    })
  })

  it('should submit a job for execution via the compute API', async () => {
    jest
      .spyOn(formatDataModule, 'formatDataForRequest')
      .mockImplementation(() => ({ sasjs_tables: 'foo', sasjs0data: 'bar' }))

    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      false,
      false,
      false,
      defaultPollOptions,
      true
    )

    expect(requestClient.post).toHaveBeenCalledWith(
      `/compute/sessions/${mockSession.id}/jobs`,
      {
        name: 'exec-test',
        description: 'Powered by SASjs',
        code: ['%put "hello";'],
        variables: {
          SYS_JES_JOB_URI: '',
          _program: 'test/test',
          sasjs_tables: 'foo',
          sasjs0data: 'bar'
        },
        arguments: {
          _contextName: 'test context',
          _OMITJSONLISTING: true,
          _OMITJSONLOG: true,
          _OMITSESSIONRESULTS: true,
          _OMITTEXTLISTING: true,
          _OMITTEXTLOG: true
        }
      },
      mockAuthConfig.access_token
    )
  })

  it('should set the correct variables when debug is true', async () => {
    jest
      .spyOn(formatDataModule, 'formatDataForRequest')
      .mockImplementation(() => ({ sasjs_tables: 'foo', sasjs0data: 'bar' }))

    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      true,
      false,
      false,
      defaultPollOptions,
      true
    )

    expect(requestClient.post).toHaveBeenCalledWith(
      `/compute/sessions/${mockSession.id}/jobs`,
      {
        name: 'exec-test',
        description: 'Powered by SASjs',
        code: ['%put "hello";'],
        variables: {
          SYS_JES_JOB_URI: '',
          _program: 'test/test',
          sasjs_tables: 'foo',
          sasjs0data: 'bar',
          _DEBUG: 131
        },
        arguments: {
          _contextName: 'test context',
          _OMITJSONLISTING: true,
          _OMITJSONLOG: true,
          _OMITSESSIONRESULTS: false,
          _OMITTEXTLISTING: true,
          _OMITTEXTLOG: false
        }
      },
      mockAuthConfig.access_token
    )
  })

  it('should handle errors during job submission', async () => {
    jest
      .spyOn(requestClient, 'post')
      .mockImplementation(() => Promise.reject('Test Error'))

    const error = await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      true,
      false,
      false,
      defaultPollOptions,
      true
    ).catch(e => e)

    expect(error).toContain('Error while posting job')
  })

  it('should immediately return the session when waitForResult is false', async () => {
    const result = await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      true,
      false,
      false,
      defaultPollOptions,
      true
    )

    expect(result).toEqual(mockSession)
  })

  it('should poll for job completion when waitForResult is true', async () => {
    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      false,
      false,
      true,
      defaultPollOptions,
      true
    )

    expect(pollJobStateModule.pollJobState).toHaveBeenCalledWith(
      requestClient,
      mockJob,
      false,
      mockAuthConfig,
      defaultPollOptions
    )
  })

  it('should handle general errors when polling for job status', async () => {
    jest
      .spyOn(pollJobStateModule, 'pollJobState')
      .mockImplementation(() => Promise.reject('Poll Error'))

    const error = await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      false,
      false,
      true,
      defaultPollOptions,
      true
    ).catch(e => e)

    expect(error).toContain('Error while polling job status.')
  })

  it('should fetch the log and append it to the error in case of a 5113 error code', async () => {
    jest
      .spyOn(pollJobStateModule, 'pollJobState')
      .mockImplementation(() =>
        Promise.reject({ response: { data: 'err=5113,' } })
      )

    const error = await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      false,
      false,
      true,
      defaultPollOptions,
      true
    ).catch(e => e)

    expect(fetchLogsModule.fetchLogByChunks).toHaveBeenCalledWith(
      requestClient,
      mockAuthConfig.access_token,
      mockJob.links.find(l => l.rel === 'up')!.href + '/log',
      1000000
    )
    expect(error.log).toEqual('Test Log')
  })

  it('should fetch the logs for the job if debug is true and a log URL is available', async () => {
    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      true,
      false,
      true,
      defaultPollOptions,
      true
    )

    expect(fetchLogsModule.fetchLogByChunks).toHaveBeenCalledWith(
      requestClient,
      mockAuthConfig.access_token,
      mockJob.links.find(l => l.rel === 'log')!.href + '/content',
      mockJob.logStatistics.lineCount
    )
  })

  it('should not fetch the logs for the job if debug is false', async () => {
    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      false,
      false,
      true,
      defaultPollOptions,
      true
    )

    expect(fetchLogsModule.fetchLogByChunks).not.toHaveBeenCalled()
  })

  it('should throw a ComputeJobExecutionError if the job has failed', async () => {
    jest
      .spyOn(pollJobStateModule, 'pollJobState')
      .mockImplementation(() => Promise.resolve('failed'))

    const error: ComputeJobExecutionError = await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      true,
      false,
      true,
      defaultPollOptions,
      true
    ).catch(e => e)

    expect(fetchLogsModule.fetchLogByChunks).toHaveBeenCalledWith(
      requestClient,
      mockAuthConfig.access_token,
      mockJob.links.find(l => l.rel === 'log')!.href + '/content',
      mockJob.logStatistics.lineCount
    )

    expect(error).toBeInstanceOf(ComputeJobExecutionError)
    expect(error.log).toEqual('Test Log')
    expect(error.job).toEqual(mockJob)
  })

  it('should throw a ComputeJobExecutionError if the job has errored out', async () => {
    jest
      .spyOn(pollJobStateModule, 'pollJobState')
      .mockImplementation(() => Promise.resolve('error'))

    const error: ComputeJobExecutionError = await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      true,
      false,
      true,
      defaultPollOptions,
      true
    ).catch(e => e)

    expect(fetchLogsModule.fetchLogByChunks).toHaveBeenCalledWith(
      requestClient,
      mockAuthConfig.access_token,
      mockJob.links.find(l => l.rel === 'log')!.href + '/content',
      mockJob.logStatistics.lineCount
    )

    expect(error).toBeInstanceOf(ComputeJobExecutionError)
    expect(error.log).toEqual('Test Log')
    expect(error.job).toEqual(mockJob)
  })

  it('should fetch the result if expectWebout is true', async () => {
    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      false,
      true,
      true,
      defaultPollOptions,
      true
    )

    expect(requestClient.get).toHaveBeenCalledWith(
      `/compute/sessions/${mockSession.id}/filerefs/_webout/content`,
      mockAuthConfig.access_token,
      'text/plain'
    )
  })

  it('should fetch the logs if the webout file was not found', async () => {
    jest.spyOn(requestClient, 'get').mockImplementation((url, ...rest) => {
      if (url.includes('_webout')) {
        return Promise.reject(new NotFoundError(url))
      }
      return Promise.resolve({ result: mockJob, etag: '', status: 200 })
    })

    const error = await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      false,
      true,
      true,
      defaultPollOptions,
      true
    ).catch(e => e)

    expect(requestClient.get).toHaveBeenCalledWith(
      `/compute/sessions/${mockSession.id}/filerefs/_webout/content`,
      mockAuthConfig.access_token,
      'text/plain'
    )

    expect(fetchLogsModule.fetchLogByChunks).toHaveBeenCalledWith(
      requestClient,
      mockAuthConfig.access_token,
      mockJob.links.find(l => l.rel === 'log')!.href + '/content',
      mockJob.logStatistics.lineCount
    )

    expect(error.status).toEqual(500)
    expect(error.log).toEqual('Test Log')
  })

  it('should clear the session after execution is complete', async () => {
    await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      false,
      true,
      true,
      defaultPollOptions,
      true
    )

    expect(sessionManager.clearSession).toHaveBeenCalledWith(
      mockSession.id,
      mockAuthConfig.access_token
    )
  })

  it('should handle errors while clearing a session', async () => {
    jest
      .spyOn(sessionManager, 'clearSession')
      .mockImplementation(() => Promise.reject('Clear Session Error'))

    const error = await executeScript(
      requestClient,
      sessionManager,
      'test',
      'test',
      ['%put "hello";'],
      'test context',
      mockAuthConfig,
      { foo: 'bar' },
      false,
      true,
      true,
      defaultPollOptions,
      true
    ).catch(e => e)

    expect(error).toContain('Error while clearing session.')
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('../../../request/RequestClient')
  jest.mock('../../../SessionManager')
  jest.mock('../../../auth/getTokens')
  jest.mock('../pollJobState')
  jest.mock('../uploadTables')
  jest.mock('../../../utils/formatDataForRequest')
  jest.mock('../../../utils/fetchLogByChunks')

  jest
    .spyOn(requestClient, 'post')
    .mockImplementation(() => Promise.resolve({ result: mockJob, etag: '' }))
  jest
    .spyOn(requestClient, 'get')
    .mockImplementation(() =>
      Promise.resolve({ result: mockJob, etag: '', status: 200 })
    )
  jest
    .spyOn(requestClient, 'delete')
    .mockImplementation(() => Promise.resolve({ result: {}, etag: '' }))
  jest
    .spyOn(getTokensModule, 'getTokens')
    .mockImplementation(() => Promise.resolve(mockAuthConfig))
  jest
    .spyOn(pollJobStateModule, 'pollJobState')
    .mockImplementation(() => Promise.resolve('completed'))
  jest
    .spyOn(sessionManager, 'getVariable')
    .mockImplementation(() =>
      Promise.resolve({ result: { value: 'test' }, etag: 'test', status: 200 })
    )
  jest
    .spyOn(sessionManager, 'getSession')
    .mockImplementation(() => Promise.resolve(mockSession))
  jest
    .spyOn(sessionManager, 'clearSession')
    .mockImplementation(() => Promise.resolve())
  jest
    .spyOn(formatDataModule, 'formatDataForRequest')
    .mockImplementation(() => ({ sasjs_tables: 'test', sasjs0data: 'test' }))
  jest
    .spyOn(fetchLogsModule, 'fetchLogByChunks')
    .mockImplementation(() => Promise.resolve('Test Log'))
}
