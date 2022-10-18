import { AuthConfig, ServerType, ServicePackSASjs } from '@sasjs/utils/types'
import { ExecutionQuery } from './types'
import { RequestClient } from './request/RequestClient'
import { getAccessTokenForSasjs } from './auth/getAccessTokenForSasjs'
import { refreshTokensForSasjs } from './auth/refreshTokensForSasjs'
import { getTokens } from './auth/getTokens'

export class SASjsApiClient {
  constructor(private requestClient: RequestClient) {}

  /**
   * Creates the folders and services at the given location `appLoc` on the given server `serverUrl`.
   * @param dataJson - the JSON specifying the folders and files to be created, can also includes
   * appLoc, streamServiceName, streamWebFolder, streamLogo
   * @param appLoc - the base folder in which to create the new folders and services.
   * @param authConfig - (optional) a valid client, secret, refresh and access tokens that are authorised to execute compute jobs.
   */
  public async deploy(
    dataJson: ServicePackSASjs,
    appLoc: string,
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

    dataJson.appLoc = dataJson.appLoc || appLoc

    const { result } = await this.requestClient.post<{
      status: string
      message: string
      streamServiceName?: string
      example?: {}
    }>(
      'SASjsApi/drive/deploy',
      dataJson,
      access_token,
      undefined,
      {},
      { maxContentLength: Infinity, maxBodyLength: Infinity }
    )

    return Promise.resolve(result)
  }

  public async executeJob(
    query: ExecutionQuery,
    appLoc: string,
    authConfig?: AuthConfig
  ) {
    const access_token = authConfig ? authConfig.access_token : undefined

    let _program
    if (query._program.startsWith('/')) {
      _program = query._program
    } else _program = `${appLoc}/${query._program}`

    const response: any = await this.requestClient.post(
      'SASjsApi/stp/execute',
      { _debug: 131, ...query, _program },
      access_token
    )

    return { result: response.result, log: response.log }
  }

  /**
   * Executes code on a SASJS server.
   * @param code - a string of code to execute.
   * @param runTime - a string to representing runTime for code execution
   * @param authConfig - an object for authentication.
   */
  public async executeScript(
    code: string,
    runTime: string = 'sas',
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

    let parsedSasjsServerLog = ''

    await this.requestClient
      .post('SASjsApi/code/execute', { code, runTime }, access_token)
      .then((res: any) => {
        if (res.log) parsedSasjsServerLog = res.log
      })

    return parsedSasjsServerLog
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
