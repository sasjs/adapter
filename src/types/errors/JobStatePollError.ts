export class JobStatePollError extends Error {
  constructor(
    id: string,
    public originalError: Error
  ) {
    super(
      `Error while polling job state for job ${id}: ${
        originalError.message || originalError
      }`
    )
    this.name = 'JobStatePollError'
    Object.setPrototypeOf(this, JobStatePollError.prototype)
  }
}
