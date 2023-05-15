export interface PollOptions {
  maxPollCount: number
  pollInterval: number // milliseconds
  streamLog: boolean
  logFolderPath?: string
}
