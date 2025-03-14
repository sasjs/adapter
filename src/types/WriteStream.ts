import { WriteStream as FsWriteStream } from 'fs'

export interface WriteStream extends FsWriteStream {
  write(
    chunk: any,
    encoding?: BufferEncoding | ((error: Error | null | undefined) => void),
    cb?: (error: Error | null | undefined) => void
  ): boolean
  path: string | Buffer
}
