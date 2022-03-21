import { AuthConfig, ServerType, StreamConfig } from '@sasjs/utils/types'
import { FileTree, ExecutionQuery } from './types'
import { RequestClient } from './request/RequestClient'
import { getAccessTokenForSasjs } from './auth/getAccessTokenForSasjs'
import { refreshTokensForSasjs } from './auth/refreshTokensForSasjs'
import { getAuthCodeForSasjs } from './auth/getAuthCodeForSasjs'
import { parseWeboutResponse } from './utils'
import { getTokens } from './auth/getTokens'

export class SASjsApiClient {
  constructor(
    private serverUrl: string,
    private requestClient: RequestClient
  ) {}

  public setConfig(serverUrl: string) {
    if (serverUrl) this.serverUrl = serverUrl
  }

  public async deploy(
    members: FileTree,
    appLoc: string,
    streamConfig?: StreamConfig,
    authConfig?: AuthConfig
  ) {
    let access_token = (authConfig || {}).access_token
    if (authConfig) {
      ;({ access_token } = await getTokens(
        this.requestClient,
        authConfig,
        ServerType.Sasjs
      ))
    }
    const { result } = await this.requestClient.post<{
      status: string
      message: string
      example?: {}
    }>(
      'SASjsApi/drive/deploy',
      {
        fileTree: members,
        appLoc: appLoc,
        streamServiceName: streamConfig?.streamServiceName,
        streamWebFolder: streamConfig?.streamWebFolder,
        streamLogo: streamConfig?.streamLogo
      },
      access_token,
      undefined,
      {},
      { maxContentLength: Infinity, maxBodyLength: Infinity }
    )

    return Promise.resolve(result)
  }

  public async executeJob(query: ExecutionQuery) {
    const { result } = await this.requestClient.post<{
      status: string
      message: string
      log?: string
      logPath?: string
      error?: {}
      _webout?: string
    }>('SASjsApi/stp/execute', query, undefined)

    if (Object.keys(result).includes('_webout')) {
      result._webout = parseWeboutResponse(result._webout!)
    }

    return Promise.resolve(result)
  }

  /**
   * Exchanges the auth code for an access token for the given client.
   * @param clientId - the client ID to authenticate with.
   * @param authCode - the auth code received from the server.
   */
  public async getAccessToken(
    clientId: string,
    authCode: string
  ): Promise<SASjsAuthResponse> {
    return getAccessTokenForSasjs(this.requestClient, clientId, authCode)
  }

  /**
   * Exchanges the refresh token for an access token.
   * @param refreshToken - the refresh token received from the server.
   */
  public async refreshTokens(refreshToken: string): Promise<SASjsAuthResponse> {
    return refreshTokensForSasjs(this.requestClient, refreshToken)
  }

  /**
   * Performs a login authenticate and returns an auth code for the given client.
   * @param username - a string representing the username.
   * @param password - a string representing the password.
   * @param clientId - the client ID to authenticate with.
   */
  public async getAuthCode(
    username: string,
    password: string,
    clientId: string
  ) {
    return getAuthCodeForSasjs(this.requestClient, username, password, clientId)
  }
}

// todo move to sasjs/utils
export interface SASjsAuthResponse {
  access_token: string
  refresh_token: string
}
