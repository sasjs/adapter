export interface WriteStream {
  write: (content: string, callback: (err?: Error) => any) => void
  path: string
}
