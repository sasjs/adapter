export class WeboutResponseError extends Error {
  constructor(public url: string) {
    super(`Error: error while parsing response from ${url}`)
    this.name = 'WeboutResponseError'
    Object.setPrototypeOf(this, WeboutResponseError.prototype)
  }
}
