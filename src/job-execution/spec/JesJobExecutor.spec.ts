import { SASViyaApiClient } from '../../SASViyaApiClient'
import { JesJobExecutor } from '../JesJobExecutor'
import {
  ErrorResponse,
  JobExecutionError,
  LoginRequiredError
} from '../../types/errors'
import { bounded } from '../../test/utils/bounded'

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

  it('rejects a login-required job without a callback and never replays it', async () => {
    const { executor, sasViyaApiClient, waitingSpy } = makeExecutor()
    waitingSpy.mockRestore()
    const loginError = new LoginRequiredError()
    const execute = sasViyaApiClient.executeJob as jest.Mock
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
    const execute = sasViyaApiClient.executeJob as jest.Mock
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
