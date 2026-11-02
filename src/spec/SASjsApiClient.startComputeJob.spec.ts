import { Logger, LogLevel } from '@sasjs/utils/logger'
import { AuthConfig, ServerType } from '@sasjs/utils/types'
import { SASjsApiClient } from '../SASjsApiClient'
import * as pollJobStateModule from '../api/viya/pollJobState'
import { JobState } from '../api/viya/pollJobState'
import { ComputeJobExecutionError } from '../types/errors'

const mockAuthConfig: AuthConfig = {
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  client: 'test-client',
  secret: 'test-secret'
}

const mockPost = jest.fn()
const mockGet = jest.fn()

const mockRequestClient = {
  post: mockPost,
  get: mockGet
} as any

/**
 * `startComputeJob` on a SASjs Server: no compute context, no job definition -
 * the program is a file in the drive, triggered by path. The result is the
 * shape a Viya compute job has, so the code that polls a job and fetches its log
 * does not need to know which server it is following.
 */
describe('SASjsApiClient.startComputeJob (SASjs Server)', () => {
  let client: SASjsApiClient

  beforeEach(() => {
    ;(process as any).logger = new Logger(LogLevel.Off)

    mockPost.mockReset()
    mockGet.mockReset()

    mockAuthConfig.access_token = 'test-access'
    client = new SASjsApiClient(mockRequestClient)

    jest
      .spyOn(pollJobStateModule, 'pollJobState')
      .mockImplementation(() => Promise.resolve(JobState.Completed))
  })

  afterEach(() => jest.restoreAllMocks())

  it('triggers the program and returns a job with state and log links', async () => {
    mockPost.mockResolvedValue({
      result: { sessionId: 'session-1', pid: 4321 }
    })
    mockGet.mockResolvedValue({ result: 'the log' })

    const { job } = await client.startComputeJob(
      '/Public/app/run.sas',
      null,
      {},
      mockAuthConfig,
      false
    )

    expect(mockPost).toHaveBeenCalledWith(
      'SASjsApi/stp/trigger?_program=%2FPublic%2Fapp%2Frun.sas',
      {},
      'test-access'
    )

    expect(job.id).toEqual('session-1')
    expect(job.links).toEqual([
      {
        rel: 'state',
        href: '/SASjsApi/session/session-1/state',
        method: 'GET'
      },
      { rel: 'log', href: '/SASjsApi/session/session-1/log', method: 'GET' },
      { rel: 'self', href: '/SASjsApi/session/session-1', method: 'GET' }
    ])
  })

  it('fails loudly when the trigger answers with a failure body', async () => {
    // the server answers 200 with this body when the program does not exist, so
    // without the check the caller gets links built from `undefined` and sees a
    // 404 on a state URL instead of the reason
    mockPost.mockResolvedValue({
      result: {
        status: 'failure',
        message: 'Job execution failed.',
        error: 'The Program at (/jobs/x) does not exist.'
      }
    })

    await expect(
      client.startComputeJob('/jobs/x', null, {}, mockAuthConfig, false)
    ).rejects.toThrow('The Program at (/jobs/x) does not exist.')
  })

  it('resolves the program against appLoc when the path is relative', async () => {
    mockPost.mockResolvedValue({ result: { sessionId: 'session-1' } })

    await client.startComputeJob(
      'run.sas',
      null,
      { appLoc: '/Public/app' },
      mockAuthConfig,
      false
    )

    expect(mockPost.mock.calls[0][0]).toContain(
      '_program=%2FPublic%2Fapp%2Frun.sas'
    )
  })

  it('sends data and macro variables as query parameters', async () => {
    mockPost.mockResolvedValue({ result: { sessionId: 'session-1' } })

    await client.startComputeJob(
      '/Public/app/run.sas',
      { region: 'emea' },
      {},
      mockAuthConfig,
      false,
      undefined,
      false,
      { year: '2026' }
    )

    const url = mockPost.mock.calls[0][0]

    expect(url).toContain('region=emea')
    expect(url).toContain('year=2026')
  })

  it('adds _debug only when the config asks for it', async () => {
    mockPost.mockResolvedValue({ result: { sessionId: 'session-1' } })

    await client.startComputeJob(
      '/Public/app/run.sas',
      null,
      {},
      mockAuthConfig,
      false
    )
    expect(mockPost.mock.calls[0][0]).not.toContain('_debug')

    await client.startComputeJob(
      '/Public/app/run.sas',
      null,
      { debug: true },
      mockAuthConfig,
      false
    )
    expect(mockPost.mock.calls[1][0]).toContain('_debug=131')
  })

  it('includes the pid only when asked, and only when the server reported one', async () => {
    mockPost.mockResolvedValue({
      result: { sessionId: 'session-1', pid: 4321 }
    })

    const withoutPid = await client.startComputeJob(
      '/Public/app/run.sas',
      null,
      {},
      mockAuthConfig,
      false
    )
    expect((withoutPid.job as any).pid).toBeUndefined()

    const withPid = await client.startComputeJob(
      '/Public/app/run.sas',
      null,
      {},
      mockAuthConfig,
      false,
      undefined,
      true
    )
    expect((withPid.job as any).pid).toEqual(4321)
  })

  it('polls when asked to wait, and returns the finished state and the log', async () => {
    mockPost.mockResolvedValue({ result: { sessionId: 'session-1' } })
    mockGet.mockResolvedValue({ result: 'NOTE: hello' })

    const { job, log } = await client.startComputeJob(
      '/Public/app/run.sas',
      null,
      {},
      mockAuthConfig,
      true
    )

    expect(pollJobStateModule.pollJobState).toHaveBeenCalled()

    // the server is named, so the poller mints a SASjs token rather than a Viya
    // one and reads a JSON state body
    expect(
      (pollJobStateModule.pollJobState as jest.Mock).mock.calls[0][7]
    ).toEqual(ServerType.Sasjs)

    expect((job as any).state).toEqual(JobState.Completed)
    expect(log).toEqual('NOTE: hello')
  })

  it('throws with the job when the program failed, so the caller can still read the log', async () => {
    mockPost.mockResolvedValue({ result: { sessionId: 'session-1' } })
    mockGet.mockResolvedValue({ result: 'ERROR: it went wrong' })

    jest
      .spyOn(pollJobStateModule, 'pollJobState')
      .mockImplementation(() => Promise.resolve(JobState.Failed))

    await expect(
      client.startComputeJob(
        '/Public/app/run.sas',
        null,
        {},
        mockAuthConfig,
        true
      )
    ).rejects.toBeInstanceOf(ComputeJobExecutionError)
  })

  it('survives a log that cannot be read yet', async () => {
    mockPost.mockResolvedValue({ result: { sessionId: 'session-1' } })
    mockGet.mockRejectedValue(new Error('404'))

    const { job, log } = await client.startComputeJob(
      '/Public/app/run.sas',
      null,
      {},
      mockAuthConfig,
      true
    )

    expect((job as any).state).toEqual(JobState.Completed)
    expect(log).toEqual('')
  })
})
