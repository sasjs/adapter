import { WriteStream } from '../../../types'
import { writeStream } from '../writeStream'
import {
  createWriteStream,
  fileExists,
  readFile,
  deleteFile
} from '@sasjs/utils/file'

describe('writeStream', () => {
  const filename = 'test.txt'
  const content = 'test'

  let stream: WriteStream

  beforeAll(async () => {
    stream = await createWriteStream(filename)
  })

  beforeEach(async () => {
    await deleteFile(filename).catch(() => {}) // Ignore errors if the file doesn't exist
    stream = await createWriteStream(filename)
  })

  afterEach(async () => {
    await deleteFile(filename).catch(() => {}) // Ensure cleanup after test
  })

  it('should resolve when the stream is written successfully', async () => {
    await expect(writeStream(stream, content)).toResolve()
    await expect(fileExists(filename)).resolves.toEqual(true)
    await expect(readFile(filename)).resolves.toEqual(content + '\n')

    await deleteFile(filename)
  })

  it('should reject when the write errors out', async () => {
    // Mock implementation of the write method
    jest
      .spyOn(stream, 'write')
      .mockImplementation(
        (
          chunk: any,
          encodingOrCb?:
            | BufferEncoding
            | ((error: Error | null | undefined) => void),
          cb?: (error: Error | null | undefined) => void
        ) => {
          const callback =
            typeof encodingOrCb === 'function' ? encodingOrCb : cb
          if (callback) {
            callback(new Error('Test Error')) // Simulate an error
          }
          return true // Simulate that the write operation was called
        }
      )

    // Call the writeStream function and catch the error
    const error = await writeStream(stream, content).catch((e: any) => e)

    // Assert that the error is correctly handled
    expect(error.message).toEqual('Test Error')
  })
})
