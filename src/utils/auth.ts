import jwtDecode from 'jwt-decode'

/**
 * Checks if the Access Token is expired or is expiring in 1 hour.  A default Access Token
 * lasts 12 hours. If the Access Token expires, the Refresh Token is used to fetch a new
 * Access Token. In the case that the Refresh Token is expired, 1 hour is enough to let
 * most jobs finish.
 * @param {string} token- token string that will be evaluated
 */
export function isAccessTokenExpiring(token: string): boolean {
  if (!token) {
    return true
  }
  const payload = jwtDecode<{ exp: number }>(token)
  const timeToLive = payload.exp - new Date().valueOf() / 1000

  return timeToLive <= 60 * 60 // 1 hour
}

/**
 * Checks if the Refresh Token is expired or expiring in 30 secs. A default Refresh Token
 * lasts 30 days.  Once the Refresh Token expires, the user must re-authenticate (provide
 * credentials in a browser to obtain an authorisation code). 30 seconds is enough time
 * to make a request for a final Access Token.
 * @param {string} token- token string that will be evaluated
 */
export function isRefreshTokenExpiring(token?: string): boolean {
  if (!token) {
    return true
  }
  const payload = jwtDecode<{ exp: number }>(token)
  const timeToLive = payload.exp - new Date().valueOf() / 1000

  return timeToLive <= 30 // 30 seconds
}
