import { LoginRequiredError } from './LoginRequiredError'

/**
 * The server rejected a refresh token.
 *
 * A 401 from the token endpoint is not the same answer as a 401 from a data
 * endpoint. The caller did present a credential - its refresh token - and the
 * server refused it, which means the pair on disk is dead and no amount of
 * retrying will revive it. Rendering that as "You must be logged in to access
 * this resource" points the reader at their login state when the thing to look
 * at is the stored refresh token.
 *
 * Both SASjs Server and SAS Viya issue single-use refresh tokens and compare
 * the presented token with the pair they currently hold, so a token that
 * another session has rotated - a browser tab, a second CLI run, a service
 * account - is refused even though its signature and expiry are still valid.
 * Re-use of a superseded token and expiry therefore produce the same answer,
 * and the message says both.
 *
 * Deliberately a subclass of {@link LoginRequiredError}: every caller that
 * treats a 401 as "obtain a new session" (the CLI among them) keeps working,
 * and only the explanation changes. `instanceof LoginRequiredError` remains a
 * valid check.
 */
export class RefreshTokenRejectedError extends LoginRequiredError {
  constructor(details?: any) {
    super(details)

    // LoginRequiredError's constructor pins the prototype to its own class (the
    // ES5 subclassing fix). Re-pin it here or `instanceof
    // RefreshTokenRejectedError` is false on the error that was just thrown.
    Object.setPrototypeOf(this, RefreshTokenRejectedError.prototype)

    this.name = 'RefreshTokenRejectedError'

    const response =
      details === undefined || details === null
        ? ''
        : `\nServer response: ${
            typeof details === 'string' ? details : JSON.stringify(details)
          }`

    this.message =
      'Auth error: the server rejected the refresh token - it has expired, or it ' +
      'has already been replaced by a newer pair. Refresh tokens are single use, ' +
      'so a pair that another session, browser tab or CLI run has already ' +
      'refreshed can no longer be used. Authenticate again to obtain a new pair.' +
      response
  }
}
