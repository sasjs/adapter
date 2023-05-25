import { SasAuthResponse, ServerType } from '@sasjs/utils/types'
import { prefixMessage } from '@sasjs/utils/error'
import { RequestClient } from '../request/RequestClient'
import { CertificateError } from '../types/errors'
import { getTokenRequestErrorPrefix } from './getTokenRequestErrorPrefix'

// TODO: update func docs
/**
 * Exchange the auth code for access / refresh tokens for the given client / secret pair.
 * @param requestClient - the pre-configured HTTP request client.
 * @param clientId - the client ID to authenticate with.
 * @param clientSecret - the client secret to authenticate with.
 * @param authCode - the auth code received from the server.
 */
export async function getAccessTokenForViya(
  requestClient: RequestClient,
  clientId: string,
  clientSecret: string,
  authCode: string
): Promise<SasAuthResponse> {
  let token

  if (typeof Buffer === 'undefined') {
    token = btoa(clientId + ':' + clientSecret)
  } else {
    token = Buffer.from(clientId + ':' + clientSecret).toString('base64')
  }

  const url = '/SASLogon/oauth/token'
  const headers = {
    Authorization: 'Basic ' + token,
    Accept: 'application/json'
  }
  const dataJson = {
    grant_type: 'authorization_code',
    code: authCode
  }
  const data = new URLSearchParams(dataJson)

  const authResponse = await requestClient
    .post(url, data, undefined, 'application/x-www-form-urlencoded', headers)
    .then((res) => res.result as SasAuthResponse)
    .catch((err) => {
      if (err instanceof CertificateError) throw err
      throw prefixMessage(
        err,
        getTokenRequestErrorPrefix(
          'fetching access token',
          'getAccessTokenForViya',
          ServerType.SasViya,
          url,
          dataJson,
          headers,
          clientId,
          clientSecret
        )
      )
    })

  return authResponse
}
