import { SasAuthResponse, ServerType } from '@sasjs/utils/types'
import { prefixMessage } from '@sasjs/utils/error'
import NodeFormData from 'form-data'
import { RequestClient } from '../request/RequestClient'
import { isNode } from '../utils'
import { getTokenRequestErrorPrefix } from './getTokenRequestErrorPrefix'

/**
 * Exchanges the refresh token for an access token for the given client.
 * This function can only be used by Node.
 * @param requestClient - the pre-configured HTTP request client
 * @param clientId - the client ID to authenticate with.
 * @param clientSecret - the client secret to authenticate with.
 * @param refreshToken - the refresh token received from the server.
 */
export async function refreshTokensForViya(
  requestClient: RequestClient,
  clientId: string,
  clientSecret: string,
  refreshToken: string
) {
  if (!isNode()) {
    throw new Error(`Method 'refreshTokensForViya' can only be used by Node.`)
  }

  const url = '/SASLogon/oauth/token'
  const token =
    typeof Buffer === 'undefined'
      ? btoa(clientId + ':' + clientSecret)
      : Buffer.from(clientId + ':' + clientSecret).toString('base64')

  const headers = {
    Authorization: 'Basic ' + token
  }

  const formData = new NodeFormData()
  formData.append('grant_type', 'refresh_token')
  formData.append('refresh_token', refreshToken)

  const authResponse = await requestClient
    .post<SasAuthResponse>(
      url,
      formData,
      undefined,
      'multipart/form-data; boundary=' + (formData as any)._boundary,
      headers
    )
    .then((res) => res.result)
    .catch((err) => {
      throw prefixMessage(
        err,
        getTokenRequestErrorPrefix(
          'refreshing tokens',
          'refreshTokensForViya',
          ServerType.SasViya,
          url,
          formData,
          headers,
          clientId,
          clientSecret
        )
      )
    })

  return authResponse
}
