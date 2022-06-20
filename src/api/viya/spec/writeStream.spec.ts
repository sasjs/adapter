import { WriteStream } from '../../../types'
import { writeStream } from '../writeStream'
import {
  createWriteStream,
  fileExists,
  readFile,
  deleteFile
} from '@sasjs/utils'

describe('writeStream', () => {
  const filename = 'test.txt'
  const content = 'test'
  let stream: WriteStream

  beforeAll(async () => {
    stream = await createWriteStream(filename)
  })

  it('should resolve when the stream is written successfully', async () => {
    await expect(writeStream(stream, content)).toResolve()
    await expect(fileExists(filename)).resolves.toEqual(true)
    await expect(readFile(filename)).resolves.toEqual(content + '\n')

    await deleteFile(filename)
  })

  it('should reject when the write errors out', async () => {
    jest
      .spyOn(stream, 'write')
      .mockImplementation((_, callback) => callback(new Error('Test Error')))
    const error = await writeStream(stream, content).catch((e: any) => e)

    expect(error.message).toEqual('Test Error')
  })
})
