import { ServerType } from '@sasjs/utils/types'
import { WebJobExecutor } from '../WebJobExecutor'
import { RequestClient } from '../../request/RequestClient'
import { SASViyaApiClient } from '../../SASViyaApiClient'
import { JobExecutionError, LoginRequiredError } from '../../types/errors'
import { generateFileUploadForm } from '../../file/generateFileUploadForm'
import { generateTableUploadForm } from '../../file/generateTableUploadForm'

jest.mock('../../file/generateFileUploadForm')
jest.mock('../../file/generateTableUploadForm')

describe('WebJobExecutor', () => {
  const serverUrl = 'https://sample.server.com'
  const jobsPath = '/SASJobExecution'

  const makeExecutor = (
    serverType: ServerType = ServerType.SasViya,
    jobsInFolder: any[] = []
  ) => {
    const requestClient = new RequestClient(serverUrl)
    const sasViyaApiClient = {
      getJobsInFolder: jest.fn().mockResolvedValue(jobsInFolder)
    } as unknown as SASViyaApiClient
    const executor = new WebJobExecutor(
      serverUrl,
      serverType,
      jobsPath,
      requestClient,
      sasViyaApiClient
    )
    const postSpy = jest.spyOn(requestClient, 'post')
    const appendRequestSpy = jest
      .spyOn(requestClient, 'appendRequest')
      .mockImplementation()
    const waitingSpy = jest
      .spyOn(executor as any, 'appendWaitingRequest')
      .mockImplementation()
    return {
      executor,
      postSpy,
      requestClient,
      sasViyaApiClient,
      appendRequestSpy,
      waitingSpy
    }
  }

  const baseConfig = {
    serverUrl,
    serverType: ServerType.SasViya,
    appLoc: '/Public/app',
    debug: false
  }

  const jobDefinition = {
    name: 'configure',
    contentType: 'jobDefinition',
    uri: '/jobs/jobs/1234'
  }

  afterEach(() => jest.clearAllMocks())

  it('sends the job uri as _job once and renames _program to __program', async () => {
    const { executor, postSpy, sasViyaApiClient } = makeExecutor(
      ServerType.SasViya,
      [jobDefinition]
    )
    postSpy.mockResolvedValue({ result: { ok: true }, etag: '' } as any)

    await executor.execute('common/configure', null, {
      ...baseConfig,
      contextName: 'Compute Reusable'
    })

    expect(sasViyaApiClient.getJobsInFolder).toHaveBeenCalledWith(
      '/Public/app/common'
    )
    const url = postSpy.mock.calls[0][0] as string
    expect(url).toContain('_job=/jobs/jobs/1234')
    expect(url.match(/_job=/g)).toHaveLength(1)
    expect(url).toContain('__program=')
    expect(url).not.toContain('&_program=')
    expect(url).toContain('_contextname=Compute%20Reusable')
  })

  it('looks up the whole folder path for a job nested below the appLoc', async () => {
    const { executor, postSpy, sasViyaApiClient } = makeExecutor(
      ServerType.SasViya,
      [jobDefinition]
    )
    postSpy.mockResolvedValue({ result: { ok: true }, etag: '' } as any)

    await executor.execute('services/common/configure', null, baseConfig)

    expect(sasViyaApiClient.getJobsInFolder).toHaveBeenCalledWith(
      '/Public/app/services/common'
    )
    const url = postSpy.mock.calls[0][0] as string
    expect(url).toContain('_job=/jobs/jobs/1234')
  })

  it('looks up the appLoc itself for a job at the root', async () => {
    const { executor, postSpy, sasViyaApiClient } = makeExecutor(
      ServerType.SasViya,
      [{ name: 'myJob', contentType: 'jobDefinition', uri: '/jobs/jobs/7' }]
    )
    postSpy.mockResolvedValue({ result: { ok: true }, etag: '' } as any)

    await executor.execute('myJob', null, baseConfig)

    expect(sasViyaApiClient.getJobsInFolder).toHaveBeenCalledWith('/Public/app')
    const url = postSpy.mock.calls[0][0] as string
    expect(url).toContain('_job=/jobs/jobs/7')
  })

  it('leaves _program in place when no job definition matches', async () => {
    const { executor, postSpy } = makeExecutor(ServerType.SasViya, [])
    postSpy.mockResolvedValue({ result: { ok: true }, etag: '' } as any)

    await executor.execute('common/configure', null, baseConfig)

    const url = postSpy.mock.calls[0][0] as string
    expect(url).not.toContain('_job=')
    expect(url).toContain('_program=')
    expect(url).not.toContain('__program=')
  })

  it('rejects with an ErrorResponse when the job uri lookup fails', async () => {
    const { executor, postSpy, sasViyaApiClient } = makeExecutor()
    ;(sasViyaApiClient.getJobsInFolder as jest.Mock).mockRejectedValue(
      new Error('lookup exploded')
    )

    await expect(
      executor.execute('services/common/configure', null, baseConfig)
    ).rejects.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'lookup exploded' })
      })
    )
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('queues the request when the job uri lookup needs a login', async () => {
    const { executor, waitingSpy } = makeExecutor()
    ;(executor as any).sasViyaApiClient.getJobsInFolder = jest
      .fn()
      .mockRejectedValue(new LoginRequiredError())
    const loginCallback = jest.fn()

    void executor.execute(
      'services/common/configure',
      null,
      baseConfig,
      loginCallback
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(waitingSpy).toHaveBeenCalled()
    expect(loginCallback).toHaveBeenCalled()
  })

  it('parses a webout response on the Sas9 debug path', async () => {
    const { executor, postSpy } = makeExecutor(ServerType.Sas9)
    postSpy.mockResolvedValue({
      result: '>>weboutBEGIN<<{"a":1}>>weboutEND<<',
      etag: ''
    } as any)

    const response: any = await executor.execute(
      'services/common/configure',
      null,
      { ...baseConfig, serverType: ServerType.Sas9, debug: true }
    )

    expect(response).toEqual('{"a":1}')
  })

  it('passes a non-string Sas9 debug result straight through', async () => {
    const { executor, postSpy } = makeExecutor(ServerType.Sas9)
    postSpy.mockResolvedValue({ result: { a: 1 }, etag: '' } as any)

    const response: any = await executor.execute(
      'services/common/configure',
      null,
      { ...baseConfig, serverType: ServerType.Sas9, debug: true }
    )

    expect(response).toEqual({ a: 1 })
  })

  it('turns a JobExecutionError into an ErrorResponse and records the request', async () => {
    const { executor, postSpy, appendRequestSpy } = makeExecutor()
    postSpy.mockRejectedValue(new JobExecutionError(42, 'job blew up', ''))

    await expect(
      executor.execute('services/common/configure', null, baseConfig)
    ).rejects.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Error Code 42: job blew up'
        })
      })
    )
    expect(appendRequestSpy).toHaveBeenCalled()
  })

  it('rejects with a login message when a login is required and no callback was given', async () => {
    const { executor, postSpy } = makeExecutor()
    postSpy.mockRejectedValue(new LoginRequiredError())

    await expect(
      executor.execute('services/common/configure', null, baseConfig)
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

    void executor.execute(
      'services/common/configure',
      null,
      baseConfig,
      loginCallback
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(waitingSpy).toHaveBeenCalled()
    expect(loginCallback).toHaveBeenCalled()
  })

  it('rejects with an ErrorResponse when the file upload form cannot be built', async () => {
    const { executor } = makeExecutor()
    ;(generateFileUploadForm as jest.Mock).mockImplementation(() => {
      throw new Error('upload form failed')
    })

    await expect(
      executor.execute(
        'services/common/configure',
        { table1: [{ col1: 'value;with;semicolons' }] },
        baseConfig
      )
    ).rejects.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'upload form failed' })
      })
    )
  })

  it('rejects with an ErrorResponse when the table upload form cannot be built', async () => {
    const { executor } = makeExecutor()
    ;(generateTableUploadForm as jest.Mock).mockImplementation(() => {
      throw new Error('table form failed')
    })

    await expect(
      executor.execute(
        'services/common/configure',
        { table1: [{ col1: 'plain' }] },
        baseConfig
      )
    ).rejects.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'table form failed' })
      })
    )
  })

  it('reads the job name and folder from an absolute job path', async () => {
    const { executor, sasViyaApiClient } = makeExecutor(ServerType.SasViya, [
      { name: 'myJob', contentType: 'jobDefinition', uri: '/jobs/jobs/999' }
    ])

    const uri = await (executor as any).getJobUri('/Public/app/jobs/myJob')

    expect(sasViyaApiClient.getJobsInFolder).toHaveBeenCalledWith(
      '/Public/app/jobs'
    )
    expect(uri).toEqual('/jobs/jobs/999')
  })

  it('throws when the job name cannot be determined', async () => {
    const { executor } = makeExecutor()

    await expect((executor as any).getJobUri('/')).rejects.toThrow(
      'Job name is empty, null or undefined.'
    )
  })

  it('returns an empty uri when there is no Viya api client', async () => {
    const requestClient = new RequestClient(serverUrl)
    const executor = new WebJobExecutor(
      serverUrl,
      ServerType.SasViya,
      jobsPath,
      requestClient,
      undefined as unknown as SASViyaApiClient
    )

    await expect(
      (executor as any).getJobUri('services/common/configure')
    ).resolves.toEqual('')
  })
})
