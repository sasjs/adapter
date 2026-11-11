/**
 * Whether a failed request came back with an HTTP response.
 *
 * The request client turns a response into an error of its own - a 401 becomes a
 * `LoginRequiredError` carrying the body, a 404 a `NotFoundError` - so the axios
 * error, and with it the `response` property, is gone by the time a caller sees
 * the failure. That is why this cannot be inferred at the call site from the
 * error's shape: `throwIfError` has already replaced the shape.
 *
 * So the boundary stamps what it knows (`markResponseReceived`) and callers ask
 * this module. The `response` property is still the fallback, for errors that
 * never passed through the request client - but the marker wins when both are
 * present, because the boundary saw the response itself rather than a rebuilt
 * error that may or may not carry it.
 */

/** The property the request client leaves on an error it built. */
const MARKER = 'responseReceived'

/**
 * Records on an error whether the request it reports on came back with a
 * response. Returns the same error, so a throw site reads `throw mark(...)`.
 * Marks are kept but hidden: the error travels to the caller, where a new
 * enumerable field would show up in a log, a `JSON.stringify`, or a
 * deep-equality assertion against an unmarked copy - a difference nothing to do
 * with the request, reported as though it were.
 *
 * A frozen error cannot take the mark; it is returned unchanged and
 * `responseWasReceived` falls back to whatever `response` the error carries.
 */
export const markResponseReceived = <T>(error: T, received: boolean): T => {
  if (!error || (typeof error !== 'object' && typeof error !== 'function'))
    return error

  try {
    Object.defineProperty(error, MARKER, {
      value: received,
      enumerable: false,
      configurable: true,
      writable: true
    })
  } catch {
    // not extensible: leave it unmarked rather than fail the request twice
  }

  return error
}

/**
 * Whether the failure behind this error came with an HTTP response.
 *
 * `false` is what a transport failure looks like: a wrong URL, a closed port, a
 * VPN that is down, a certificate that does not verify. The message that
 * accompanies such a failure is the transport's own (`connect ETIMEDOUT
 * 192.0.2.1:443`), not something a server said.
 */
export const responseWasReceived = (error: unknown): boolean => {
  const marked = (error as { responseReceived?: unknown } | null | undefined)
    ?.responseReceived

  if (typeof marked === 'boolean') return marked

  return Boolean((error as { response?: unknown } | null | undefined)?.response)
}
