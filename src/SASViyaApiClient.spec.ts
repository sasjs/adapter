import { Logger, LogLevel } from '@sasjs/utils/logger'
import { RequestClient } from './request/RequestClient'
import { SASViyaApiClient } from './SASViyaApiClient'
import { Folder } from './types'
import { RootFolderNotFoundError } from './types/errors'

const mockFolder: Folder = {
  id: '1',
  uri: '/folder',
  links: [],
  memberCount: 1
}

const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()
const sasViyaApiClient = new SASViyaApiClient(
  'https://test.com',
  '/test',
  'test context',
  requestClient
)

describe('SASViyaApiClient', () => {
  beforeEach(() => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    setupMocks()
  })

  it('should throw an error when the root folder is not found on the server', async () => {
    jest
      .spyOn(requestClient, 'get')
      .mockImplementation(() => Promise.reject('Not Found'))
    const error = await sasViyaApiClient
      .createFolder('test', '/foo')
      .catch((e) => e)
    expect(error).toBeInstanceOf(RootFolderNotFoundError)
  })
})

const setupMocks = () => {
  jest
    .spyOn(requestClient, 'get')
    .mockImplementation(() =>
      Promise.resolve({ result: mockFolder, etag: '', status: 200 })
    )

  jest
    .spyOn(requestClient, 'post')
    .mockImplementation(() =>
      Promise.resolve({ result: mockFolder, etag: '', status: 200 })
    )
}
