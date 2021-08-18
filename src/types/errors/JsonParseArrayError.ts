export class JsonParseArrayError extends Error {
  constructor() {
    super('Can not parse array object to json.')
    this.name = 'JsonParseArrayError'
    Object.setPrototypeOf(this, JsonParseArrayError.prototype)
  }
}
