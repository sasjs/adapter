import { SasAuthResponse } from '@sasjs/utils/types'
import { prefixMessage } from '@sasjs/utils/error'
import { RequestClient } from '../request/RequestClient'
import { CertificateError } from '../types/errors'

/**
 * Exchanges the auth code for an access token for the given client.
 * @param requestClient - the pre-configured HTTP request client
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
  const url = '/SASLogon/oauth/token'
  let token
  if (typeof Buffer === 'undefined') {
    token = btoa(clientId + ':' + clientSecret)
  } else {
    token = Buffer.from(clientId + ':' + clientSecret).toString('base64')
  }
  const headers = {
    Authorization: 'Basic ' + token,
    Accept: 'application/json'
  }

  const data = new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode
  })

  const authResponse = await requestClient
    .post(url, data, undefined, 'application/x-www-form-urlencoded', headers)
    .then(res => res.result as SasAuthResponse)
    .catch(err => {
      if (err instanceof CertificateError) throw err
      throw prefixMessage(err, 'Error while getting access token. ')
    })

  return authResponse
}
