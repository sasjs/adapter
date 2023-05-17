export interface PollOptions {
  maxPollCount: number
  pollInterval: number // milliseconds
  pollStrategy?: PollStrategy
  streamLog?: boolean
  logFolderPath?: string
}

export type PollStrategy = PollOptions[]
