export class NotFoundError extends Error {
  constructor(public url: string) {
    super(`Error: Resource at ${url} was not found`)
    this.name = 'NotFoundError'
    Object.setPrototypeOf(this, NotFoundError.prototype)
  }
}
