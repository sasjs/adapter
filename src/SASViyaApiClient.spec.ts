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
      .catch((e: any) => e)

    expect(error).toBeInstanceOf(RootFolderNotFoundError)
  })

  it('should throw an error when ', async () => {
    const testMessage1 = 'test message 1'
    const testMessage2 = 'test message 2.'

    jest.spyOn(requestClient, 'post').mockImplementation(() => {
      return Promise.reject({
        message: testMessage1,
        response: { data: { message: testMessage2 }, status: 409 }
      })
    })

    const error = await sasViyaApiClient
      .createFolder('test', '/foo')
      .catch((e: any) => e)

    const expectedError = `${testMessage1}. ${testMessage2} To override, please set "isForced" to "true".`

    expect(error).toEqual(expectedError)
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
