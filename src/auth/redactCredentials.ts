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
  'token',
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

/**
 * What a form-encoded decoder is allowed to read as a parameter name.
 *
 * Deliberately narrow: a name carrying `{`, `[`, `"`, `%`, `&`, whitespace or a
 * second `=` is not a parameter of a form-encoded body, it is text this module
 * cannot read - and a body it cannot read is reported as a shape, never printed.
 */
const PARAMETER_NAME = /^[A-Za-z0-9_.~[\]]+$/

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

/** A value, with secret-named keys redacted at any depth. */
const redactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(redactValue)

  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        isSecretKey(key) ? REDACTED : redactValue(inner)
      ])
    )

  return value
}

/**
 * A body that arrived as text, which a caller is free to pass: the parameter is
 * typed to admit one.
 *
 * Form-encoded text is rebuilt pair by pair so the parameters that are not
 * secrets stay readable, and anything else is reported as a shape rather than
 * echoed, because a body this module cannot read is a body it cannot redact.
 *
 * A JSON body is never form-encoded, whatever it contains. Base64 carries `=`
 * padding, so `{"client_secret":"YWJjWg=="}` splits into a key that is the
 * secret's own text and a value of `"}"` - the key is not a secret *name*, so no
 * key check catches it, and the secret is printed as though it were a parameter
 * name. Structured text therefore takes the shape branch on its opening
 * character, before any splitting.
 */
const redactText = (text: string): unknown => {
  const trimmed = text.trim()

  if (!trimmed) return trimmed

  if (/^[{[]/.test(trimmed)) return 'text body - values redacted'

  // A linear test, not a regular expression: the obvious pattern for "pairs
  // joined by &" nests quantifiers and backtracks exponentially on a string like
  // `!=&!=&!=&...` (CodeQL js/redos, found on this branch).
  const pairs = trimmed.split('&')
  const isFormEncoded =
    !/\s/.test(trimmed) &&
    pairs.every((pair) => pair.indexOf('=') > 0) &&
    pairs.every((pair) => PARAMETER_NAME.test(pair.slice(0, pair.indexOf('='))))

  if (isFormEncoded) {
    const redacted: Record<string, string> = {}

    for (const pair of pairs) {
      const [key, ...rest] = pair.split('=')
      const value = rest.join('=')

      redacted[key] = isSecretKey(key) ? REDACTED : value
    }

    return redacted
  }

  // not form-encoded: a JSON string, a SAS log, an HTML page. It is not parsed
  // here because a half-parsed body is worse than a stated shape.
  return 'text body - values redacted'
}

/**
 * A request payload, with the credential-bearing values redacted.
 *
 * Four shapes reach this function. A plain object is walked, so a secret one
 * level down is redacted like one at the top. `URLSearchParams` (the form the
 * OAuth code exchange is sent as) is rebuilt pair by pair. A string that parses
 * as `key=value&key=value` is rebuilt the same way. Multipart form data (the
 * refresh) is reported as its shape rather than its fields, because its parts
 * are a stream the request still needs.
 */
export const redactPayload = (data: {} | string | undefined): unknown => {
  if (!data) return data

  if (typeof data === 'string') return redactText(data)

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

  return redactValue(candidate) as Record<string, unknown>
}
