import { Logger, LogLevel } from '@sasjs/utils/logger'
import { ServerType, AuthConfig } from '@sasjs/utils/types'
import SASjs from '../SASjs'
import { SASViyaApiClient } from '../SASViyaApiClient'
import { OnTokensRefreshed } from '../auth/getTokens'

const mockAuthConfig: AuthConfig = {
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  client: 'test-client',
  secret: 'test-secret'
}

describe('SASjs.startComputeJob', () => {
  let sasjs: SASjs
  let executeComputeJobSpy: jest.SpyInstance

  beforeEach(() => {
    ;(process as any).logger = new Logger(LogLevel.Off)

    sasjs = new SASjs({
      serverUrl: 'https://test.com',
      serverType: ServerType.SasViya,
      contextName: 'test context'
    })

    // Replace the private sasViyaApiClient with a stub whose
    // executeComputeJob we can spy on.
    ;(sasjs as any).sasViyaApiClient = new SASViyaApiClient(
      'https://test.com',
      '/test',
      'test context',
      undefined as any
    )

    executeComputeJobSpy = jest
      .spyOn((sasjs as any).sasViyaApiClient, 'executeComputeJob')
      .mockImplementation(() =>
        Promise.resolve({ job: { state: 'completed' } })
      )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should forward onTokensRefreshed to executeComputeJob', async () => {
    const onTokensRefreshed: OnTokensRefreshed = jest.fn()

    await sasjs.startComputeJob(
      '/Public/test/job',
      null,
      { contextName: 'test context' },
      mockAuthConfig,
      true,
      { maxPollCount: 0, pollInterval: 0 },
      false,
      undefined,
      undefined,
      onTokensRefreshed
    )

    expect(executeComputeJobSpy).toHaveBeenCalledWith(
      '/Public/test/job',
      'test context',
      false,
      null,
      mockAuthConfig,
      true,
      false,
      { maxPollCount: 0, pollInterval: 0 },
      false,
      undefined,
      onTokensRefreshed
    )
  })

  it('should default onTokensRefreshed to undefined when not provided', async () => {
    await sasjs.startComputeJob(
      '/Public/test/job',
      null,
      { contextName: 'test context' },
      mockAuthConfig,
      true
    )

    const lastArg = executeComputeJobSpy.mock.calls[0]
    // onTokensRefreshed is the 11th positional arg (index 10)
    expect(lastArg[10]).toBeUndefined()
  })
})
