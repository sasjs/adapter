export class NoSessionStateError extends Error {
  constructor(
    public serverResponseStatus: number,
    public sessionStateUrl: string,
    public logUrl: string
  ) {
    super(
      `Could not get session state. Server responded with ${serverResponseStatus} whilst checking state: ${sessionStateUrl}`
    )

    this.name = 'NoSessionStatus'

    Object.setPrototypeOf(this, NoSessionStateError.prototype)
  }
}
