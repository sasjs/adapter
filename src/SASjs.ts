import { compareTimestamps, asyncForEach, validateInput } from './utils'
import {
  SASjsConfig,
  UploadFile,
  EditContextInput,
  PollOptions,
  LoginMechanism
} from './types'
import { SASViyaApiClient } from './SASViyaApiClient'
import { SAS9ApiClient } from './SAS9ApiClient'
import { SASjsApiClient, SASjsAuthResponse } from './SASjsApiClient'
import { AuthManager } from './auth'
import {
  ServerType,
  MacroVar,
  AuthConfig,
  ExtraResponseAttributes,
  SasAuthResponse,
  AuthConfigSas9
} from '@sasjs/utils/types'
import { RequestClient } from './request/RequestClient'
import { SasjsRequestClient } from './request/SasjsRequestClient'
import {
  JobExecutor,
  WebJobExecutor,
  SasjsJobExecutor,
  ComputeJobExecutor,
  JesJobExecutor,
  Sas9JobExecutor,
  FileUploader
} from './job-execution'
import { ErrorResponse } from './types/errors'
import { LoginOptions, LoginResult } from './types/Login'

interface ExecuteScriptParams {
  linesOfCode: string[]
  fileName?: string
  contextName?: string
  runTime?: string
  authConfig?: AuthConfig
  authConfigSas9?: AuthConfigSas9
  debug?: boolean
}

const defaultConfig: SASjsConfig = {
  serverUrl: '',
  pathSASJS: '/SASjsApi/stp/execute',
  pathSAS9: '/SASStoredProcess/do',
  pathSASViya: '/SASJobExecution',
  appLoc: '/Public/seedapp',
  serverType: ServerType.SasViya,
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
  private sasViyaApiClient: SASViyaApiClient | null = null
  private sas9ApiClient: SAS9ApiClient | null = null
  private sasJSApiClient: SASjsApiClient | null = null
  private fileUploader: FileUploader | null = null
  private authManager: AuthManager | null = null
  private requestClient: RequestClient | null = null
  private webJobExecutor: JobExecutor | null = null
  private sasjsJobExecutor: JobExecutor | null = null
  private computeJobExecutor: JobExecutor | null = null
  private jesJobExecutor: JobExecutor | null = null
  private sas9JobExecutor: JobExecutor | null = null

  constructor(config?: Partial<SASjsConfig>) {
    this.sasjsConfig = {
      ...defaultConfig,
      ...config
    }

    this.setupConfiguration()
  }

  public getCsrfToken(type: 'general' | 'file' = 'general') {
    return this.requestClient?.getCsrfToken(type)
  }

  /**
   * Executes code on a SAS server.
   * @param linesOfCode - lines of code to run.
   * @param fileName - (required for server type sas viya) name of the file to run. It will be converted to path to the file being submitted for execution.
   * @param contextName - (required for server type sas viya) context name on which code will be run on the server.
   * @param runTime - (required for server type sasjs) a string to represent runTime for code execution.
   * @param authConfig - (optional) a valid client, secret, refresh and access tokens that are authorised to execute scripts.
   * @param authConfigSas9 - (required for server type sas9) a valid username and password that are authorised to execute scripts.
   * @param debug - (optional) if true, global debug config will be overriden
   */
  public async executeScript({
    linesOfCode,
    fileName,
    contextName,
    runTime,
    authConfig,
    authConfigSas9,
    debug
  }: ExecuteScriptParams) {
    this.isMethodSupported('executeScript', [
      ServerType.Sas9,
      ServerType.Sasjs,
      ServerType.SasViya
    ])

    if (this.sasjsConfig.serverType === ServerType.Sas9) {
      if (!authConfigSas9)
        throw new Error('Auth config for sas9 is not provided')

      return await this.sas9ApiClient?.executeScript(
        linesOfCode,
        authConfigSas9.userName,
        authConfigSas9.password
      )
    }

    if (this.sasjsConfig.serverType === ServerType.Sasjs) {
      return await this.sasJSApiClient?.executeScript(
        linesOfCode.join('\n'),
        runTime,
        authConfig
      )
    }

    if (this.sasjsConfig.serverType === ServerType.SasViya) {
      contextName = contextName || this.sasjsConfig.contextName

      if (!contextName) {
        throw new Error(
          'Context name is undefined. Please set a `contextName` in your SASjs or override config.'
        )
      }

      if (!fileName) {
        throw new Error(
          'File name is required in case of SAS VIYA. Please provide a `fileName`.'
        )
      }

      return await this.sasViyaApiClient!.executeScript(
        fileName,
        linesOfCode,
        contextName,
        authConfig,
        null,
        debug ? debug : this.sasjsConfig.debug
      )
    }
  }

  /**
   * Gets compute contexts.
   * @param accessToken - an access token for an authorised user.
   */
  public async getComputeContexts(accessToken: string) {
    this.isMethodSupported('getComputeContexts', [ServerType.SasViya])

    return await this.sasViyaApiClient!.getComputeContexts(accessToken)
  }

  /**
   * Gets launcher contexts.
   * @param accessToken - an access token for an authorised user.
   */
  public async getLauncherContexts(accessToken: string) {
    this.isMethodSupported('getLauncherContexts', [ServerType.SasViya])

    return await this.sasViyaApiClient!.getLauncherContexts(accessToken)
  }

  /**
   * Gets default(system) launcher contexts.
   */
  public getDefaultComputeContexts() {
    this.isMethodSupported('getDefaultComputeContexts', [ServerType.SasViya])

    return this.sasViyaApiClient!.getDefaultComputeContexts()
  }

  /**
   * Gets executable compute contexts.
   * @param authConfig - an access token, refresh token, client and secret for an authorised user.
   */
  public async getExecutableContexts(authConfig: AuthConfig) {
    this.isMethodSupported('getExecutableContexts', [ServerType.SasViya])

    return await this.sasViyaApiClient!.getExecutableContexts(authConfig)
  }

  /**
   * Creates a compute context on the given server.
   * @param contextName - the name of the context to be created.
   * @param launchContextName - the name of the launcher context used by the compute service.
   * @param sharedAccountId - the ID of the account to run the servers for this context as.
   * @param autoExecLines - the lines of code to execute during session initialization.
   * @param accessToken - an access token for an authorised user.
   * @param authorisedUsers - an optional list of authorised user IDs.
   */
  public async createComputeContext(
    contextName: string,
    launchContextName: string,
    sharedAccountId: string,
    autoExecLines: string[],
    accessToken: string,
    authorisedUsers?: string[]
  ) {
    this.isMethodSupported('createComputeContext', [ServerType.SasViya])

    return await this.sasViyaApiClient!.createComputeContext(
      contextName,
      launchContextName,
      sharedAccountId,
      autoExecLines,
      accessToken,
      authorisedUsers
    )
  }

  /**
   * Creates a launcher context on the given server.
   * @param contextName - the name of the context to be created.
   * @param description - the description of the context to be created.
   * @param launchType - launch type of the context to be created.
   * @param accessToken - an access token for an authorised user.
   */
  public async createLauncherContext(
    contextName: string,
    description: string,
    launchType: string,
    accessToken: string
  ) {
    this.isMethodSupported('createLauncherContext', [ServerType.SasViya])

    return await this.sasViyaApiClient!.createLauncherContext(
      contextName,
      description,
      launchType,
      accessToken
    )
  }

  /**
   * Updates a compute context on the given server.
   * @param contextName - the original name of the context to be deleted.
   * @param editedContext - an object with the properties to be updated.
   * @param accessToken - an access token for an authorised user.
   */
  public async editComputeContext(
    contextName: string,
    editedContext: EditContextInput,
    accessToken?: string
  ) {
    this.isMethodSupported('editComputeContext', [ServerType.SasViya])

    return await this.sasViyaApiClient!.editComputeContext(
      contextName,
      editedContext,
      accessToken
    )
  }

  /**
   * Deletes a compute context on the given server.
   * @param contextName - the name of the context to be deleted.
   * @param accessToken - an access token for an authorised user.
   */
  public async deleteComputeContext(contextName: string, accessToken?: string) {
    this.isMethodSupported('deleteComputeContext', [ServerType.SasViya])

    return await this.sasViyaApiClient!.deleteComputeContext(
      contextName,
      accessToken
    )
  }

  /**
   * Returns a JSON representation of a compute context.
   * @example: { "createdBy": "admin", "links": [...], "id": "ID", "version": 2, "name": "context1" }
   * @param contextName - the name of the context to return.
   * @param accessToken - an access token for an authorised user.
   */
  public async getComputeContextByName(
    contextName: string,
    accessToken?: string
  ) {
    this.isMethodSupported('getComputeContextByName', [ServerType.SasViya])

    return await this.sasViyaApiClient!.getComputeContextByName(
      contextName,
      accessToken
    )
  }

  /**
   * Returns a JSON representation of a compute context.
   * @param contextId - an id of the context to return.
   * @param accessToken - an access token for an authorised user.
   */
  public async getComputeContextById(contextId: string, accessToken?: string) {
    this.isMethodSupported('getComputeContextById', [ServerType.SasViya])

    return await this.sasViyaApiClient!.getComputeContextById(
      contextId,
      accessToken
    )
  }

  public async createSession(contextName: string, accessToken: string) {
    this.isMethodSupported('createSession', [ServerType.SasViya])

    return await this.sasViyaApiClient!.createSession(contextName, accessToken)
  }

  /**
   * Creates a folder in the logical SAS folder tree
   * @param folderName - name of the folder to be created.
   * @param parentFolderPath - the full path (eg `/Public/example/myFolder`) of the parent folder.
   * @param parentFolderUri - the URI of the parent folder.
   * @param accessToken - the access token to authorizing the request.
   * @param sasApiClient - a client for interfacing with SAS API.
   * @param isForced - flag that indicates if target folder already exists, it and all subfolders have to be deleted. Applicable for SAS VIYA only.
   */
  public async createFolder(
    folderName: string,
    parentFolderPath: string,
    parentFolderUri?: string,
    accessToken?: string,
    sasApiClient?: SASViyaApiClient,
    isForced?: boolean
  ) {
    if (sasApiClient) {
      return await sasApiClient.createFolder(
        folderName,
        parentFolderPath,
        parentFolderUri,
        accessToken,
        isForced
      )
    }

    return await this.sasViyaApiClient!.createFolder(
      folderName,
      parentFolderPath,
      parentFolderUri,
      accessToken,
      isForced
    )
  }

  /**
   * Creates a file in the logical SAS folder tree
   * @param fileName - name of the file to be created.
   * @param content - content of the file to be created.
   * @param parentFolderPath - the full path (eg `/Public/example/myFolder`) of the parent folder.
   * @param parentFolderUri - the URI of the parent folder.
   * @param accessToken - the access token to authorizing the request.
   * @param sasApiClient - a client for interfacing with SAS API.
   */
  public async createFile(
    fileName: string,
    content: Buffer,
    parentFolderPath: string,
    parentFolderUri?: string,
    accessToken?: string,
    sasApiClient?: SASViyaApiClient
  ) {
    if (sasApiClient)
      return await sasApiClient.createFile(
        fileName,
        content,
        parentFolderPath,
        parentFolderUri,
        accessToken
      )
    return await this.sasViyaApiClient!.createFile(
      fileName,
      content,
      parentFolderPath,
      parentFolderUri,
      accessToken
    )
  }

  /**
   * Fetches a folder from the SAS file system.
   * @param folderPath - path of the folder to be fetched.
   * @param accessToken - the access token to authorize the request.
   */
  public async getFolder(folderPath: string, accessToken?: string) {
    this.isMethodSupported('getFolder', [ServerType.SasViya])
    return await this.sasViyaApiClient!.getFolder(folderPath, accessToken)
  }

  /**
   * For performance (and in case of accidental error) the `deleteFolder` function does not actually delete the folder (and all its content and subfolder content). Instead the folder is simply moved to the recycle bin. Deletion time will be added to the folder name.
   * @param folderPath - the full path (eg `/Public/example/deleteThis`) of the folder to be deleted.
   * @param accessToken - an access token for authorizing the request.
   */
  public async deleteFolder(folderPath: string, accessToken: string) {
    this.isMethodSupported('deleteFolder', [ServerType.SasViya])

    return await this.sasViyaApiClient?.deleteFolder(folderPath, accessToken)
  }

  /**
   * Lists children folders for given Viya folder.
   * @param sourceFolder - the full path (eg `/Public/example/myFolder`) or URI of the source folder listed. Providing URI instead of path will save one extra request.
   * @param accessToken - an access token for authorizing the request.
   */
  public async listFolder(
    sourceFolder: string,
    accessToken?: string,
    limit?: number
  ) {
    this.isMethodSupported('listFolder', [ServerType.SasViya])

    return await this.sasViyaApiClient?.listFolder(
      sourceFolder,
      accessToken,
      limit
    )
  }

  /**
   * Moves folder to a new location.  The folder may be renamed at the same time.
   * @param sourceFolder - the full path (eg `/Public/example/myFolder`) or URI of the source folder to be moved. Providing URI instead of path will save one extra request.
   * @param targetParentFolder - the full path or URI of the _parent_ folder to which the `sourceFolder` will be moved (eg `/Public/newDestination`). To move a folder, a user has to have write permissions in targetParentFolder. Providing URI instead of path will save one extra request.
   * @param targetFolderName - the name of the "moved" folder.  If left blank, the original folder name will be used (eg `myFolder` in `/Public/newDestination/myFolder` for the example above).  Optional field.
   * @param accessToken - an access token for authorizing the request.
   */
  public async moveFolder(
    sourceFolder: string,
    targetParentFolder: string,
    targetFolderName: string,
    accessToken: string
  ) {
    this.isMethodSupported('moveFolder', [ServerType.SasViya])

    return await this.sasViyaApiClient?.moveFolder(
      sourceFolder,
      targetParentFolder,
      targetFolderName,
      accessToken
    )
  }

  public async createJobDefinition(
    jobName: string,
    code: string,
    parentFolderPath?: string,
    parentFolderUri?: string,
    accessToken?: string,
    sasApiClient?: SASViyaApiClient
  ) {
    this.isMethodSupported('createJobDefinition', [ServerType.SasViya])

    if (sasApiClient)
      return await sasApiClient!.createJobDefinition(
        jobName,
        code,
        parentFolderPath,
        parentFolderUri,
        accessToken
      )
    return await this.sasViyaApiClient!.createJobDefinition(
      jobName,
      code,
      parentFolderPath,
      parentFolderUri,
      accessToken
    )
  }

  public async getAuthCode(clientId: string) {
    this.isMethodSupported('getAuthCode', [ServerType.SasViya])

    return await this.sasViyaApiClient!.getAuthCode(clientId)
  }

  /**
   * Exchanges the auth code for an access token for the given client.
   * @param clientId - the client ID to authenticate with.
   * @param clientSecret - the client secret to authenticate with.
   * @param authCode - the auth code received from the server.
   */
  public async getAccessToken(
    clientId: string,
    clientSecret: string,
    authCode: string
  ): Promise<SasAuthResponse | SASjsAuthResponse> {
    this.isMethodSupported('getAccessToken', [
      ServerType.SasViya,
      ServerType.Sasjs
    ])

    if (this.sasjsConfig.serverType === ServerType.Sasjs)
      return await this.sasJSApiClient!.getAccessToken(clientId, authCode)

    return await this.sasViyaApiClient!.getAccessToken(
      clientId,
      clientSecret,
      authCode
    )
  }

  /**
   * Exchanges the refresh token for an access token for the given client.
   * @param clientId - the client ID to authenticate with.
   * @param clientSecret - the client secret to authenticate with.
   * @param refreshToken - the refresh token received from the server.
   */
  public async refreshTokens(
    clientId: string,
    clientSecret: string,
    refreshToken: string
  ): Promise<SasAuthResponse | SASjsAuthResponse> {
    this.isMethodSupported('refreshTokens', [
      ServerType.SasViya,
      ServerType.Sasjs
    ])

    if (this.sasjsConfig.serverType === ServerType.Sasjs)
      return await this.sasJSApiClient!.refreshTokens(refreshToken)

    return await this.sasViyaApiClient!.refreshTokens(
      clientId,
      clientSecret,
      refreshToken
    )
  }

  public async deleteClient(clientId: string, accessToken: string) {
    this.isMethodSupported('deleteClient', [ServerType.SasViya])

    return await this.sasViyaApiClient!.deleteClient(clientId, accessToken)
  }

  /**
   * Returns the current SASjs configuration.
   *
   */
  public getSasjsConfig() {
    return this.sasjsConfig
  }

  /**
   * Returns the username of the user currently logged in.
   *
   */
  public getUserName() {
    return this.authManager!.userName
  }

  /**
   * Sets the SASjs configuration.
   * @param config - SASjs configuration.
   */
  public async setSASjsConfig(config: SASjsConfig) {
    this.sasjsConfig = {
      ...this.sasjsConfig,
      ...config
    }
    this.setupConfiguration()
  }

  /**
   * Sets the debug state. Turning this on will enable additional logging in the adapter.
   * @param value - boolean indicating debug state (on/off).
   */
  public setDebugState(value: boolean) {
    this.sasjsConfig.debug = value
    if (this.sasViyaApiClient) {
      this.sasViyaApiClient.debug = value
    }
  }

  /**
   * Checks whether a session is active, or login is required.
   * @returns - a promise which resolves with an object containing two values - a boolean `isLoggedIn`, and a string `userName`.
   */
  public async checkSession() {
    return this.authManager!.checkSession()
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
      if (config.serverType === ServerType.Sasjs) {
        return await this.sasjsJobExecutor!.execute(
          sasJob,
          data,
          config,
          loginRequiredCallback,
          authConfig,
          extraResponseAttributes
        )
      } else if (
        config.serverType === ServerType.SasViya &&
        config.useComputeApi !== undefined &&
        config.useComputeApi !== null
      ) {
        if (config.useComputeApi) {
          return await this.computeJobExecutor!.execute(
            sasJob,
            data,
            config,
            loginRequiredCallback,
            authConfig
          )
        } else {
          if (!config.contextName)
            config = {
              ...config,
              contextName: 'SAS Job Execution compute context'
            }
          return await this.jesJobExecutor!.execute(
            sasJob,
            data,
            config,
            loginRequiredCallback,
            authConfig,
            extraResponseAttributes
          )
        }
      } else if (
        config.serverType === ServerType.Sas9 &&
        config.username &&
        config.password
      ) {
        return await this.sas9JobExecutor!.execute(sasJob, data, config)
      } else {
        return await this.webJobExecutor!.execute(
          sasJob,
          data,
          config,
          loginRequiredCallback,
          authConfig,
          extraResponseAttributes
        )
      }
    } else {
      return Promise.reject(new ErrorResponse(validationResult.msg))
    }
  }

  /**
   * Creates the folders and services at the given location `appLoc` on the given server `serverUrl`.
   * @param serviceJson - the JSON specifying the folders and services to be created.
   * @param appLoc - the base folder in which to create the new folders and
   * services.  If not provided, is taken from SASjsConfig.
   * @param serverUrl - the server on which to deploy the folders and services.
   * If not provided, is taken from SASjsConfig.
   * @param accessToken - an optional access token to be passed in when
   * using this function from the command line.
   * @param isForced - flag that indicates if target folder already exists, it and all subfolders have to be deleted.
   */
  public async deployServicePack(
    serviceJson: any,
    appLoc?: string,
    serverUrl?: string,
    accessToken?: string,
    isForced = false
  ) {
    this.isMethodSupported('deployServicePack', [ServerType.SasViya])

    let sasApiClient: any = null

    if (serverUrl || appLoc) {
      if (!serverUrl) serverUrl = this.sasjsConfig.serverUrl
      if (!appLoc) appLoc = this.sasjsConfig.appLoc

      if (this.sasjsConfig.serverType === ServerType.SasViya) {
        sasApiClient = new SASViyaApiClient(
          serverUrl,
          appLoc,
          this.sasjsConfig.contextName,
          this.requestClient!
        )
        sasApiClient.debug = this.sasjsConfig.debug
      } else if (this.sasjsConfig.serverType === ServerType.Sas9) {
        sasApiClient = new SAS9ApiClient(
          serverUrl,
          this.jobsPath,
          this.sasjsConfig.httpsAgentOptions
        )
      }
    } else {
      let sasClientConfig: any = null

      if (this.sasjsConfig.serverType === ServerType.SasViya) {
        sasClientConfig = this.sasViyaApiClient!.getConfig()
      } else if (this.sasjsConfig.serverType === ServerType.Sas9) {
        sasClientConfig = this.sas9ApiClient!.getConfig()
      }

      serverUrl = sasClientConfig.serverUrl
      appLoc = sasClientConfig.rootFolderName as string
    }

    // members of type 'folder' should be processed first
    if (serviceJson.members[0].members) {
      serviceJson.members[0].members.sort((member: { type: string }) =>
        member.type === 'folder' ? -1 : 1
      )
    }

    const members = serviceJson.members

    await this.createFoldersAndServices(
      appLoc,
      members,
      accessToken,
      sasApiClient,
      isForced
    )
  }

  /**
   * Kicks off execution of the given job via the compute API.
   * @returns an object representing the compute session created for the given job.
   * @param sasJob - the path to the SAS program (ultimately resolves to
   *  the SAS `_program` parameter to run a Job Definition or SAS 9 Stored
   *  Process). Is prepended at runtime with the value of `appLoc`.
   * @param data - a JSON object containing one or more tables to be sent to
   * SAS. Can be `null` if no inputs required.
   * @param config - provide any changes to the config here, for instance to
   * enable/disable `debug`. Any change provided will override the global config,
   * for that particular function call.
   * @param authConfig - a valid client, secret, refresh and access tokens that are authorised to execute compute jobs.
   * The access token is not required when the user is authenticated via the browser.
   * @param waitForResult - a boolean that indicates whether the function needs to wait for execution to complete.
   * @param pollOptions - an object that represents poll interval(milliseconds) and maximum amount of attempts. Object example: { maxPollCount: 24 * 60 * 60, pollInterval: 1000 }. More information available at src/api/viya/pollJobState.ts.
   * @param printPid - a boolean that indicates whether the function should print (PID) of the started job.
   * @param variables - an object that represents macro variables.
   */
  public async startComputeJob(
    sasJob: string,
    data: any,
    config: any = {},
    authConfig?: AuthConfig,
    waitForResult?: boolean,
    pollOptions?: PollOptions,
    printPid = false,
    variables?: MacroVar
  ) {
    config = {
      ...this.sasjsConfig,
      ...config
    }

    this.isMethodSupported('startComputeJob', [ServerType.SasViya])
    if (!config.contextName) {
      throw new Error(
        'Context name is undefined. Please set a `contextName` in your SASjs or override config.'
      )
    }

    return this.sasViyaApiClient?.executeComputeJob(
      sasJob,
      config.contextName,
      config.debug,
      data,
      authConfig,
      !!waitForResult,
      false,
      pollOptions,
      printPid,
      variables
    )
  }

  private resendWaitingRequests = async () => {
    await this.webJobExecutor?.resendWaitingRequests()
    await this.computeJobExecutor?.resendWaitingRequests()
    await this.jesJobExecutor?.resendWaitingRequests()
    await this.fileUploader?.resendWaitingRequests()
    await this.sasjsJobExecutor?.resendWaitingRequests()
  }

  /**
   * Fetches content of the log file
   * @param logUrl - url of the log file.
   * @param accessToken - an access token for an authorised user.
   */
  public async fetchLogFileContent(logUrl: string, accessToken?: string) {
    return await this.requestClient!.get(logUrl, accessToken).then((res) => {
      if (!res)
        return Promise.reject(
          new ErrorResponse(
            'Error while fetching log. Response was not provided.'
          )
        )

      try {
        const result = JSON.stringify(res.result)

        return result
      } catch (err) {
        return Promise.reject(
          new ErrorResponse(
            'Error while fetching log. The result is not valid.',
            err
          )
        )
      }
    })
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

  public clearSasRequests() {
    this.requestClient!.clearRequests()
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
      const RequestClientClass =
        this.sasjsConfig.serverType === ServerType.Sasjs
          ? SasjsRequestClient
          : RequestClient
      this.requestClient = new RequestClientClass(
        this.sasjsConfig.serverUrl,
        this.sasjsConfig.httpsAgentOptions,
        this.sasjsConfig.requestHistoryLimit
      )
    } else {
      this.requestClient.setConfig(
        this.sasjsConfig.serverUrl,
        this.sasjsConfig.httpsAgentOptions
      )
    }

    this.jobsPath =
      this.sasjsConfig.serverType === ServerType.SasViya
        ? this.sasjsConfig.pathSASViya
        : this.sasjsConfig.serverType === ServerType.Sas9
        ? this.sasjsConfig.pathSAS9
        : this.sasjsConfig.pathSASJS

    this.authManager = new AuthManager(
      this.sasjsConfig.serverUrl,
      this.sasjsConfig.serverType!,
      this.requestClient,
      this.resendWaitingRequests
    )

    if (this.sasjsConfig.serverType === ServerType.SasViya) {
      if (this.sasViyaApiClient) {
        this.sasViyaApiClient!.setConfig(
          this.sasjsConfig.serverUrl,
          this.sasjsConfig.appLoc
        )
      } else {
        this.sasViyaApiClient = new SASViyaApiClient(
          this.sasjsConfig.serverUrl,
          this.sasjsConfig.appLoc,
          this.sasjsConfig.contextName,
          this.requestClient
        )
      }

      this.sasViyaApiClient.debug = this.sasjsConfig.debug
    }

    if (this.sasjsConfig.serverType === ServerType.Sas9) {
      if (this.sas9ApiClient) {
        this.sas9ApiClient!.setConfig(this.sasjsConfig.serverUrl)
      } else {
        this.sas9ApiClient = new SAS9ApiClient(
          this.sasjsConfig.serverUrl,
          this.jobsPath,
          this.sasjsConfig.httpsAgentOptions
        )
      }
    }

    if (this.sasjsConfig.serverType === ServerType.Sasjs) {
      if (!this.sasJSApiClient) {
        this.sasJSApiClient = new SASjsApiClient(this.requestClient)
      }
    }

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
      this.requestClient,
      this.sasViyaApiClient!
    )

    this.sasjsJobExecutor = new SasjsJobExecutor(
      this.sasjsConfig.serverUrl,
      this.jobsPath,
      this.requestClient
    )

    this.sas9JobExecutor = new Sas9JobExecutor(
      this.sasjsConfig.serverUrl,
      this.sasjsConfig.serverType!,
      this.jobsPath,
      this.requestClient,
      this.sasjsConfig.httpsAgentOptions
    )

    this.computeJobExecutor = new ComputeJobExecutor(
      this.sasjsConfig.serverUrl,
      this.sasViyaApiClient!
    )

    this.jesJobExecutor = new JesJobExecutor(
      this.sasjsConfig.serverUrl,
      this.sasViyaApiClient!
    )
  }

  private async createFoldersAndServices(
    parentFolder: string,
    membersJson: any[],
    accessToken?: string,
    sasApiClient?: SASViyaApiClient,
    isForced?: boolean
  ) {
    await asyncForEach(membersJson, async (member: any) => {
      switch (member.type) {
        case 'folder':
          await this.createFolder(
            member.name,
            parentFolder,
            undefined,
            accessToken,
            sasApiClient,
            isForced
          )
          break
        case 'file':
          await this.createFile(
            member.name,
            member.code,
            parentFolder,
            undefined,
            accessToken,
            sasApiClient
          )
          break
        case 'service':
          await this.createJobDefinition(
            member.name,
            member.code,
            parentFolder,
            undefined,
            accessToken,
            sasApiClient
          )
          break
        default:
          throw new Error(`Unidentified member '${member.name}' provided.`)
      }
      if (member.type === 'folder' && member.members && member.members.length)
        await this.createFoldersAndServices(
          `${parentFolder}/${member.name}`,
          member.members,
          accessToken,
          sasApiClient,
          isForced
        )
    })
  }

  private isMethodSupported(method: string, serverTypes: ServerType[]) {
    if (
      !this.sasjsConfig.serverType ||
      !serverTypes.includes(this.sasjsConfig.serverType)
    ) {
      throw new Error(
        `Method '${method}' is only supported on ${serverTypes.join(
          ', '
        )} servers.`
      )
    }
  }
}
