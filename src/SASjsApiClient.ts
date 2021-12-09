import { FolderMember, ServiceMember, ExecutionQuery } from './types'
import { RequestClient } from './request/RequestClient'
import { getAccessTokenForSasjs } from './auth/getAccessTokenForSasjs'
import { refreshTokensForSasjs } from './auth/refreshTokensForSasjs'

export class SASjsApiClient {
  constructor(
    private serverUrl: string,
    private requestClient: RequestClient
  ) {}

  public setConfig(serverUrl: string) {
    if (serverUrl) this.serverUrl = serverUrl
  }

  public async deploy(members: [FolderMember, ServiceMember], appLoc: string) {
    const { result } = await this.requestClient.post<{
      status: string
      message: string
      example?: {}
    }>(
      'SASjsApi/drive/deploy',
      { fileTree: members, appLoc: appLoc },
      undefined
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
    }>('SASjsApi/stp/execute', query, undefined)

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
}

// todo move to sasjs/utils
export interface SASjsAuthResponse {
  access_token: string
  refresh_token: string
}
