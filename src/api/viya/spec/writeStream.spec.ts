import { WriteStream } from '../../../types'
import { writeStream } from '../writeStream'
import 'jest-extended'

describe('writeStream', () => {
  const stream: WriteStream = {
    write: jest.fn(),
    path: 'test'
  }

  it('should resolve when the stream is written successfully', async () => {
    expect(writeStream(stream, 'test')).toResolve()

    expect(stream.write).toHaveBeenCalledWith('test\n', expect.anything())
  })

  it('should reject when the write errors out', async () => {
    jest
      .spyOn(stream, 'write')
      .mockImplementation((_, callback) => callback(new Error('Test Error')))
    const error = await writeStream(stream, 'test').catch((e) => e)

    expect(error.message).toEqual('Test Error')
  })
})
