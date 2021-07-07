import {
  AuthConfig,
  isAccessTokenExpiring,
  isRefreshTokenExpiring,
  SasAuthResponse
} from '@sasjs/utils'
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

  return authResponse
}

/**
 * Returns the auth configuration, refreshing the tokens if necessary.
 * @param requestClient - the pre-configured HTTP request client
 * @param authConfig - an object containing a client ID, secret, access token and refresh token
 */
export async function getTokens(
  requestClient: RequestClient,
  authConfig: AuthConfig
): Promise<AuthConfig> {
  const logger = process.logger || console
  let { access_token, refresh_token, client, secret } = authConfig
  if (
    isAccessTokenExpiring(access_token) ||
    isRefreshTokenExpiring(refresh_token)
  ) {
    logger.info('Refreshing access and refresh tokens.')
    ;({ access_token, refresh_token } = await refreshTokens(
      requestClient,
      client,
      secret,
      refresh_token
    ))
  }
  return { access_token, refresh_token, client, secret }
}

/**
 * Exchanges the refresh token for an access token for the given client.
 * @param requestClient - the pre-configured HTTP request client
 * @param clientId - the client ID to authenticate with.
 * @param clientSecret - the client secret to authenticate with.
 * @param authCode - the refresh token received from the server.
 */
export async function refreshTokens(
  requestClient: RequestClient,
  clientId: string,
  clientSecret: string,
  refreshToken: string
) {
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

  const formData =
    typeof FormData === 'undefined' ? new NodeFormData() : new FormData()
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

  return authResponse
}
