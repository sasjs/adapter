import { Job } from '../Job'

export class ComputeJobExecutionError extends Error {
  constructor(
    public job: Job,
    public log: string
  ) {
    super('Error: Job execution failed')
    this.name = 'ComputeJobExecutionError'
    Object.setPrototypeOf(this, ComputeJobExecutionError.prototype)
  }
}
