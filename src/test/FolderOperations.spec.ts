import { RequestClient } from '../request/RequestClient'
import { SASViyaApiClient } from '../SASViyaApiClient'
import axios from 'axios'
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('FolderOperations', () => {
  const sasViyaApiClient = new SASViyaApiClient(
    'https://sample.server.com',
    '/Public',
    'Context',
    new RequestClient('https://sample.server.com')
  )

  beforeEach(() => {})

  it('should move and rename folder', async () => {
    mockFetchResponse(false)

    let res: any = await sasViyaApiClient.moveFolder(
      '/Test/fromFolder/oldName',
      '/Test/toFolder/newName',
      'newName',
      'token'
    )

    expect(res.folder.name).toEqual('newName')
    expect(res.folder.parentFolderUri.split('=')[1]).toEqual('/Test/toFolder')
  })

  it('should move and keep the name of folder', async () => {
    mockFetchResponse(true)

    let res: any = await sasViyaApiClient.moveFolder(
      '/Test/fromFolder/oldName',
      '/Test/toFolder',
      'toFolder',
      'token'
    )

    expect(res.folder.name).toEqual('oldName')
    expect(res.folder.parentFolderUri.split('=')[1]).toEqual('/Test/toFolder')
  })

  it('should only rename folder', async () => {
    mockFetchResponse(false)

    let res: any = await sasViyaApiClient.moveFolder(
      '/Test/toFolder/oldName',
      '/Test/toFolder/newName',
      'newName',
      'token'
    )

    expect(res.folder.name).toEqual('newName')
    expect(res.folder.parentFolderUri.split('=')[1]).toEqual('/Test/toFolder')
  })
})

const mockFetchResponse = (targetFolderExists: boolean) => {
  mockedAxios.patch.mockImplementation((url: any, request: any) => {
    return Promise.resolve({ status: 200, data: { folder: request } })
  })

  mockedAxios.get.mockImplementation((url: any, request: any) => {
    if (!targetFolderExists && url.includes('newName')) {
      return Promise.resolve(undefined)
    }

    return Promise.resolve({
      status: 200,
      data: {
        id: url
      }
    })
  })
}
