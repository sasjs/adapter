/**
 * What a failed token request may say about the request it sent.
 *
 * A token failure is read by a person, pasted into a ticket and captured in CI
 * logs, and the request behind it carries the credentials that minted it: an
 * `Authorization` header holding the client id and secret base64-encoded
 * together, a body holding a refresh token, and the authorization code itself.
 * Printing those turns one error report into a credential disclosure, so this
 * module names the values that are secret and replaces each with a marker.
 *
 * The marker is a fixed string, not an empty one, so a reader can tell "this was
 * supplied" from "this was not". Keys are matched case-insensitively.
 */
export const REDACTED = '<redacted>'

/**
 * The parameter names that carry a credential, in any of the spellings the
 * estate uses: OAuth's snake case, the adapter's camel case, and the headers a
 * server sets alongside a session.
 */
const SECRET_KEYS = [
  'authorization',
  'cookie',
  'x-csrf-token',
  'x-xsrf-token',
  'client_secret',
  'clientsecret',
  'secret',
  'password',
  'passwd',
  'refresh_token',
  'refreshtoken',
  'access_token',
  'accesstoken',
  'id_token',
  'idtoken',
  'code'
]

/** A parameter name with the spellings that vary (case, hyphen, underscore) removed. */
const normalise = (key: string) => key.toLowerCase().replace(/[\s_-]/g, '')

/** Whether a parameter name carries a credential. */
export const isSecretKey = (key: string) =>
  SECRET_KEYS.map(normalise).includes(normalise(key))

/**
 * An `Authorization` value with its scheme kept and its credential removed.
 *
 * The scheme stays because it is the part a reader diagnoses with: `Basic`
 * means a client pair, `Bearer` means a token, and the two fail in different
 * ways.
 */
export const redactAuthorizationValue = (value: unknown): string => {
  const scheme = /^(basic|bearer|negotiate|digest)\b/i.exec(String(value))?.[0]

  return scheme ? `${scheme} ${REDACTED}` : REDACTED
}

/** Request headers, with the credential-bearing ones redacted. */
export const redactHeaders = (headers: {}): {} =>
  Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      isSecretKey(key) ? redactAuthorizationValue(value) : value
    ])
  )

/**
 * A request payload, with the credential-bearing values redacted.
 *
 * Three shapes reach this function: a plain object, `URLSearchParams` (the form
 * the OAuth code exchange is sent as), and multipart form data (the refresh,
 * whose parts are a stream rather than an enumerable map). The last is reported
 * as its shape rather than its fields, because the parts cannot be read without
 * consuming the stream the request still needs.
 */
export const redactPayload = (data: {} | undefined): unknown => {
  if (!data) return data

  const candidate = data as any

  if (typeof candidate.getBoundary === 'function')
    return 'multipart form data - fields and values redacted'

  if (
    typeof candidate.entries === 'function' &&
    typeof candidate.get === 'function'
  ) {
    const redacted: Record<string, unknown> = {}

    for (const [key, value] of candidate.entries())
      redacted[key] = isSecretKey(key) ? REDACTED : value

    return redacted
  }

  const redacted: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(candidate))
    redacted[key] = isSecretKey(key) ? REDACTED : value

  return redacted
}
