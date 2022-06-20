import { WriteStream } from '../../types'

export const writeStream = async (
  stream: WriteStream,
  content: string
): Promise<void> =>
  stream.write(content + '\n', (e: any) => {
    if (e) return Promise.reject(e)

    return Promise.resolve()
  })
