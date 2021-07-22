import { WriteStream } from 'fs'

export const writeStream = async (
  stream: WriteStream,
  content: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    stream.write(content + '\n\nnext chunk\n\n', (e) => {
      if (e) {
        return reject(e)
      }
      return resolve()
    })
  })
}
