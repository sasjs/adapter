import NodeFormData from 'form-data'
import { ServerType } from '@sasjs/utils/types'
import { WebJobExecutor } from '../WebJobExecutor'
import { RequestClient } from '../../request/RequestClient'
import { SASViyaApiClient } from '../../SASViyaApiClient'

describe('WebJobExecutor.execute() Content-Type selection', () => {
  const serverUrl = 'https://sample.server.com'
  const jobsPath = '/SASJobExecution'

  const makeExecutor = (serverType: ServerType = ServerType.Sas9) => {
    const requestClient = new RequestClient(serverUrl)
    const sasViyaApiClient = {
      getJobsInFolder: async () => []
    } as unknown as SASViyaApiClient
    const executor = new WebJobExecutor(
      serverUrl,
      serverType,
      jobsPath,
      requestClient,
      sasViyaApiClient
    )
    const postSpy = jest
      .spyOn(requestClient, 'post')
      .mockResolvedValue({ result: { table1: [] }, etag: '' } as any)
    jest.spyOn(requestClient, 'appendRequest').mockImplementation()
    return { executor, postSpy }
  }

  const baseConfig = {
    serverUrl,
    serverType: ServerType.Sas9,
    appLoc: '/Public/app',
    debug: false
  }

  it('sends multipart form-data when payload is empty and debug=false', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute('services/common/sendArr', null, baseConfig)

    expect(postSpy).toHaveBeenCalledTimes(1)
    const [, body, , contentType] = postSpy.mock.calls[0]
    expect(body).toBeInstanceOf(NodeFormData)
    expect(contentType).toMatch(/^multipart\/form-data/)
  })

  it('sends multipart form-data when data is an empty object', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute('services/common/sendArr', {}, baseConfig)

    const [, body, , contentType] = postSpy.mock.calls[0]
    expect(body).toBeInstanceOf(NodeFormData)
    expect(contentType).toMatch(/^multipart\/form-data/)
  })

  it('sends multipart form-data when data has content', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute(
      'services/common/sendArr',
      { table1: [{ col1: 'v' }] },
      baseConfig
    )

    const [, body, , contentType] = postSpy.mock.calls[0]
    expect(body).toBeInstanceOf(NodeFormData)
    expect(contentType).toMatch(/^multipart\/form-data/)
  })

  it('sends multipart with debug params when payload empty but debug=true', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute('services/common/sendArr', null, {
      ...baseConfig,
      debug: true
    })

    const [, body, , contentType] = postSpy.mock.calls[0]
    expect(body).toBeInstanceOf(NodeFormData)
    expect(contentType).toMatch(/^multipart\/form-data/)
  })

  it('appends _program to form body for SasViya when sasJob contains _executionTasks=true', async () => {
    const { executor, postSpy } = makeExecutor(ServerType.SasViya)

    await executor.execute(
      'services/common/sendArr&_executionTasks=true',
      null,
      { ...baseConfig, serverType: ServerType.SasViya }
    )

    const [, body] = postSpy.mock.calls[0]
    expect(body).toBeInstanceOf(NodeFormData)
    expect((body as NodeFormData).getBuffer().toString()).toContain(
      'name="_program"'
    )
  })

  it('does not append _program for SasViya when sasJob has no _executionTasks=true', async () => {
    const { executor, postSpy } = makeExecutor(ServerType.SasViya)

    await executor.execute('services/common/sendArr', null, {
      ...baseConfig,
      serverType: ServerType.SasViya
    })

    const [, body] = postSpy.mock.calls[0]
    expect(body).toBeInstanceOf(NodeFormData)
    expect((body as NodeFormData).getBuffer().toString()).not.toContain(
      'name="_program"'
    )
  })
})
