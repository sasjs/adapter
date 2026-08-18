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
  // Note: client/secret are NOT mutated. The sas.cli public-client fallback
  // is applied only to the refresh call itself, so a caller that round-trips
  // the returned AuthConfig into persistent storage never ends up saving
  // fabricated CLIENT/SECRET values.
  let { access_token, refresh_token } = authConfig
  const { client, secret } = authConfig

  // Tokens are not always decodable JWTs - some servers issue opaque tokens.
  // jwt-decode throws InvalidTokenError for these; only in that case is the
  // token treated as still valid (the server is the authority on expiry and
  // will reject a genuinely expired token on use/refresh).
  // Use a 300 s (5 min) safety margin instead of the isAccessTokenExpiring
  // default of 3600 s (1 h).  Some Viya estates issue access tokens with a
  // 1-hour TTL; with the 3600 s default a brand-new 1 h token is immediately
  // considered "expiring", causing a redundant refresh even when the CLI has
  // already refreshed the token moments earlier.  300 s is short enough that a
  // fresh 1 h token (TTL ≈ 3600 ≫ 300) is NOT considered expiring, yet long
  // enough to let a single API call complete before the token actually expires.
  // Long-running jobs are protected because pollJobState calls getTokens on
  // every poll, so a token that does expire mid-job is refreshed in-place.
  let isAccessTokenExpiringSoon = false
  try {
    isAccessTokenExpiringSoon = isAccessTokenExpiring(access_token, 300)
  } catch (e) {
    if ((e as Error).name !== 'InvalidTokenError') throw e
  }

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

  if (isAccessTokenExpiringSoon || isRefreshTokenExpiringSoon) {
    if (isRefreshTokenExpired) {
      const error =
        'Unable to obtain new access token. Your refresh token has expired.'

      logger.error(error)

      throw new Error(error)
    }

    logger.info('Refreshing access and refresh tokens.')

    // Tokens minted without a registered OAuth client (e.g. via the
    // password grant against the built-in public client) can still be
    // refreshed using that same secret-less client. A configured client
    // with a missing secret is treated as a public client (empty secret).
    const tokens =
      serverType === ServerType.SasViya
        ? await refreshTokensForViya(
            requestClient,
            client || 'sas.cli',
            secret || '',
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
