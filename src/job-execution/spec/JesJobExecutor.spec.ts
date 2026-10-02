import { SASViyaApiClient } from '../../SASViyaApiClient'
import { JesJobExecutor } from '../JesJobExecutor'
import { JobExecutionError, LoginRequiredError } from '../../types/errors'

describe('JesJobExecutor', () => {
  const serverUrl = 'https://sample.server.com'

  const makeExecutor = () => {
    const sasViyaApiClient = {
      executeJob: jest.fn(),
      appendRequest: jest.fn()
    } as unknown as SASViyaApiClient
    const executor = new JesJobExecutor(serverUrl, sasViyaApiClient)
    const waitingSpy = jest
      .spyOn(executor as any, 'appendWaitingRequest')
      .mockImplementation()
    return { executor, sasViyaApiClient, waitingSpy }
  }

  const baseConfig = {
    serverUrl,
    appLoc: '/Public/app',
    contextName: 'SAS Job Execution compute context',
    debug: false
  }

  afterEach(() => jest.clearAllMocks())

  it('executes the job with the configured context and resolves the response', async () => {
    const { executor, sasViyaApiClient } = makeExecutor()
    ;(sasViyaApiClient.executeJob as jest.Mock).mockResolvedValue({
      result: { ok: true }
    })

    const response: any = await executor.execute(
      'common/sendObj',
      null,
      baseConfig
    )

    expect(sasViyaApiClient.executeJob).toHaveBeenCalledWith(
      'common/sendObj',
      'SAS Job Execution compute context',
      false,
      null,
      undefined
    )
    expect(response).toEqual({ ok: true })
    expect(sasViyaApiClient.appendRequest).toHaveBeenCalled()
  })

  it('turns a JobExecutionError into an ErrorResponse', async () => {
    const { executor, sasViyaApiClient } = makeExecutor()
    ;(sasViyaApiClient.executeJob as jest.Mock).mockRejectedValue(
      new JobExecutionError(7, 'job blew up', '')
    )

    await expect(
      executor.execute('common/sendObj', null, baseConfig)
    ).rejects.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'Error Code 7: job blew up' })
      })
    )
    expect(sasViyaApiClient.appendRequest).toHaveBeenCalled()
  })

  it('queues the request when a login is required', async () => {
    const { executor, sasViyaApiClient, waitingSpy } = makeExecutor()
    ;(sasViyaApiClient.executeJob as jest.Mock).mockRejectedValue(
      new LoginRequiredError()
    )
    const loginCallback = jest.fn()

    void executor.execute('common/sendObj', null, baseConfig, loginCallback)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(waitingSpy).toHaveBeenCalled()
    expect(loginCallback).toHaveBeenCalled()
  })
})
