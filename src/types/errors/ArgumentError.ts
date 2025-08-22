export class ArgumentError extends Error {
  constructor(public message: string) {
    super(message)
    this.name = 'ArgumentError'
    Object.setPrototypeOf(this, ArgumentError.prototype)
  }
}
