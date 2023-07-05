import { ServerType } from '@sasjs/utils/types'

type Server = ServerType.SasViya | ServerType.Sasjs
type Operation = 'fetching access token' | 'refreshing tokens'

const getServerName = (server: Server) =>
  server === ServerType.SasViya ? 'Viya' : 'Sasjs'

const getResponseTitle = (server: Server) =>
  `Response from ${getServerName(server)} is below.`

/**
 * Forms error prefix for requests related to token operations.
 * @param operation - string describing operation ('fetching access token' or 'refreshing tokens').
 * @param funcName - name of the function sent the request.
 * @param server - server type (SASVIYA or SASJS).
 * @param url - endpoint used to send the request.
 * @param data - request payload.
 * @param headers - request headers.
 * @param clientId - client ID to authenticate with.
 * @param clientSecret - client secret to authenticate with.
 * @returns - string containing request information. Example:
 * Error while fetching access token from /SASLogon/oauth/token
 * Thrown by the @sasjs/adapter getAccessTokenForViya function.
 * Payload:
 * {
 *   "grant_type": "authorization_code",
 *   "code": "example_code"
 * }
 * Headers:
 * {
 *   "Authorization": "Basic NEdMQXBwOjRHTEFwcDE=",
 *   "Accept": "application/json"
 * }
 * ClientId: exampleClientId
 * ClientSecret: exampleClientSecret
 *
 * Response from Viya is below.
 * Auth error: {
 *   "error": "invalid_token",
 *   "error_description": "No scopes were granted"
 * }
 */
export const getTokenRequestErrorPrefix = (
  operation: Operation,
  funcName: string,
  server: Server,
  url: string,
  data?: {},
  headers?: {},
  clientId?: string,
  clientSecret?: string
) => {
  const stringify = (obj: {}) => JSON.stringify(obj, null, 2)

  const lines = [
    `Error while ${operation} from ${url}`,
    `Thrown by the @sasjs/adapter ${funcName} function.`
  ]

  if (data) {
    lines.push('Payload:')
    lines.push(stringify(data))
  }
  if (headers) {
    lines.push('Headers:')
    lines.push(stringify(headers))
  }
  if (clientId) lines.push(`ClientId: ${clientId}`)
  if (clientSecret) lines.push(`ClientSecret: ${clientSecret}`)

  lines.push('')
  lines.push(`${getResponseTitle(server)}`)
  lines.push('')

  return lines.join(`\n`)
}

/**
 * Parse error prefix to get response payload.
 * @param prefix - error prefix generated by getTokenRequestErrorPrefix function.
 * @param server - server type (SASVIYA or SASJS).
 * @returns - response payload.
 */
export const getTokenRequestErrorPrefixResponse = (
  prefix: string,
  server: ServerType.SasViya | ServerType.Sasjs
) => prefix.split(`${getResponseTitle(server)}\n`).pop() as string
