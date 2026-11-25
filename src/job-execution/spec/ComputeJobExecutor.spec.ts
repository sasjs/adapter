import { SASViyaApiClient } from '../../SASViyaApiClient'
import { ComputeJobExecutor } from '../ComputeJobExecutor'
import {
  ComputeJobExecutionError,
  ErrorResponse,
  LoginRequiredError
} from '../../types/errors'

describe('ComputeJobExecutor', () => {
  const serverUrl = 'https://sample.server.com'

  /**
   * Generous bound for the race that detects a promise which never settles.
   * The executors under test resolve or reject within a couple of microtask
   * ticks; anything still pending after this many real milliseconds is a
   * hang, not a slow machine.
   */
  const TEST_SETTLE_BOUND_MS = 5000

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

  const bounded = async <T>(promise: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout>
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('request timed out')),
            TEST_SETTLE_BOUND_MS
          )
        })
      ])
    } finally {
      clearTimeout(timer!)
    }
  }

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

  it('rejects a login-required job without a callback and never replays it', async () => {
    const { executor, sasViyaApiClient, waitingSpy } = makeExecutor()
    waitingSpy.mockRestore()
    const loginError = new LoginRequiredError()
    const execute = sasViyaApiClient.executeComputeJob as jest.Mock
    execute.mockRejectedValue(loginError)

    await expect(
      bounded(executor.execute('common/sendObj', null, baseConfig))
    ).rejects.toEqual(
      new ErrorResponse(
        'Request is not authenticated. Make sure .env file exists with valid credentials.',
        loginError
      )
    )
    expect(execute).toHaveBeenCalledTimes(1)
    execute.mockResolvedValue({ result: { ok: true } })
    await bounded(executor.resendWaitingRequests())
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('replays successfully after a login callback when a callback was given', async () => {
    const { executor, sasViyaApiClient, waitingSpy } = makeExecutor()
    waitingSpy.mockRestore()
    const loginError = new LoginRequiredError()
    const execute = sasViyaApiClient.executeComputeJob as jest.Mock
    let loggedIn = false
    execute.mockImplementation(async () => {
      if (!loggedIn) throw loginError
      return { result: { ok: true } }
    })

    let signalLogin: () => void = () => {}
    const loginCalled = new Promise<void>((resolve) => {
      signalLogin = resolve
    })
    const loginCallback = jest.fn(async () => {
      loggedIn = true
      signalLogin()
    })
    const response = executor.execute(
      'common/sendObj',
      null,
      baseConfig,
      loginCallback
    )
    await bounded(loginCalled)
    expect(loginCallback).toHaveBeenCalledTimes(1)
    await bounded(executor.resendWaitingRequests())
    await expect(bounded(response)).resolves.toEqual({ ok: true })
    expect(execute).toHaveBeenCalledTimes(2)
  })
})
