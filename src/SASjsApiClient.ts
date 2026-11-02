import NodeFormData from 'form-data'
import {
  AuthConfig,
  MacroVar,
  ServerType,
  ServicePackSASjs
} from '@sasjs/utils/types'
import { prefixMessage } from '@sasjs/utils/error'
import { ExecutionQuery, Job, PollOptions } from './types'
import { OnTokensRefreshed } from './auth/getTokens'
import { pollJobState, JobState } from './api/viya/pollJobState'
import { ComputeJobExecutionError } from './types/errors'
import { RequestClient } from './request/RequestClient'
import { getAccessTokenForSasjs } from './auth/getAccessTokenForSasjs'
import { refreshTokensForSasjs } from './auth/refreshTokensForSasjs'
import { getTokens } from './auth/getTokens'
import { isNode } from './utils/isNode'

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
   * This method can only be used by Node.
   * @param zipFilePath - Compressed file path; file should only contain one JSON file and
   * should have same name as of compressed file e.g. deploy.JSON should be compressed to deploy.JSON.zip
   * Any other file or JSON file in zipped will be ignored!
   * @param authConfig - (optional) a valid client, secret, refresh and access tokens that are authorised to execute compute jobs.
   */
  public async deployZipFile(zipFilePath: string, authConfig?: AuthConfig) {
    if (!isNode()) {
      throw new Error(`Method 'deployZipFile' can only be used by Node.`)
    }

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
   * Starts a stored program and returns the job it runs in.
   *
   * The result is the shape a Viya compute job has - an id and `links` with
   * `state` and `log` relations - because that is what `pollJobState`,
   * `fetchLogFileContent` and everything written against them already follow.
   * A caller therefore does not need to know which of the two servers it is
   * talking to.
   *
   * @param sasJob - the path of the program, relative to `appLoc` unless it starts with `/`.
   * @param data - values passed to the program as macro variables.
   * @param config - the SASjs config for this call; `debug` turns on `_debug`.
   * @param authConfig - an access token, or the tokens to mint one from.
   * @param waitForResult - poll until the program finishes before resolving.
   * @param pollOptions - poll interval and maximum attempts, see `pollJobState`.
   * @param printPid - include the OS process id in the job, while it is running.
   * @param variables - macro variables, merged with `data`.
   * @param onTokensRefreshed - called with the rotated token pair after a refresh.
   */
  public async startComputeJob(
    sasJob: string,
    data: any,
    config: any,
    authConfig?: AuthConfig,
    waitForResult = true,
    pollOptions?: PollOptions,
    printPid = false,
    variables?: MacroVar,
    onTokensRefreshed?: OnTokensRefreshed
  ): Promise<{ job: Job; log: string }> {
    const access_token = await this.getAccessTokenForRequest(authConfig)

    const _program = sasJob.startsWith('/')
      ? sasJob
      : `${config.appLoc ?? ''}/${sasJob}`

    // every query parameter becomes a macro variable, the same way the
    // synchronous execute endpoint builds them
    const query = new URLSearchParams({ _program })

    for (const [key, value] of Object.entries({
      ...(data ?? {}),
      ...(variables ?? {})
    }))
      if (value !== undefined && value !== null) query.set(key, String(value))

    if (config.debug) query.set('_debug', '131')

    const { result } = await this.requestClient
      .post<{
        sessionId: string
        pid?: number
        status?: string
        message?: string
        error?: string
      }>(`SASjsApi/stp/trigger?${query.toString()}`, {}, access_token)
      .catch((err) => {
        throw prefixMessage(err, 'Error while triggering the program. ')
      })

    // The trigger answers 200 with a failure body when the program cannot be
    // found or the runtime refuses it, so a missing session id is the only
    // signal that the call did not start anything. Without this the caller gets
    // links built from `undefined` and the failure surfaces later as a 404 on a
    // state URL.
    if (!result?.sessionId)
      throw new Error(
        `Error while triggering the program. ${
          result?.error ?? result?.message ?? 'No session id was returned.'
        }`
      )

    // absolute paths, as Viya job links are: a caller composes `${serverUrl}${href}`
    // to fetch a log, so a relative href turns into `https://hostsasjsapi/...`
    const links = [
      {
        rel: 'state',
        href: `/SASjsApi/session/${result.sessionId}/state`,
        method: 'GET'
      },
      {
        rel: 'log',
        href: `/SASjsApi/session/${result.sessionId}/log`,
        method: 'GET'
      },
      {
        rel: 'self',
        href: `/SASjsApi/session/${result.sessionId}`,
        method: 'GET'
      }
    ]

    const job = {
      id: result.sessionId,
      links,
      ...(printPid && result.pid !== undefined ? { pid: result.pid } : {})
    } as unknown as Job

    if (!waitForResult) return { job, log: '' }

    const state = await pollJobState(
      this.requestClient,
      job,
      !!config.debug,
      authConfig,
      pollOptions,
      undefined,
      onTokensRefreshed,
      ServerType.Sasjs
    )

    const { result: log } = await this.requestClient
      .get<string>(
        `SASjsApi/session/${result.sessionId}/log`,
        access_token,
        'text/plain'
      )
      .catch(() => ({ result: '' }))

    const finished = { ...job, state } as unknown as Job

    if (state === JobState.Failed || state === JobState.Error)
      throw new ComputeJobExecutionError(finished, log ?? '')

    return { job: finished, log: log ?? '' }
  }

  /**
   * Exchanges the refresh token for an access token.
   * @param refreshToken - the refresh token received from the server.
   */
  public async refreshTokens(refreshToken: string): Promise<SASjsAuthResponse> {
    return refreshTokensForSasjs(this.requestClient, refreshToken)
  }
}
