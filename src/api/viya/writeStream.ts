import { WriteStream } from '../../types'

export const writeStream = async (
  stream: WriteStream,
  content: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    stream.write(content + '\n', (e) => {
      if (e) {
        return reject(e)
      }
      return resolve()
    })
  })
}
