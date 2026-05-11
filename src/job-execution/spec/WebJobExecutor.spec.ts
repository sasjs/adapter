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

  it('sends urlencoded body when _executionTasks=true and no payload', async () => {
    const { executor, postSpy } = makeExecutor(ServerType.SasViya)

    await executor.execute(
      'services/common/sendArr&_executionTasks=true',
      null,
      { ...baseConfig, serverType: ServerType.SasViya }
    )

    const [apiUrl, body, , contentType] = postSpy.mock.calls[0]
    expect(apiUrl).not.toContain('_program=')
    expect(apiUrl).not.toContain('_executionTasks=true')
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(contentType).toBe('application/x-www-form-urlencoded')
    const params = body as URLSearchParams
    expect(params.get('_program')).toBe('/Public/app/services/common/sendArr')
    expect(params.get('_executionTasks')).toBe('true')
  })

  it('sends urlencoded body with table data when _executionTasks=true', async () => {
    const { executor, postSpy } = makeExecutor(ServerType.SasViya)

    await executor.execute(
      'services/common/sendArr&_executionTasks=true',
      { table1: [{ col1: 'v' }] },
      { ...baseConfig, serverType: ServerType.SasViya }
    )

    const [, body, , contentType] = postSpy.mock.calls[0]
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(contentType).toBe('application/x-www-form-urlencoded')
    const params = body as URLSearchParams
    expect(params.get('_program')).toBe('/Public/app/services/common/sendArr')
    expect(params.get('_executionTasks')).toBe('true')
    expect(params.get('sasjs_tables')).toBe('table1')
    expect(params.get('sasjs1data')).toBeTruthy()
  })

  it('uses multipart for file upload on Viya without _executionTasks', async () => {
    const { executor, postSpy } = makeExecutor(ServerType.SasViya)

    await executor.execute(
      'services/common/sendArr',
      { table1: [{ col1: 'has; semicolon' }] },
      { ...baseConfig, serverType: ServerType.SasViya }
    )

    const [apiUrl, body, , contentType] = postSpy.mock.calls[0]
    expect(apiUrl).toContain('_program=')
    expect(apiUrl).not.toContain('_executionTasks=')
    expect(body).toBeInstanceOf(NodeFormData)
    expect(body).not.toBeInstanceOf(URLSearchParams)
    expect(contentType).toMatch(/^multipart\/form-data/)
    expect(contentType).not.toBe('application/x-www-form-urlencoded')
  })

  it('sends file as multipart when _executionTasks=true with file payload', async () => {
    const { executor, postSpy } = makeExecutor(ServerType.SasViya)

    await executor.execute(
      'services/common/sendArr&_executionTasks=true',
      { table1: [{ col1: 'has; semicolon' }] },
      { ...baseConfig, serverType: ServerType.SasViya }
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
