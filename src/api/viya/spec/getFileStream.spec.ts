import { Logger, LogLevel } from '@sasjs/utils/logger'
import * as path from 'path'
import * as fileModule from '@sasjs/utils/file'
import { getFileStream } from '../getFileStream'
import { mockJob } from './mockResponses'
import { WriteStream } from '../../../types'

describe('getFileStream', () => {
  beforeEach(() => {
    ;(process as any).logger = new Logger(LogLevel.Off)
    setupMocks()
  })
  it('should use the given log path if it points to a file', async () => {
    const { createWriteStream } = require('@sasjs/utils/file')

    await getFileStream(mockJob, path.join(__dirname, 'test.log'))

    expect(createWriteStream).toHaveBeenCalledWith(
      path.join(__dirname, 'test.log')
    )
  })

  it('should generate a log file path with a timestamp if it points to a folder', async () => {
    const { createWriteStream } = require('@sasjs/utils/file')

    await getFileStream(mockJob, __dirname)

    expect(createWriteStream).not.toHaveBeenCalledWith(__dirname)
    expect(createWriteStream).toHaveBeenCalledWith(
      expect.stringContaining(path.join(__dirname, '/test job-20'))
    )
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('@sasjs/utils/file/file')
  jest
    .spyOn(fileModule, 'createWriteStream')
    .mockImplementation(() => Promise.resolve({} as unknown as WriteStream))
}
