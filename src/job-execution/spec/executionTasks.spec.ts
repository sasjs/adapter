import NodeFormData from 'form-data'
import { ServerType } from '@sasjs/utils/types'
import { WebJobExecutor } from '../WebJobExecutor'
import { RequestClient } from '../../request/RequestClient'
import { SASViyaApiClient } from '../../SASViyaApiClient'

describe('WebJobExecutor runAsTask behaviour', () => {
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
    useComputeApi: false,
    debug: false
  }

  it('sends table data in body (runAsTask=false)', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute(
      'services/common/sendArr',
      { table1: [{ col1: 'v' }] },
      { ...baseConfig, runAsTask: false }
    )

    const [apiUrl, body, , contentType] = postSpy.mock.calls[0]
    expect(apiUrl).not.toContain('_executionTasks=true')
    expect(body).toBeInstanceOf(NodeFormData)
    expect(contentType).toMatch(/^multipart\/form-data/)
  })

  it('uploads as file when payload has semicolons (runAsTask=false)', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute(
      'services/common/sendArr',
      { table1: [{ col1: 'has; semicolon' }] },
      { ...baseConfig, runAsTask: false }
    )

    const [apiUrl, body, , contentType] = postSpy.mock.calls[0]
    expect(apiUrl).not.toContain('_executionTasks=')
    expect(body).toBeInstanceOf(NodeFormData)
    expect(contentType).toMatch(/^multipart\/form-data/)
  })

  it('appends &_executionTasks=true to URL when runAsTask=true and no data', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute('services/common/sendArr', null, {
      ...baseConfig,
      runAsTask: true
    })

    const [apiUrl] = postSpy.mock.calls[0]
    expect(apiUrl).toContain('&_executionTasks=true')
  })

  it('appends &_executionTasks=true and sends table data when runAsTask=true with one input table', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute(
      'services/common/sendArr',
      { table1: [{ col1: 'v' }] },
      { ...baseConfig, runAsTask: true }
    )

    const [apiUrl, body, , contentType] = postSpy.mock.calls[0]
    expect(apiUrl).toContain('&_executionTasks=true')
    expect(body).toBeInstanceOf(NodeFormData)
    expect(contentType).toMatch(/^multipart\/form-data/)
    const dump = (body as NodeFormData).getBuffer().toString()
    expect(dump).toContain('name="sasjs_tables"')
    expect(dump).toContain('name="sasjs1data"')
  })

  it('appends &_executionTasks=true to URL when runAsTask=true with multiple input tables', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute(
      'services/common/sendArr',
      { table1: [{ col1: 'v' }], table2: [{ col2: 'w' }] },
      { ...baseConfig, runAsTask: true }
    )

    const [apiUrl, body, , contentType] = postSpy.mock.calls[0]
    expect(apiUrl).toContain('&_executionTasks=true')
    expect(body).toBeInstanceOf(NodeFormData)
    expect(contentType).toMatch(/^multipart\/form-data/)
    const dump = (body as NodeFormData).getBuffer().toString()
    expect(dump).toContain('name="sasjs_tables"')
    expect(dump).toMatch(/table1\s+table2/)
  })

  it('uploads as file when runAsTask=true and payload has semicolons', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute(
      'services/common/sendArr',
      { table1: [{ col1: 'has; semicolon' }] },
      { ...baseConfig, runAsTask: true }
    )

    const [apiUrl, body, , contentType] = postSpy.mock.calls[0]
    expect(apiUrl).toContain('&_executionTasks=true')
    expect(body).toBeInstanceOf(NodeFormData)
    expect(contentType).toMatch(/^multipart\/form-data/)
    const dump = (body as NodeFormData).getBuffer().toString()
    expect(dump).toContain('filename="table1.csv"')
    expect(dump).toContain('Content-Type: application/csv')
  })

  it('does NOT append _executionTasks=true to URL when runAsTask=false', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute(
      'services/common/sendArr',
      { table1: [{ col1: 'v' }] },
      { ...baseConfig, runAsTask: false }
    )

    const [apiUrl] = postSpy.mock.calls[0]
    expect(apiUrl).not.toContain('_executionTasks=true')
  })
})
