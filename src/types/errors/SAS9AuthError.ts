export class SAS9AuthError extends Error {
  constructor() {
    super(
      'The credentials you provided cannot be authenticated. Please provide a valid set of credentials.'
    )
    this.name = 'AuthorizeError'
    Object.setPrototypeOf(this, SAS9AuthError.prototype)
  }
}
