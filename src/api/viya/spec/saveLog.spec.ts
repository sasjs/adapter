import { Logger, LogLevel } from '@sasjs/utils'
import * as fileModule from '@sasjs/utils/file'
import { RequestClient } from '../../../request/RequestClient'
import * as fetchLogsModule from '../../../utils/fetchLogByChunks'
import { saveLog } from '../saveLog'
import { mockJob } from './mockResponses'

const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()

describe('saveLog', () => {
  beforeEach(() => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    setupMocks()
  })

  it('should return immediately if shouldSaveLog is false', async () => {
    await saveLog(mockJob, requestClient, false, '/test', 't0k3n')

    expect(fetchLogsModule.fetchLogByChunks).not.toHaveBeenCalled()
    expect(fileModule.createFile).not.toHaveBeenCalled()
  })

  it('should throw an error when a valid access token is not provided', async () => {
    const error = await saveLog(mockJob, requestClient, true, '/test').catch(
      (e) => e
    )

    expect(error.message).toContain(
      `Logs for job ${mockJob.id} cannot be fetched without a valid access token.`
    )
  })

  it('should throw an error when the log URL is not available', async () => {
    const error = await saveLog(
      { ...mockJob, links: mockJob.links.filter((l) => l.rel !== 'log') },
      requestClient,
      true,
      '/test',
      't0k3n'
    ).catch((e) => e)

    expect(error.message).toContain(
      `Log URL for job ${mockJob.id} was not found.`
    )
  })

  it('should fetch and save logs to the given path', async () => {
    await saveLog(mockJob, requestClient, true, '/test', 't0k3n')

    expect(fetchLogsModule.fetchLogByChunks).toHaveBeenCalledWith(
      requestClient,
      't0k3n',
      '/log/content',
      100
    )
    expect(fileModule.createFile).toHaveBeenCalledWith('/test', 'Test Log')
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('../../../request/RequestClient')
  jest.mock('../../../utils/fetchLogByChunks')
  jest.mock('@sasjs/utils')

  jest
    .spyOn(fetchLogsModule, 'fetchLogByChunks')
    .mockImplementation(() => Promise.resolve('Test Log'))
  jest
    .spyOn(fileModule, 'createFile')
    .mockImplementation(() => Promise.resolve())
}
