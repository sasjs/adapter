import { SasAuthResponse } from '@sasjs/utils/types'
import { prefixMessage } from '@sasjs/utils/error'
import * as NodeFormData from 'form-data'
import { RequestClient } from '../request/RequestClient'

/**
 * Exchanges the auth code for an access token for the given client.
 * @param requestClient - the pre-configured HTTP request client
 * @param clientId - the client ID to authenticate with.
 * @param clientSecret - the client secret to authenticate with.
 * @param authCode - the auth code received from the server.
 */
export async function getAccessToken(
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
    Authorization: 'Basic ' + token
  }

  let formData
  if (typeof FormData === 'undefined') {
    formData = new NodeFormData()
  } else {
    formData = new FormData()
  }
  formData.append('grant_type', 'authorization_code')
  formData.append('code', authCode)

  const authResponse = await requestClient
    .post(
      url,
      formData,
      undefined,
      'multipart/form-data; boundary=' + (formData as any)._boundary,
      headers
    )
    .then((res) => res.result as SasAuthResponse)
    .catch((err) => {
      throw prefixMessage(err, 'Error while getting access token. ')
    })

  return authResponse
}
