import { prefixMessage } from '@sasjs/utils/error'
import { RequestClient } from '../request/RequestClient'
import { getTokenRequestErrorPrefix } from './getTokenRequestErrorPrefix'
import { ServerType } from '@sasjs/utils/types'
import { apiBasePrefix, DEFAULT_API_BASE_PATH } from '../apiBasePath'

/**
 * Exchanges the refresh token for an access token for the given client.
 * @param requestClient - the pre-configured HTTP request client
 * @param refreshToken - the refresh token received from the server.
 * @param apiBasePath - the path the API is mounted at, default `/SASjsApi`.
 */
export async function refreshTokensForSasjs(
  requestClient: RequestClient,
  refreshToken: string,
  apiBasePath: string = DEFAULT_API_BASE_PATH
) {
  const url = `${apiBasePrefix(apiBasePath)}/auth/refresh`
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
      throw prefixMessage(
        err,
        getTokenRequestErrorPrefix(
          'refreshing tokens',
          'refreshTokensForSasjs',
          ServerType.Sasjs,
          url
        )
      )
    })

  return authResponse
}
