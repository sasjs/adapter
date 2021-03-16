export class InternalServerError extends Error {
  constructor() {
    super('Error: Internal server error.')

    this.name = 'InternalServerError'

    Object.setPrototypeOf(this, InternalServerError.prototype)
  }
}
