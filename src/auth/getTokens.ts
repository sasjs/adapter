import {
  isAccessTokenExpiring,
  isRefreshTokenExpiring,
  hasTokenExpired
} from '@sasjs/utils/auth'
import { AuthConfig } from '@sasjs/utils/types'
import { RequestClient } from '../request/RequestClient'
import { refreshTokens } from './refreshTokens'

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
    if (hasTokenExpired(refresh_token)) {
      const error =
        'Unable to obtain new access token. Your refresh token has expired.'
      logger.error(error)
      throw new Error(error)
    }
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
