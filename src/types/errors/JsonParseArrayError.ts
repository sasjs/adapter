export class JsonParseArrayError extends Error {
  constructor(public message: string) {
    super(message)
    this.name = 'JsonParseArrayError'
    Object.setPrototypeOf(this, JsonParseArrayError.prototype)
  }
}
