export class JobExecutionError extends Error {
  constructor(
    public errorCode: number,
    public errorMessage: string,
    public result: string
  ) {
    super(`Error Code ${errorCode}: ${errorMessage}`)
    this.name = 'JobExecutionError'
    Object.setPrototypeOf(this, JobExecutionError.prototype)
  }
}
