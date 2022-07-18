import { prefixMessage } from '@sasjs/utils/error'
import { RequestClient } from '../request/RequestClient'

/**
 * Exchanges the refresh token for an access token for the given client.
 * @param requestClient - the pre-configured HTTP request client
 * @param refreshToken - the refresh token received from the server.
 */
export async function refreshTokensForSasjs(
  requestClient: RequestClient,
  refreshToken: string
) {
  const url = '/SASjsApi/auth/refresh'
  const headers = {
    Authorization: 'Bearer ' + refreshToken
  }

  const authResponse = await requestClient
    .post(url, undefined, undefined, undefined, headers)
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
      throw prefixMessage(err, 'Error while refreshing tokens: ')
    })

  return authResponse
}
