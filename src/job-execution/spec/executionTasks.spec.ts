import NodeFormData from 'form-data'
import { ServerType } from '@sasjs/utils/types'
import { WebJobExecutor } from '../WebJobExecutor'
import { RequestClient } from '../../request/RequestClient'
import { SASViyaApiClient } from '../../SASViyaApiClient'

describe('WebJobExecutor _executionTasks=true behaviour', () => {
  const serverUrl = 'https://sample.server.com'
  const jobsPath = '/SASJobExecution'

  const makeExecutor = (serverType: ServerType = ServerType.SasViya) => {
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
    serverType: ServerType.SasViya,
    appLoc: '/Public/app',
    debug: false
  }

  it('sends table data in body', async () => {
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

  it('sends table data when _executionTasks=true', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute(
      'services/common/sendArr&_executionTasks=true',
      { table1: [{ col1: 'v' }] },
      baseConfig
    )

    const [apiUrl, body, , contentType] = postSpy.mock.calls[0]
    expect(apiUrl).toContain('_program=/Public/app/services/common/sendArr')
    expect(apiUrl).toContain('_executionTasks=true')
    expect(body).toBeInstanceOf(NodeFormData)
    expect(contentType).toMatch(/^multipart\/form-data/)
    const dump = (body as NodeFormData).getBuffer().toString()
    expect(dump).toContain('name="sasjs_tables"')
    expect(dump).toContain('name="sasjs1data"')
  })

  it('uploads as file when payload has semicolons', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute(
      'services/common/sendArr',
      { table1: [{ col1: 'has; semicolon' }] },
      baseConfig
    )

    const [apiUrl, body, , contentType] = postSpy.mock.calls[0]
    expect(apiUrl).toContain('_program=')
    expect(apiUrl).not.toContain('_executionTasks=')
    expect(body).toBeInstanceOf(NodeFormData)
    expect(body).not.toBeInstanceOf(URLSearchParams)
    expect(contentType).toMatch(/^multipart\/form-data/)
    expect(contentType).not.toBe('application/x-www-form-urlencoded')
  })

  it('uploads as file when _executionTasks=true and payload has semicolons', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute(
      'services/common/sendArr&_executionTasks=true',
      { table1: [{ col1: 'has; semicolon' }] },
      baseConfig
    )

    const [apiUrl, body, , contentType] = postSpy.mock.calls[0]
    expect(apiUrl).toContain('_program=')
    expect(apiUrl).toContain('_executionTasks=true')
    expect(body).toBeInstanceOf(NodeFormData)
    expect(body).not.toBeInstanceOf(URLSearchParams)
    expect(contentType).toMatch(/^multipart\/form-data/)
    expect(contentType).not.toBe('application/x-www-form-urlencoded')
    const dump = (body as NodeFormData).getBuffer().toString()
    expect(dump).toContain('filename="table1.csv"')
    expect(dump).toContain('Content-Type: application/csv')
  })
})
