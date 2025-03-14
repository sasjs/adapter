import { WriteStream } from '../../types'

export const writeStream = async (
  stream: WriteStream,
  content: string
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    stream.write(content + '\n', (err: Error | null | undefined) => {
      if (err) {
        reject(err) // Reject on write error
      } else {
        resolve(true) // Resolve on successful write
      }
    })
  })
}
