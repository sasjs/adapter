import { ServerType } from '@sasjs/utils/types'
import { RequestClient } from '../../request/RequestClient'
import { Sas9JobExecutor } from '../Sas9JobExecutor'

describe('Sas9JobExecutor', () => {
  const serverUrl = 'https://sample.server.com'
  const jobsPath = '/SASStoredProcess/do'

  const makeExecutor = () => {
    const requestClient = new RequestClient(serverUrl)
    const executor = new Sas9JobExecutor(
      serverUrl,
      ServerType.Sas9,
      jobsPath,
      requestClient
    )
    const sas9Client = (executor as any).sas9RequestClient
    const postSpy = jest.spyOn(sas9Client, 'post')
    jest.spyOn(sas9Client, 'login').mockResolvedValue(undefined)
    const appendRequestSpy = jest
      .spyOn(requestClient, 'appendRequest')
      .mockImplementation()
    return { executor, postSpy, appendRequestSpy }
  }

  const baseConfig = {
    serverUrl,
    appLoc: '/Public/app',
    debug: false
  }

  afterEach(() => jest.clearAllMocks())

  it('posts to the appLoc program with the credentials and the debug flag', async () => {
    const { executor, postSpy } = makeExecutor()
    postSpy.mockResolvedValue({ result: 'ok' } as any)

    const response: any = await executor.execute('common/sendObj', null, {
      ...baseConfig,
      username: 'user1',
      password: 'secret',
      debug: true
    })

    const url = postSpy.mock.calls[0][0] as string
    expect(url).toContain(
      `${serverUrl}${jobsPath}?_program=/Public/app/common/sendObj`
    )
    expect(url).toContain('&_username=user1&_password=secret')
    expect(url).toContain('&_debug=131')
    expect(response.result).toEqual('ok')
  })

  it('uses a plain text content type when there is no data', async () => {
    const { executor, postSpy } = makeExecutor()
    postSpy.mockResolvedValue({ result: 'ok' } as any)

    await executor.execute('common/sendObj', null, baseConfig)

    expect(postSpy.mock.calls[0][3]).toEqual('text/plain')
  })

  it('records the result text when the request fails with one', async () => {
    const { executor, postSpy, appendRequestSpy } = makeExecutor()
    postSpy.mockRejectedValue({ result: 'the webout error text' })

    await expect(
      executor.execute('common/sendObj', null, baseConfig)
    ).rejects.toEqual(expect.objectContaining({ error: expect.anything() }))
    expect(appendRequestSpy).toHaveBeenCalledWith(
      'the webout error text',
      'common/sendObj',
      false
    )
  })

  it('falls back to the error message when the failure carries no result', async () => {
    const { executor, postSpy, appendRequestSpy } = makeExecutor()
    postSpy.mockRejectedValue({ message: 'request exploded' })

    await expect(
      executor.execute('common/sendObj', null, baseConfig)
    ).rejects.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'request exploded' })
      })
    )
    expect(appendRequestSpy).toHaveBeenCalledWith(
      'request exploded',
      'common/sendObj',
      false
    )
  })
})
