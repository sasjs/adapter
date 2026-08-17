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
 * Callback invoked with the rotated token pair after a successful internal
 * refresh. Viya refresh tokens are single-use/rotating, so consumers that
 * persist tokens (e.g. the CLI writing `.env.{target}`) should pass a handler
 * wherever this is accepted to avoid the persisted pair going stale.
 */
export type OnTokensRefreshed = (tokens: {
  access_token: string
  refresh_token: string
}) => void | Promise<void>

/**
 * Returns the auth configuration, refreshing the tokens if necessary.
 * This function can only be used by Node, if a server type is SASVIYA.
 * @param requestClient - the pre-configured HTTP request client
 * @param authConfig - an object containing a client ID, secret, access token and refresh token
 * @param serverType - server type for which refreshing the tokens, defaults to SASVIYA
 * @param onTokensRefreshed - optional callback invoked with the rotated token
 * pair after a successful internal refresh.
 */
export async function getTokens(
  requestClient: RequestClient,
  authConfig: AuthConfig,
  serverType: ServerType = ServerType.SasViya,
  onTokensRefreshed?: OnTokensRefreshed
): Promise<AuthConfig> {
  const logger = process.logger || console
  let { access_token, refresh_token, client, secret } = authConfig

  // Tokens minted without a registered OAuth client (e.g. via the password
  // grant against the built-in public client) can still be refreshed using
  // that same secret-less client.
  if (serverType === ServerType.SasViya) {
    client = client || 'sas.cli'
    secret = secret || ''
  }

  // Refresh tokens are not always decodable JWTs - some servers issue
  // opaque tokens. jwt-decode throws InvalidTokenError for these; only in
  // that case is the token treated as still valid.
  let isRefreshTokenExpired = false
  try {
    isRefreshTokenExpired = hasTokenExpired(refresh_token)
  } catch (e) {
    if ((e as Error).name !== 'InvalidTokenError') throw e
  }

  let isRefreshTokenExpiringSoon = false
  try {
    isRefreshTokenExpiringSoon = isRefreshTokenExpiring(refresh_token)
  } catch (e) {
    if ((e as Error).name !== 'InvalidTokenError') throw e
  }

  if (isAccessTokenExpiring(access_token) || isRefreshTokenExpiringSoon) {
    if (isRefreshTokenExpired) {
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
            client as string,
            secret as string,
            refresh_token
          )
        : await refreshTokensForSasjs(requestClient, refresh_token)
    ;({ access_token, refresh_token } = tokens)

    // A failing persistence handler must not turn a successful refresh into
    // an auth failure - log the error and return the fresh pair regardless.
    try {
      await onTokensRefreshed?.({ access_token, refresh_token })
    } catch (e) {
      logger.error('onTokensRefreshed handler failed:', e)
    }
  }

  return { access_token, refresh_token, client, secret }
}
