export class AuthorizeError extends Error {
  constructor(
    public message: string,
    public confirmUrl: string
  ) {
    super(message)
    this.name = 'AuthorizeError'
    Object.setPrototypeOf(this, AuthorizeError.prototype)
  }
}
