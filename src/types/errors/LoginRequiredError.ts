export class LoginRequiredError extends Error {
  constructor() {
    super('Auth error: You must be logged in to access this resource')
    this.name = 'LoginRequiredError'
    Object.setPrototypeOf(this, LoginRequiredError.prototype)
  }
}
