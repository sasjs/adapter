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
 * @param onTokensRefreshed - optional callback invoked with the rotated token
 * pair after a successful internal refresh. Viya refresh tokens are
 * single-use/rotating, so consumers that persist tokens (e.g. the CLI writing
 * `.env.{target}`) should pass a handler here to avoid the persisted pair
 * going stale.
 */
export async function getTokens(
  requestClient: RequestClient,
  authConfig: AuthConfig,
  serverType: ServerType = ServerType.SasViya,
  onTokensRefreshed?: (tokens: {
    access_token: string
    refresh_token: string
  }) => void | Promise<void>
): Promise<AuthConfig> {
  const logger = process.logger || console
  let { access_token, refresh_token, client, secret } = authConfig

  // Tokens minted without a registered OAuth client (e.g. via the password
  // grant against the built-in public client) can still be refreshed using
  // that same secret-less client.
  if (serverType === ServerType.SasViya && !client) {
    client = 'sas.cli'
    secret = ''
  }

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

    await onTokensRefreshed?.({ access_token, refresh_token })
  }

  return { access_token, refresh_token, client, secret }
}
