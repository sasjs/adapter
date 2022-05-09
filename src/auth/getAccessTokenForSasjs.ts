import { prefixMessage } from '@sasjs/utils/error'
import { RequestClient } from '../request/RequestClient'

/**
 * Exchanges the auth code for an access token for the given client.
 * @param requestClient - the pre-configured HTTP request client
 * @param clientId - the client ID to authenticate with.
 * @param authCode - the auth code received from the server.
 */
export async function getAccessTokenForSasjs(
  requestClient: RequestClient,
  authCode: string
) {
  const url = '/SASjsApi/auth/token'
  const data = {
    code: authCode
  }

  return await requestClient
    .post(url, data, undefined)
    .then((res) => {
      const sasAuth = res.result as {
        accessToken: string
        refreshToken: string
      }
      return {
        access_token: sasAuth.accessToken,
        refresh_token: sasAuth.refreshToken
      }
    })
    .catch((err) => {
      throw prefixMessage(err, 'Error while getting access token. ')
    })
}
