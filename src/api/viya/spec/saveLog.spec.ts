import { Logger, LogLevel } from '@sasjs/utils/logger'
import { RequestClient } from '../../../request/RequestClient'
import * as fetchLogsModule from '../../../utils/fetchLogByChunks'
import * as writeStreamModule from '../writeStream'
import { saveLog } from '../saveLog'
import { mockJob } from './mockResponses'
import { WriteStream } from '../../../types'

const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()
const stream = {} as unknown as WriteStream

describe('saveLog', () => {
  beforeEach(() => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    setupMocks()
  })

  it('should throw an error when a valid access token is not provided', async () => {
    const error = await saveLog(mockJob, requestClient, 0, 100, stream).catch(
      (e: any) => e
    )

    expect(error.message).toContain(
      `Logs for job ${mockJob.id} cannot be fetched without a valid access token.`
    )
  })

  it('should throw an error when the log URL is not available', async () => {
    const error = await saveLog(
      { ...mockJob, links: mockJob.links.filter((l) => l.rel !== 'log') },
      requestClient,
      0,
      100,
      stream,
      't0k3n'
    ).catch((e: any) => e)

    expect(error.message).toContain(
      `Log URL for job ${mockJob.id} was not found.`
    )
  })

  it('should fetch and save logs to the given path', async () => {
    await saveLog(mockJob, requestClient, 0, 100, stream, 't0k3n')

    expect(fetchLogsModule.fetchLog).toHaveBeenCalledWith(
      requestClient,
      't0k3n',
      '/log/content',
      0,
      100
    )
    expect(writeStreamModule.writeStream).toHaveBeenCalledWith(
      stream,
      'Test Log'
    )
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('../../../request/RequestClient')
  jest.mock('../../../utils/fetchLogByChunks')
  jest.mock('@sasjs/utils')
  jest.mock('../writeStream')

  jest
    .spyOn(fetchLogsModule, 'fetchLog')
    .mockImplementation(() => Promise.resolve('Test Log'))
  jest
    .spyOn(writeStreamModule, 'writeStream')
    .mockImplementation(() => Promise.resolve(true))
}
