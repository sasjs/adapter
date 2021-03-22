import { Link } from './Link'
import { JobResult } from './JobResult'
import { LogStatistics } from './LogStatistics'

export interface Job {
  id: string
  name: string
  uri: string
  createdBy: string
  code?: string
  links: Link[]
  results: JobResult
  error?: any
  logStatistics: LogStatistics
}
