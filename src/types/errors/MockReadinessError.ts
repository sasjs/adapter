export class MockReadinessError extends Error {
  code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'MockReadinessError'
    this.code = code
    Object.setPrototypeOf(this, MockReadinessError.prototype)
  }
}
