import { SASViyaApiClient } from '../SASViyaApiClient'
import { RequestClient } from '../request/RequestClient'

describe('SASViyaApiClient.getJobsInFolder', () => {
  const serverUrl = 'https://sample.server.com'
  const rootFolder = '/Public'

  const makeClient = () => {
    const requestClient = {
      get: jest.fn()
    } as unknown as RequestClient
    const client = new SASViyaApiClient(
      serverUrl,
      rootFolder,
      'Compute Reusable',
      requestClient
    )
    return { client, requestClient }
  }

  const folder = { id: 'folder-1', memberCount: 3 }
  const members = [{ name: 'jobA' }, { name: 'jobB' }]

  afterEach(() => jest.clearAllMocks())

  it('resolves a relative folder path against the root folder', async () => {
    const { client, requestClient } = makeClient()
    ;(requestClient.get as jest.Mock)
      .mockResolvedValueOnce({ result: folder })
      .mockResolvedValueOnce({ result: { items: members } })

    const jobs = await client.getJobsInFolder('services/common')

    expect(requestClient.get).toHaveBeenNthCalledWith(
      1,
      '/folders/folders/@item?path=/Public/services/common',
      undefined
    )
    expect(requestClient.get).toHaveBeenNthCalledWith(
      2,
      '/folders/folders/folder-1/members?limit=500',
      undefined
    )
    expect(jobs).toEqual(members)
  })

  it('uses an absolute folder path as given', async () => {
    const { client, requestClient } = makeClient()
    ;(requestClient.get as jest.Mock)
      .mockResolvedValueOnce({ result: folder })
      .mockResolvedValueOnce({ result: { items: members } })

    await client.getJobsInFolder('/Users/viyademo18/minimal-seed-app/services')

    expect(requestClient.get).toHaveBeenNthCalledWith(
      1,
      '/folders/folders/@item?path=/Users/viyademo18/minimal-seed-app/services',
      undefined
    )
  })

  it('serves a repeated lookup from the folder map', async () => {
    const { client, requestClient } = makeClient()
    ;(requestClient.get as jest.Mock)
      .mockResolvedValueOnce({ result: folder })
      .mockResolvedValueOnce({ result: { items: members } })

    await client.getJobsInFolder('services/common')
    const second = await client.getJobsInFolder('services/common')

    expect(requestClient.get).toHaveBeenCalledTimes(2)
    expect(second).toEqual(members)
  })

  it('asks for as many members as the folder holds when that exceeds 500', async () => {
    const { client, requestClient } = makeClient()
    ;(requestClient.get as jest.Mock)
      .mockResolvedValueOnce({ result: { id: 'big', memberCount: 1200 } })
      .mockResolvedValueOnce({ result: { items: members } })

    await client.getJobsInFolder('services/common')

    expect(requestClient.get).toHaveBeenNthCalledWith(
      2,
      '/folders/folders/big/members?limit=1200',
      undefined
    )
  })

  it('throws when the folder does not exist', async () => {
    const { client, requestClient } = makeClient()
    ;(requestClient.get as jest.Mock).mockResolvedValueOnce({
      result: undefined
    })

    await expect(client.getJobsInFolder('services/missing')).rejects.toThrow(
      'does not exist'
    )
  })

  it('prefixes an error raised while getting the folder', async () => {
    const { client, requestClient } = makeClient()
    ;(requestClient.get as jest.Mock).mockRejectedValueOnce(new Error('boom'))

    await expect(client.getJobsInFolder('services/common')).rejects.toThrow(
      'Error while getting folder. boom'
    )
  })
})
