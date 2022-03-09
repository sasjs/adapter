export class LoginRequiredError extends Error {
  constructor(details?: any) {
    const message = details
      ? JSON.stringify(details, null, 2)
      : 'You must be logged in to access this resource'

    super(`Auth error: ${message}`)
    this.name = 'LoginRequiredError'
    Object.setPrototypeOf(this, LoginRequiredError.prototype)
  }
}
