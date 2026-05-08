import NodeFormData from 'form-data'
import { ServerType } from '@sasjs/utils/types'
import { WebJobExecutor } from '../WebJobExecutor'
import { RequestClient } from '../../request/RequestClient'
import { SASViyaApiClient } from '../../SASViyaApiClient'

describe('WebJobExecutor.execute() Content-Type selection', () => {
  const serverUrl = 'https://sample.server.com'
  const jobsPath = '/SASJobExecution'

  const makeExecutor = () => {
    const requestClient = new RequestClient(serverUrl)
    const sasViyaApiClient = {} as SASViyaApiClient
    const executor = new WebJobExecutor(
      serverUrl,
      ServerType.Sas9,
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

  it('sends no body and text/plain when payload is empty and debug=false', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute('services/common/sendArr', null, baseConfig)

    expect(postSpy).toHaveBeenCalledTimes(1)
    const [, body, , contentType] = postSpy.mock.calls[0]
    expect(body).toBeUndefined()
    expect(contentType).toBe('text/plain')
  })

  it('sends no body and text/plain when data is an empty object', async () => {
    const { executor, postSpy } = makeExecutor()

    await executor.execute('services/common/sendArr', {}, baseConfig)

    const [, body, , contentType] = postSpy.mock.calls[0]
    expect(body).toBeUndefined()
    expect(contentType).toBe('text/plain')
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
    // never double-prefixed: at most one "boundary=" in the Content-Type
    const boundaryCount = ((contentType as string).match(/boundary=/g) ?? [])
      .length
    expect(boundaryCount).toBeLessThanOrEqual(1)
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
})
