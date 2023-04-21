import {
  isAccessTokenExpiring,
  isRefreshTokenExpiring,
  hasTokenExpired
} from '@sasjs/utils/auth'
import { AuthConfig, ServerType } from '@sasjs/utils/types'
import { RequestClient } from '../request/RequestClient'
import { refreshTokensForViya } from './refreshTokensForViya'
import { refreshTokensForSasjs } from './refreshTokensForSasjs'

/**
 * Returns the auth configuration, refreshing the tokens if necessary.
 * This function can only be used by Node, if a server type is SASVIYA.
 * @param requestClient - the pre-configured HTTP request client
 * @param authConfig - an object containing a client ID, secret, access token and refresh token
 * @param serverType - server type for which refreshing the tokens, defaults to SASVIYA
 */
export async function getTokens(
  requestClient: RequestClient,
  authConfig: AuthConfig,
  serverType: ServerType = ServerType.SasViya
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

    const tokens =
      serverType === ServerType.SasViya
        ? await refreshTokensForViya(
            requestClient,
            client,
            secret,
            refresh_token
          )
        : await refreshTokensForSasjs(requestClient, refresh_token)
    ;({ access_token, refresh_token } = tokens)
  }
  return { access_token, refresh_token, client, secret }
}
