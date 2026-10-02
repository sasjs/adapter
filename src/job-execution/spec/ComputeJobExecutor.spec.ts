import { SASViyaApiClient } from '../../SASViyaApiClient'
import { ComputeJobExecutor } from '../ComputeJobExecutor'
import {
  ComputeJobExecutionError,
  LoginRequiredError
} from '../../types/errors'

describe('ComputeJobExecutor', () => {
  const serverUrl = 'https://sample.server.com'

  const makeExecutor = () => {
    const sasViyaApiClient = {
      executeComputeJob: jest.fn(),
      appendRequest: jest.fn()
    } as unknown as SASViyaApiClient
    const executor = new ComputeJobExecutor(serverUrl, sasViyaApiClient)
    const waitingSpy = jest
      .spyOn(executor as any, 'appendWaitingRequest')
      .mockImplementation()
    return { executor, sasViyaApiClient, waitingSpy }
  }

  const baseConfig = {
    serverUrl,
    appLoc: '/Public/app',
    contextName: 'Compute Reusable',
    debug: true
  }

  afterEach(() => jest.clearAllMocks())

  it('waits for the result and resolves with it', async () => {
    const { executor, sasViyaApiClient } = makeExecutor()
    ;(sasViyaApiClient.executeComputeJob as jest.Mock).mockResolvedValue({
      result: { ok: true }
    })

    const response: any = await executor.execute(
      'common/sendObj',
      null,
      baseConfig
    )

    expect(sasViyaApiClient.executeComputeJob).toHaveBeenCalledWith(
      'common/sendObj',
      'Compute Reusable',
      true,
      null,
      undefined,
      true,
      true
    )
    expect(response).toEqual({ ok: true })
    expect(sasViyaApiClient.appendRequest).toHaveBeenCalled()
  })

  it('turns a ComputeJobExecutionError into an ErrorResponse', async () => {
    const { executor, sasViyaApiClient } = makeExecutor()
    ;(sasViyaApiClient.executeComputeJob as jest.Mock).mockRejectedValue(
      new ComputeJobExecutionError({} as any, 'log text')
    )

    await expect(
      executor.execute('common/sendObj', null, baseConfig)
    ).rejects.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Error: Job execution failed'
        })
      })
    )
    expect(sasViyaApiClient.appendRequest).toHaveBeenCalled()
  })

  it('queues the request when a login is required', async () => {
    const { executor, sasViyaApiClient, waitingSpy } = makeExecutor()
    ;(sasViyaApiClient.executeComputeJob as jest.Mock).mockRejectedValue(
      new LoginRequiredError()
    )
    const loginCallback = jest.fn()

    void executor.execute('common/sendObj', null, baseConfig, loginCallback)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(waitingSpy).toHaveBeenCalled()
    expect(loginCallback).toHaveBeenCalled()
  })
})
