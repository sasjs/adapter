export class InvalidSASjsCsrfError extends Error {
  constructor() {
    const message = 'Invalid CSRF token!'

    super(`Auth error: ${message}`)
    this.name = 'InvalidSASjsCsrfError'
    Object.setPrototypeOf(this, InvalidSASjsCsrfError.prototype)
  }
}
