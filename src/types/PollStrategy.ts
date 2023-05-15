export interface PollStrategy {
  maxPollCount: number
  pollInterval: number // milliseconds
  streamLog: boolean
  logFolderPath?: string
}

export type PollStrategies = PollStrategy[]
