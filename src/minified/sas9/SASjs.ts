import { validateInput, compareTimestamps } from '../../utils'
import { SASjsConfig, UploadFile, LoginMechanism } from '../../types'
import { AuthManager } from '../../auth'
import {
  ServerType,
  AuthConfig,
  ExtraResponseAttributes
} from '@sasjs/utils/types'
import { RequestClient } from '../../request/RequestClient'
import { FileUploader } from '../../job-execution/FileUploader'
import { WebJobExecutor } from './WebJobExecutor'
import { ErrorResponse } from '../../types/errors/ErrorResponse'
import { LoginOptions, LoginResult } from '../../types/Login'

const defaultConfig: SASjsConfig = {
  serverUrl: '',
  pathSASJS: '/SASjsApi/stp/execute',
  pathSAS9: '/SASStoredProcess/do',
  pathSASViya: '/SASJobExecution',
  appLoc: '/Public/seedapp',
  serverType: ServerType.Sas9,
  debug: false,
  contextName: 'SAS Job Execution compute context',
  useComputeApi: null,
  loginMechanism: LoginMechanism.Default
}

/**
 * SASjs is a JavaScript adapter for SAS.
 *
 */
export default class SASjs {
  private sasjsConfig: SASjsConfig = new SASjsConfig()
  private jobsPath: string = ''
  private fileUploader: FileUploader | null = null
  private authManager: AuthManager | null = null
  private requestClient: RequestClient | null = null
  private webJobExecutor: WebJobExecutor | null = null

  constructor(config?: Partial<SASjsConfig>) {
    this.sasjsConfig = {
      ...defaultConfig,
      ...config
    }

    this.setupConfiguration()
  }

  /**
   * Logs into the SAS server with the supplied credentials.
   * @param username - a string representing the username.
   * @param password - a string representing the password.
   * @param clientId - a string representing the client ID.
   */
  public async logIn(
    username?: string,
    password?: string,
    clientId?: string,
    options: LoginOptions = {}
  ): Promise<LoginResult> {
    if (this.sasjsConfig.loginMechanism === LoginMechanism.Default) {
      if (!username || !password)
        throw new Error(
          'A username and password are required when using the default login mechanism.'
        )

      return this.authManager!.logIn(username, password)
    }

    if (typeof window === typeof undefined) {
      throw new Error(
        'The redirected login mechanism is only available for use in the browser.'
      )
    }

    return this.authManager!.redirectedLogIn(options)
  }

  /**
   * Logs out of the configured SAS server.
   */
  public logOut() {
    return this.authManager!.logOut()
  }

  /**
   * Returns the current SASjs configuration.
   *
   */
  public getSasjsConfig() {
    return this.sasjsConfig
  }

  /**
   * this method returns an array of SASjsRequest
   * @returns SASjsRequest[]
   */
  public getSasRequests() {
    const requests = [...this.requestClient!.getRequests()]
    const sortedRequests = requests.sort(compareTimestamps)
    return sortedRequests
  }

  /**
   * Sets the debug state. Turning this on will enable additional logging in the adapter.
   * @param value - boolean indicating debug state (on/off).
   */
  public setDebugState(value: boolean) {
    this.sasjsConfig.debug = value
  }

  /**
   * Uploads a file to the given service.
   * @param sasJob - the path to the SAS program (ultimately resolves to
   *  the SAS `_program` parameter to run a Job Definition or SAS 9 Stored
   *  Process). Is prepended at runtime with the value of `appLoc`.
   * @param files - array of files to be uploaded, including File object and file name.
   * @param params - request URL parameters.
   * @param config - provide any changes to the config here, for instance to
   * enable/disable `debug`. Any change provided will override the global config,
   * for that particular function call.
   * @param loginRequiredCallback - a function that is called if the
   * user is not logged in (eg to display a login form). The request will be
   * resubmitted after successful login.
   */
  public async uploadFile(
    sasJob: string,
    files: UploadFile[],
    params: { [key: string]: any } | null,
    config: { [key: string]: any } = {},
    loginRequiredCallback?: () => any
  ) {
    config = {
      ...this.sasjsConfig,
      ...config
    }
    const data = { files, params }

    return await this.fileUploader!.execute(
      sasJob,
      data,
      config,
      loginRequiredCallback
    )
  }

  /**
   * Makes a request to program specified in `SASjob` (could be a Viya Job, a
   * SAS 9 Stored Process, or a SASjs Server Stored Program). The response
   * object will always contain table names in lowercase, and column names in
   * uppercase. Values are returned formatted by default, unformatted
   * values can be configured as an option in the `%webout` macro.
   *
   * @param sasJob - the path to the SAS program (ultimately resolves to
   *  the SAS `_program` parameter to run a Job Definition or SAS 9 Stored
   *  Process). Is prepended at runtime with the value of `appLoc`.
   * @param data - a JSON object containing one or more tables to be sent to
   * SAS.  For an example of the table structure, see the project README. This
   * value can be `null` if no inputs are required.
   * @param config - provide any changes to the config here, for instance to
   * enable/disable `debug`. Any change provided will override the global config,
   * for that particular function call.
   * @param loginRequiredCallback - a function that is called if the
   * user is not logged in (eg to display a login form). The request will be
   * resubmitted after successful login.
   * When using a `loginRequiredCallback`, the call to the request will look, for example, like so:
   * `await request(sasJobPath, data, config, () => setIsLoggedIn(false))`
   * If you are not passing in any data and configuration, it will look like so:
   * `await request(sasJobPath, {}, {}, () => setIsLoggedIn(false))`
   * @param extraResponseAttributes - a array of predefined values that are used
   * to provide extra attributes (same names as those values) to be added in response
   * Supported values are declared in ExtraResponseAttributes type.
   */
  public async request(
    sasJob: string,
    data: { [key: string]: any } | null,
    config: { [key: string]: any } = {},
    loginRequiredCallback?: () => any,
    authConfig?: AuthConfig,
    extraResponseAttributes: ExtraResponseAttributes[] = []
  ) {
    config = {
      ...this.sasjsConfig,
      ...config
    }

    const validationResult = validateInput(data)

    // status is true if the data passes validation checks above
    if (validationResult.status) {
      return await this.webJobExecutor!.execute(
        sasJob,
        data,
        config,
        loginRequiredCallback,
        authConfig,
        extraResponseAttributes
      )
    } else {
      return Promise.reject(new ErrorResponse(validationResult.msg))
    }
  }

  /**
   * Checks whether a session is active, or login is required.
   * @returns - a promise which resolves with an object containing two values - a boolean `isLoggedIn`, and a string `userName`.
   */
  public async checkSession() {
    return this.authManager!.checkSession()
  }

  private setupConfiguration() {
    if (
      this.sasjsConfig.serverUrl === undefined ||
      this.sasjsConfig.serverUrl === ''
    ) {
      if (typeof location !== 'undefined') {
        let url = `${location.protocol}//${location.hostname}`

        if (location.port) url = `${url}:${location.port}`

        this.sasjsConfig.serverUrl = url
      } else {
        this.sasjsConfig.serverUrl = ''
      }
    }

    if (this.sasjsConfig.serverUrl.slice(-1) === '/') {
      this.sasjsConfig.serverUrl = this.sasjsConfig.serverUrl.slice(0, -1)
    }

    if (!this.requestClient) {
      this.requestClient = new RequestClient(
        this.sasjsConfig.serverUrl,
        this.sasjsConfig.httpsAgentOptions,
        this.sasjsConfig.requestHistoryLimit,
        this.sasjsConfig.verbose
      )
    } else {
      this.requestClient.setConfig(
        this.sasjsConfig.serverUrl,
        this.sasjsConfig.httpsAgentOptions
      )
    }

    this.jobsPath = this.sasjsConfig.pathSAS9

    this.authManager = new AuthManager(
      this.sasjsConfig.serverUrl,
      this.sasjsConfig.serverType!,
      this.requestClient,
      this.resendWaitingRequests
    )

    this.fileUploader = new FileUploader(
      this.sasjsConfig.serverUrl,
      this.sasjsConfig.serverType!,
      this.jobsPath,
      this.requestClient
    )

    this.webJobExecutor = new WebJobExecutor(
      this.sasjsConfig.serverUrl,
      this.sasjsConfig.serverType!,
      this.jobsPath,
      this.requestClient
    )
  }

  private resendWaitingRequests = async () => {
    await this.webJobExecutor?.resendWaitingRequests()
    await this.fileUploader?.resendWaitingRequests()
  }
}
