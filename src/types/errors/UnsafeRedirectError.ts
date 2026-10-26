/**
 * Thrown when a 302 cannot be followed safely.
 *
 * The SAS 9 client follows a redirect by hand, and the request carries the
 * access token, so a Location pointing at another origin is how that token
 * would reach a third party. A response that names no Location at all is
 * refused for the same reason - there is nothing safe to follow, and following
 * the original url again would loop.
 */
export class UnsafeRedirectError extends Error {
  constructor(
    public requestedUrl: string,
    public reason: string,
    public location?: string
  ) {
    super(
      `Refusing to follow the redirect from ${requestedUrl}: ${reason}` +
        (location === undefined ? '' : ` (Location: ${location})`)
    )
    this.name = 'UnsafeRedirectError'
    Object.setPrototypeOf(this, UnsafeRedirectError.prototype)
  }
}
