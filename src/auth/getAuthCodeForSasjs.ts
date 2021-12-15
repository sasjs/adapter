import { prefixMessage } from '@sasjs/utils/error'
import { RequestClient } from '../request/RequestClient'

/**
 * Performs a login authenticate and returns an auth code for the given client.
 * @param requestClient - the pre-configured HTTP request client
 * @param username - a string representing the username.
 * @param password - a string representing the password.
 * @param clientId - the client ID to authenticate with.
 */
export const getAuthCodeForSasjs = async (
  requestClient: RequestClient,
  username: string,
  password: string,
  clientId: string
) => {
  const url = '/SASjsApi/auth/authorize'
  const data = { username, password, clientId }

  const { code: authCode } = await requestClient
    .post<{ code: string }>(url, data, undefined)
    .then((res) => res.result)
    .catch((err) => {
      throw prefixMessage(
        err,
        'Error while authenticating with provided username, password and clientId. '
      )
    })

  return authCode
}
