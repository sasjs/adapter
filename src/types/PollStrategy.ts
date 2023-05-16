export interface PollStrategy {
  maxPollCount: number
  pollInterval: number // milliseconds
  subsequentStrategies?: PollStrategy[]
  streamLog?: boolean
  logFolderPath?: string
}

export type PollStrategies = PollStrategy[]
