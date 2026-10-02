import { RequestClient } from '../../request/RequestClient'
import { SasjsJobExecutor } from '../SasjsJobExecutor'
import { LoginRequiredError } from '../../types/errors'
import { generateFileUploadForm } from '../../file/generateFileUploadForm'

jest.mock('../../file/generateFileUploadForm')

describe('SasjsJobExecutor', () => {
  const serverUrl = 'https://sample.server.com'
  const jobsPath = '/SASjsApi/stp/execute'

  const makeExecutor = () => {
    const requestClient = new RequestClient(serverUrl)
    const executor = new SasjsJobExecutor(serverUrl, jobsPath, requestClient)
    const postSpy = jest.spyOn(requestClient, 'post')
    const appendRequestSpy = jest
      .spyOn(requestClient, 'appendRequest')
      .mockImplementation()
    const waitingSpy = jest
      .spyOn(executor as any, 'appendWaitingRequest')
      .mockImplementation()
    return { executor, postSpy, appendRequestSpy, waitingSpy }
  }

  const baseConfig = {
    serverUrl,
    appLoc: '/Public/app',
    debug: false
  }

  afterEach(() => jest.clearAllMocks())

  it('posts to the appLoc program and parses a JSON string result', async () => {
    const { executor, postSpy } = makeExecutor()
    postSpy.mockResolvedValue({ result: '{"a":1}', log: '' } as any)

    const response: any = await executor.execute(
      'common/sendObj',
      { table1: [{ col1: 'x' }] },
      baseConfig
    )

    expect(postSpy.mock.calls[0][0]).toEqual(
      `${serverUrl}${jobsPath}/?_program=/Public/app/common/sendObj`
    )
    expect(response).toEqual({ a: 1 })
  })

  it('rejects when the job returns no webout', async () => {
    const { executor, postSpy, appendRequestSpy } = makeExecutor()
    postSpy.mockResolvedValue({ result: {}, log: 'some log' } as any)

    await expect(
      executor.execute('common/sendObj', null, baseConfig)
    ).rejects.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining('No webout was returned by job')
        })
      })
    )
    expect(appendRequestSpy).toHaveBeenCalled()
  })

  it('rejects with an ErrorResponse when the upload form cannot be built', async () => {
    const { executor } = makeExecutor()
    ;(generateFileUploadForm as jest.Mock).mockImplementation(() => {
      throw new Error('upload form failed')
    })

    await expect(
      executor.execute('common/sendObj', { table1: [] }, baseConfig)
    ).rejects.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'upload form failed' })
      })
    )
  })

  it('rejects with a login message when a login is required and no callback was given', async () => {
    const { executor, postSpy } = makeExecutor()
    postSpy.mockRejectedValue(new LoginRequiredError())

    await expect(
      executor.execute('common/sendObj', null, baseConfig)
    ).rejects.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message:
            'Request is not authenticated. Make sure .env file exists with valid credentials.'
        })
      })
    )
  })

  it('queues the request when a login is required and a callback was given', async () => {
    const { executor, postSpy, waitingSpy } = makeExecutor()
    postSpy.mockRejectedValue(new LoginRequiredError())
    const loginCallback = jest.fn()

    void executor.execute('common/sendObj', null, baseConfig, loginCallback)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(waitingSpy).toHaveBeenCalled()
    expect(loginCallback).toHaveBeenCalled()
  })
})
