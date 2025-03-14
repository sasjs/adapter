import NodeFormData from 'form-data'
import { AuthConfig, ServerType, ServicePackSASjs } from '@sasjs/utils/types'
import { prefixMessage } from '@sasjs/utils/error'
import { ExecutionQuery } from './types'
import { RequestClient } from './request/RequestClient'
import { getAccessTokenForSasjs } from './auth/getAccessTokenForSasjs'
import { refreshTokensForSasjs } from './auth/refreshTokensForSasjs'
import { getTokens } from './auth/getTokens'

// TODO: move to sasjs/utils
export interface SASjsAuthResponse {
  access_token: string
  refresh_token: string
}

export interface ScriptExecutionResult {
  log: string
  webout?: string
  printOutput?: string
}

export class SASjsApiClient {
  constructor(private requestClient: RequestClient) {}

  private async getAccessTokenForRequest(authConfig?: AuthConfig) {
    if (authConfig) {
      const { access_token } = await getTokens(
        this.requestClient,
        authConfig,
        ServerType.Sasjs
      )

      return access_token
    }
  }

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
    const access_token = await this.getAccessTokenForRequest(authConfig)
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

  /**
   * Creates/updates files within SASjs drive using uploaded json compressed file.
   * @param zipFilePath - Compressed file path; file should only contain one JSON file and
   * should have same name as of compressed file e.g. deploy.JSON should be compressed to deploy.JSON.zip
   * Any other file or JSON file in zipped will be ignored!
   * @param authConfig - (optional) a valid client, secret, refresh and access tokens that are authorised to execute compute jobs.
   */
  public async deployZipFile(zipFilePath: string, authConfig?: AuthConfig) {
    const { createReadStream } = require('@sasjs/utils/file')
    const access_token = await this.getAccessTokenForRequest(authConfig)

    const file = await createReadStream(zipFilePath)
    const formData = new NodeFormData()
    formData.append('file', file)

    const contentType = `multipart/form-data; boundary=${formData.getBoundary()}`

    const { result } = await this.requestClient.post<{
      status: string
      message: string
      streamServiceName?: string
      example?: {}
    }>(
      'SASjsApi/drive/deploy/upload',
      formData,
      access_token,
      contentType,
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
  ): Promise<ScriptExecutionResult> {
    const access_token = await this.getAccessTokenForRequest(authConfig)
    const executionResult: ScriptExecutionResult = { log: '' }

    await this.requestClient
      .post('SASjsApi/code/execute', { code, runTime }, access_token)
      .then((res: any) => {
        const { log, printOutput, result: webout } = res

        executionResult.log = log

        if (printOutput) executionResult.printOutput = printOutput
        if (webout) executionResult.webout = webout
      })
      .catch((err) => {
        throw prefixMessage(
          err,
          'Error while sending POST request to execute code. '
        )
      })

    return executionResult
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
