export class InvalidJsonError extends Error {
  constructor() {
    super('Error: invalid Json string')
    this.name = 'InvalidJsonError'
    Object.setPrototypeOf(this, InvalidJsonError.prototype)
  }
}
