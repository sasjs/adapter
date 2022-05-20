export class InvalidCsrfError extends Error {
  constructor() {
    const message = 'Invalid CSRF token!'

    super(`Auth error: ${message}`)
    this.name = 'InvalidCsrfError'
    Object.setPrototypeOf(this, InvalidCsrfError.prototype)
  }
}
