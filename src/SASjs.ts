import { isIEorEdgeOrOldFirefox } from './utils/isIeOrEdge'
import * as e6p from 'es6-promise'
;(e6p as any).polyfill()
if (isIEorEdgeOrOldFirefox()) {
  if (window) {
    window.fetch = undefined as any // ensure the polyfill runs
  }
}
// tslint:disable-next-line
require('isomorphic-fetch')
import {
  convertToCSV,
  compareTimestamps,
  serialize,
  isAuthorizeFormRequired,
  parseAndSubmitAuthorizeForm,
  splitChunks,
  isLogInRequired,
  isLogInSuccess,
  parseSourceCode,
  parseGeneratedCode,
  parseWeboutResponse,
  needsRetry,
  asyncForEach,
  isRelativePath
} from './utils'
import {
  SASjsConfig,
  SASjsRequest,
  SASjsWaitingRequest,
  ServerType,
  CsrfToken,
  UploadFile,
  EditContextInput,
  ErrorResponse
} from './types'
import { SASViyaApiClient } from './SASViyaApiClient'
import { SAS9ApiClient } from './SAS9ApiClient'
import { FileUploader } from './FileUploader'

const defaultConfig: SASjsConfig = {
  serverUrl: '',
  pathSAS9: '/SASStoredProcess/do',
  pathSASViya: '/SASJobExecution',
  appLoc: '/Public/seedapp',
  serverType: ServerType.SASViya,
  debug: true,
  contextName: 'SAS Job Execution compute context',
  useComputeApi: false
}

const requestRetryLimit = 5

/**
 * SASjs is a JavaScript adapter for SAS.
 *
 */
export default class SASjs {
  private sasjsConfig: SASjsConfig = new SASjsConfig()
  private jobsPath: string = ''
  private logoutUrl: string = ''
  private loginUrl: string = ''
  private csrfTokenApi: CsrfToken | null = null
  private csrfTokenWeb: CsrfToken | null = null
  private retryCountWeb: number = 0
  private retryCountComputeApi: number = 0
  private retryCountJeseApi: number = 0
  private sasjsRequests: SASjsRequest[] = []
  private sasjsWaitingRequests: SASjsWaitingRequest[] = []
  private userName: string = ''
  private sasViyaApiClient: SASViyaApiClient | null = null
  private sas9ApiClient: SAS9ApiClient | null = null
  private fileUploader: FileUploader | null = null

  constructor(config?: any) {
    this.sasjsConfig = {
      ...defaultConfig,
      ...config
    }

    this.setupConfiguration()
  }

  public async executeScriptSAS9(
    linesOfCode: string[],
    serverName: string,
    repositoryName: string
  ) {
    this.isMethodSupported('executeScriptSAS9', ServerType.SAS9)

    return await this.sas9ApiClient?.executeScript(
      linesOfCode,
      serverName,
      repositoryName
    )
  }

  public async getAllContexts(accessToken: string) {
    this.isMethodSupported('getAllContexts', ServerType.SASViya)

    return await this.sasViyaApiClient!.getAllContexts(accessToken)
  }

  public async getExecutableContexts(accessToken: string) {
    this.isMethodSupported('getExecutableContexts', ServerType.SASViya)

    return await this.sasViyaApiClient!.getExecutableContexts(accessToken)
  }

  /**
   * Creates a compute context on the given server.
   * @param contextName - the name of the context to be created.
   * @param launchContextName - the name of the launcher context used by the compute service.
   * @param sharedAccountId - the ID of the account to run the servers for this context as.
   * @param autoExecLines - the lines of code to execute during session initialization.
   * @param authorizedUsers - an optional list of authorized user IDs.
   * @param accessToken - an access token for an authorized user.
   */
  public async createContext(
    contextName: string,
    launchContextName: string,
    sharedAccountId: string,
    autoExecLines: string[],
    authorizedUsers: string[],
    accessToken: string
  ) {
    this.isMethodSupported('createContext', ServerType.SASViya)

    return await this.sasViyaApiClient!.createContext(
      contextName,
      launchContextName,
      sharedAccountId,
      autoExecLines,
      authorizedUsers,
      accessToken
    )
  }

  /**
   * Updates a compute context on the given server.
   * @param contextName - the original name of the context to be deleted.
   * @param editedContext - an object with the properties to be updated.
   * @param accessToken - an access token for an authorized user.
   */
  public async editContext(
    contextName: string,
    editedContext: EditContextInput,
    accessToken?: string
  ) {
    this.isMethodSupported('editContext', ServerType.SASViya)

    return await this.sasViyaApiClient!.editContext(
      contextName,
      editedContext,
      accessToken
    )
  }

  /**
   * Deletes a compute context on the given server.
   * @param contextName - the name of the context to be deleted.
   * @param accessToken - an access token for an authorized user.
   */
  public async deleteContext(contextName: string, accessToken?: string) {
    this.isMethodSupported('deleteContext', ServerType.SASViya)

    return await this.sasViyaApiClient!.deleteContext(contextName, accessToken)
  }

  public async createSession(contextName: string, accessToken: string) {
    this.isMethodSupported('createSession', ServerType.SASViya)

    return await this.sasViyaApiClient!.createSession(contextName, accessToken)
  }

  public async executeScriptSASViya(
    fileName: string,
    linesOfCode: string[],
    contextName: string,
    accessToken?: string,
    sessionId = '',
    silent = false
  ) {
    this.isMethodSupported('executeScriptSASViya', ServerType.SASViya)

    return await this.sasViyaApiClient!.executeScript(
      fileName,
      linesOfCode,
      contextName,
      accessToken,
      silent,
      null,
      this.sasjsConfig.debug
    )
  }

  /**
   * Creates a folder at SAS file system.
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
    this.isMethodSupported('createFolder', ServerType.SASViya)

    if (sasApiClient)
      return await sasApiClient.createFolder(
        folderName,
        parentFolderPath,
        parentFolderUri,
        accessToken
      )
    return await this.sasViyaApiClient!.createFolder(
      folderName,
      parentFolderPath,
      parentFolderUri,
      accessToken,
      isForced
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
    this.isMethodSupported('createJobDefinition', ServerType.SASViya)

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
    this.isMethodSupported('getAuthCode', ServerType.SASViya)

    return await this.sasViyaApiClient!.getAuthCode(clientId)
  }

  public async getAccessToken(
    clientId: string,
    clientSecret: string,
    authCode: string
  ) {
    this.isMethodSupported('getAccessToken', ServerType.SASViya)

    return await this.sasViyaApiClient!.getAccessToken(
      clientId,
      clientSecret,
      authCode
    )
  }

  public async refreshTokens(
    clientId: string,
    clientSecret: string,
    refreshToken: string
  ) {
    this.isMethodSupported('refreshTokens', ServerType.SASViya)

    return await this.sasViyaApiClient!.refreshTokens(
      clientId,
      clientSecret,
      refreshToken
    )
  }

  public async deleteClient(clientId: string, accessToken: string) {
    this.isMethodSupported('deleteClient', ServerType.SASViya)

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
    return this.userName
  }

  /**
   * Returns the _csrf token of the current session for the API approach.
   *
   */
  public getCsrfApi() {
    return this.csrfTokenApi?.value
  }

  /**
   * Returns the _csrf token of the current session for the WEB approach.
   *
   */
  public getCsrfWeb() {
    return this.csrfTokenWeb?.value
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
    await this.setupConfiguration()
  }

  /**
   * Sets the debug state. Turning this on will enable additional logging in the adapter.
   * @param value - boolean indicating debug state (on/off).
   */
  public setDebugState(value: boolean) {
    this.sasjsConfig.debug = value
  }

  /**
   * Checks whether a session is active, or login is required.
   * @returns - a promise which resolves with an object containing two values - a boolean `isLoggedIn`, and a string `userName`.
   */
  public async checkSession() {
    const loginResponse = await fetch(this.loginUrl.replace('.do', ''))
    const responseText = await loginResponse.text()
    const isLoggedIn = /<button.+onClick.+logout/gm.test(responseText)

    return Promise.resolve({
      isLoggedIn,
      userName: this.userName
    })
  }

  /**
   * Logs into the SAS server with the supplied credentials.
   * @param username - a string representing the username.
   * @param password - a string representing the password.
   */
  public async logIn(username: string, password: string) {
    const loginParams: any = {
      _service: 'default',
      username,
      password
    }

    this.userName = loginParams.username

    const { isLoggedIn } = await this.checkSession()
    if (isLoggedIn) {
      this.resendWaitingRequests()

      return Promise.resolve({
        isLoggedIn,
        userName: this.userName
      })
    }

    const loginForm = await this.getLoginForm()

    for (const key in loginForm) {
      loginParams[key] = loginForm[key]
    }
    const loginParamsStr = serialize(loginParams)

    return fetch(this.loginUrl, {
      method: 'post',
      credentials: 'include',
      referrerPolicy: 'same-origin',
      body: loginParamsStr,
      headers: new Headers({
        'Content-Type': 'application/x-www-form-urlencoded'
      })
    })
      .then((response) => response.text())
      .then(async (responseText) => {
        let authFormRes: any
        let loggedIn

        if (isAuthorizeFormRequired(responseText)) {
          authFormRes = await parseAndSubmitAuthorizeForm(
            responseText,
            this.sasjsConfig.serverUrl
          )
        } else {
          loggedIn = isLogInSuccess(responseText)
        }

        if (!loggedIn) {
          const currentSession = await this.checkSession()
          loggedIn = currentSession.isLoggedIn
        }

        if (loggedIn) {
          this.resendWaitingRequests()
        }

        return {
          isLoggedIn: loggedIn,
          userName: this.userName
        }
      })
      .catch((e) => Promise.reject(e))
  }

  /**
   * Logs out of the configured SAS server.
   */
  public logOut() {
    return new Promise((resolve, reject) => {
      const logOutURL = `${this.sasjsConfig.serverUrl}${this.logoutUrl}`
      fetch(logOutURL)
        .then(() => {
          resolve(true)
        })
        .catch((err: Error) => reject(err))
    })
  }

  /**
   * Uploads a file to the given service.
   * @param sasJob - the path to the SAS program (ultimately resolves to
   *  the SAS `_program` parameter to run a Job Definition or SAS 9 Stored
   *  Process). Is prepended at runtime with the value of `appLoc`.
   * @param files - array of files to be uploaded, including File object and file name.
   * @param params - request URL parameters.
   */
  public uploadFile(sasJob: string, files: UploadFile[], params: any) {
    const fileUploader =
      this.fileUploader ||
      new FileUploader(
        this.sasjsConfig.appLoc,
        this.sasjsConfig.serverUrl,
        this.jobsPath,
        this.setCsrfTokenWeb,
        this.csrfTokenWeb
      )

    return fileUploader.uploadFile(sasJob, files, params)
  }

  /**
   * Makes a request to the SAS Service specified in `SASjob`. The response
   * object will always contain table names in lowercase, and column names in
   * uppercase. Values are returned formatted by default, unformatted
   * values can be configured as an option in the `%webout` macro.
   *
   * @param sasJob - the path to the SAS program (ultimately resolves to
   *  the SAS `_program` parameter to run a Job Definition or SAS 9 Stored
   *  Process). Is prepended at runtime with the value of `appLoc`.
   * @param data - a JSON object containing one or more tables to be sent to
   * SAS. Can be `null` if no inputs required.
   * @param config - provide any changes to the config here, for instance to
   * enable/disable `debug`. Any change provided will override the global config,
   * for that particular function call.
   * @param loginRequiredCallback - provide a function here to be called if the
   * user is not logged in (eg to display a login form). The request will be
   * resubmitted after logon.
   */
  public async request(
    sasJob: string,
    data: any,
    config: any = {},
    loginRequiredCallback?: any,
    accessToken?: string
  ) {
    let requestResponse

    config = {
      ...this.sasjsConfig,
      ...config
    }

    if (config.serverType === ServerType.SASViya && config.contextName) {
      if (config.useComputeApi) {
        requestResponse = await this.executeJobViaComputeApi(
          sasJob,
          data,
          config,
          loginRequiredCallback,
          accessToken
        )

        this.retryCountComputeApi = 0
      } else {
        requestResponse = await this.executeJobViaJesApi(
          sasJob,
          data,
          config,
          loginRequiredCallback,
          accessToken
        )

        this.retryCountJeseApi = 0
      }
    } else {
      requestResponse = await this.executeJobViaWeb(
        sasJob,
        data,
        config,
        loginRequiredCallback
      )
    }

    return requestResponse
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
    this.isMethodSupported('deployServicePack', ServerType.SASViya)

    let sasApiClient: any = null
    if (serverUrl || appLoc) {
      if (!serverUrl) {
        serverUrl = this.sasjsConfig.serverUrl
      }
      if (!appLoc) {
        appLoc = this.sasjsConfig.appLoc
      }
      if (this.sasjsConfig.serverType === ServerType.SASViya) {
        sasApiClient = new SASViyaApiClient(
          serverUrl,
          appLoc,
          this.sasjsConfig.contextName,
          this.setCsrfTokenApi
        )
      } else if (this.sasjsConfig.serverType === ServerType.SAS9) {
        sasApiClient = new SAS9ApiClient(serverUrl)
      }
    } else {
      let sasClientConfig: any = null
      if (this.sasjsConfig.serverType === ServerType.SASViya) {
        sasClientConfig = this.sasViyaApiClient!.getConfig()
      } else if (this.sasjsConfig.serverType === ServerType.SAS9) {
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

    const members =
      serviceJson.members[0].name === 'services'
        ? serviceJson.members[0].members
        : serviceJson.members

    await this.createFoldersAndServices(
      appLoc,
      members,
      accessToken,
      sasApiClient,
      isForced
    )
  }

  private async executeJobViaComputeApi(
    sasJob: string,
    data: any,
    config: any,
    loginRequiredCallback?: any,
    accessToken?: string
  ) {
    const sasjsWaitingRequest: SASjsWaitingRequest = {
      requestPromise: {
        promise: null,
        resolve: null,
        reject: null
      },
      SASjob: sasJob,
      data
    }

    sasjsWaitingRequest.requestPromise.promise = new Promise(
      async (resolve, reject) => {
        this.sasViyaApiClient
          ?.executeComputeJob(
            sasJob,
            config.contextName,
            config.debug,
            data,
            accessToken
          )
          .then((response) => {
            if (!config.debug) {
              this.appendSasjsRequest(null, sasJob, null)
            } else {
              this.appendSasjsRequest(response, sasJob, null)
            }

            let responseJson

            try {
              responseJson = JSON.parse(response!.result)
            } catch {
              responseJson = JSON.parse(parseWeboutResponse(response!.result))
            }

            resolve(responseJson)
          })
          .catch(async (response) => {
            let error = response.error || response

            if (needsRetry(JSON.stringify(error))) {
              if (this.retryCountComputeApi < requestRetryLimit) {
                let retryResponse = await this.executeJobViaComputeApi(
                  sasJob,
                  data,
                  config,
                  loginRequiredCallback,
                  accessToken
                )

                this.retryCountComputeApi++

                resolve(retryResponse)
              } else {
                this.retryCountComputeApi = 0
                reject(
                  new ErrorResponse('Compute API retry requests limit reached')
                )
              }
            }

            if (error && error.status === 401) {
              if (loginRequiredCallback) loginRequiredCallback(true)
              sasjsWaitingRequest.requestPromise.resolve = resolve
              sasjsWaitingRequest.requestPromise.reject = reject
              sasjsWaitingRequest.config = config
              this.sasjsWaitingRequests.push(sasjsWaitingRequest)
            } else {
              reject(new ErrorResponse('Job execution failed', error))
            }

            this.appendSasjsRequest(response.log, sasJob, null)
          })
      }
    )
    return sasjsWaitingRequest.requestPromise.promise
  }

  private async executeJobViaJesApi(
    sasJob: string,
    data: any,
    config: any,
    loginRequiredCallback?: any,
    accessToken?: string
  ) {
    const sasjsWaitingRequest: SASjsWaitingRequest = {
      requestPromise: {
        promise: null,
        resolve: null,
        reject: null
      },
      SASjob: sasJob,
      data
    }

    sasjsWaitingRequest.requestPromise.promise = new Promise(
      async (resolve, reject) => {
        const session = await this.checkSession()

        if (!session.isLoggedIn && !accessToken) {
          if (loginRequiredCallback) loginRequiredCallback(true)
          sasjsWaitingRequest.requestPromise.resolve = resolve
          sasjsWaitingRequest.requestPromise.reject = reject
          sasjsWaitingRequest.config = config
          this.sasjsWaitingRequests.push(sasjsWaitingRequest)
        } else {
          resolve(
            await this.sasViyaApiClient
              ?.executeJob(
                sasJob,
                config.contextName,
                config.debug,
                data,
                accessToken
              )
              .then((response) => {
                if (!config.debug) {
                  this.appendSasjsRequest(null, sasJob, null)
                } else {
                  this.appendSasjsRequest(response, sasJob, null)
                }

                let responseJson

                try {
                  responseJson = JSON.parse(response!.result)
                } catch {
                  responseJson = JSON.parse(
                    parseWeboutResponse(response!.result)
                  )
                }

                return responseJson
              })
              .catch(async (e) => {
                if (needsRetry(JSON.stringify(e))) {
                  if (this.retryCountJeseApi < requestRetryLimit) {
                    let retryResponse = await this.executeJobViaJesApi(
                      sasJob,
                      data,
                      config,
                      loginRequiredCallback,
                      accessToken
                    )

                    this.retryCountJeseApi++

                    resolve(retryResponse)
                  } else {
                    this.retryCountJeseApi = 0
                    reject(
                      new ErrorResponse('Jes API retry requests limit reached')
                    )
                  }
                }

                reject(new ErrorResponse('Job execution failed', e))
              })
          )
        }
      }
    )
    return sasjsWaitingRequest.requestPromise.promise
  }

  private async executeJobViaWeb(
    sasJob: string,
    data: any,
    config: any,
    loginRequiredCallback?: any
  ) {
    const sasjsWaitingRequest: SASjsWaitingRequest = {
      requestPromise: {
        promise: null,
        resolve: null,
        reject: null
      },
      SASjob: sasJob,
      data
    }
    const program = config.appLoc
      ? config.appLoc.replace(/\/?$/, '/') + sasJob.replace(/^\//, '')
      : sasJob
    const jobUri =
      config.serverType === ServerType.SASViya
        ? await this.getJobUri(sasJob)
        : ''
    const apiUrl = `${config.serverUrl}${this.jobsPath}/?${
      jobUri.length > 0
        ? '__program=' + program + '&_job=' + jobUri
        : '_program=' + program
    }`

    const requestParams = {
      ...this.getRequestParamsWeb(config)
    }

    const formData = new FormData()

    let isError = false
    let errorMsg = ''

    if (data) {
      const stringifiedData = JSON.stringify(data)
      if (
        config.serverType === ServerType.SAS9 ||
        stringifiedData.length > 500000 ||
        stringifiedData.includes(';')
      ) {
        // file upload approach
        for (const tableName in data) {
          if (isError) {
            return
          }
          const name = tableName
          const csv = convertToCSV(data[tableName])
          if (csv === 'ERROR: LARGE STRING LENGTH') {
            isError = true
            errorMsg =
              'The max length of a string value in SASjs is 32765 characters.'
          }

          const file = new Blob([csv], {
            type: 'application/csv'
          })

          formData.append(name, file, `${name}.csv`)
        }
      } else {
        // param based approach
        const sasjsTables = []
        let tableCounter = 0
        for (const tableName in data) {
          if (isError) {
            return
          }
          tableCounter++
          sasjsTables.push(tableName)
          const csv = convertToCSV(data[tableName])
          if (csv === 'ERROR: LARGE STRING LENGTH') {
            isError = true
            errorMsg =
              'The max length of a string value in SASjs is 32765 characters.'
          }
          // if csv has length more then 16k, send in chunks
          if (csv.length > 16000) {
            const csvChunks = splitChunks(csv)
            // append chunks to form data with same key
            csvChunks.map((chunk) => {
              formData.append(`sasjs${tableCounter}data`, chunk)
            })
          } else {
            requestParams[`sasjs${tableCounter}data`] = csv
          }
        }
        requestParams['sasjs_tables'] = sasjsTables.join(' ')
      }
    }

    for (const key in requestParams) {
      if (requestParams.hasOwnProperty(key)) {
        formData.append(key, requestParams[key])
      }
    }

    let isRedirected = false

    sasjsWaitingRequest.requestPromise.promise = new Promise(
      (resolve, reject) => {
        if (isError) {
          reject(new ErrorResponse(errorMsg))
        }
        const headers: any = {}
        if (this.csrfTokenWeb) {
          headers[this.csrfTokenWeb.headerName] = this.csrfTokenWeb.value
        }
        fetch(apiUrl, {
          method: 'POST',
          body: formData,
          referrerPolicy: 'same-origin',
          headers
        })
          .then(async (response) => {
            if (!response.ok) {
              if (response.status === 403) {
                const tokenHeader = response.headers.get('X-CSRF-HEADER')

                if (tokenHeader) {
                  const token = response.headers.get(tokenHeader)
                  this.csrfTokenWeb = {
                    headerName: tokenHeader,
                    value: token || ''
                  }
                }
              }
            }

            if (response.redirected && config.serverType === ServerType.SAS9) {
              isRedirected = true
            }

            return response.text()
          })
          .then((responseText) => {
            if (
              (needsRetry(responseText) || isRedirected) &&
              !isLogInRequired(responseText)
            ) {
              if (this.retryCountWeb < requestRetryLimit) {
                this.retryCountWeb++
                this.request(sasJob, data, config, loginRequiredCallback).then(
                  (res: any) => resolve(res),
                  (err: any) => reject(err)
                )
              } else {
                this.retryCountWeb = 0
                reject(responseText)
              }
            } else {
              this.retryCountWeb = 0
              this.parseLogFromResponse(responseText, program)

              if (isLogInRequired(responseText)) {
                if (loginRequiredCallback) loginRequiredCallback(true)
                sasjsWaitingRequest.requestPromise.resolve = resolve
                sasjsWaitingRequest.requestPromise.reject = reject
                sasjsWaitingRequest.config = config
                this.sasjsWaitingRequests.push(sasjsWaitingRequest)
              } else {
                if (config.serverType === ServerType.SAS9 && config.debug) {
                  this.updateUsername(responseText)
                  const jsonResponseText = parseWeboutResponse(responseText)

                  if (jsonResponseText !== '') {
                    resolve(JSON.parse(jsonResponseText))
                  } else {
                    reject(
                      new ErrorResponse(
                        'Job WEB execution failed',
                        this.parseSAS9ErrorResponse(responseText)
                      )
                    )
                  }
                } else if (
                  config.serverType === ServerType.SASViya &&
                  config.debug
                ) {
                  try {
                    this.parseSASVIYADebugResponse(responseText).then(
                      (resText: any) => {
                        this.updateUsername(resText)
                        try {
                          resolve(JSON.parse(resText))
                        } catch (e) {
                          reject(
                            new ErrorResponse(
                              'Job WEB debug response parsing failed',
                              { response: resText, exception: e }
                            )
                          )
                        }
                      },
                      (err: any) => {
                        reject(
                          new ErrorResponse(
                            'Job WEB debug response parsing failed',
                            err
                          )
                        )
                      }
                    )
                  } catch (e) {
                    reject(
                      new ErrorResponse(
                        'Job WEB debug response parsing failed',
                        { response: responseText, exception: e }
                      )
                    )
                  }
                } else {
                  this.updateUsername(responseText)
                  try {
                    const parsedJson = JSON.parse(responseText)
                    resolve(parsedJson)
                  } catch (e) {
                    reject(
                      new ErrorResponse('Job WEB response parsing failed', {
                        response: responseText,
                        exception: e
                      })
                    )
                  }
                }
              }
            }
          })
          .catch((e: Error) => {
            reject(new ErrorResponse('Job WEB request failed', e))
          })
      }
    )

    return sasjsWaitingRequest.requestPromise.promise
  }

  private setCsrfTokenWeb = (csrfToken: CsrfToken) => {
    this.csrfTokenWeb = csrfToken
  }

  private setCsrfTokenApi = (csrfToken: CsrfToken) => {
    this.csrfTokenApi = csrfToken
  }

  private async resendWaitingRequests() {
    for (const sasjsWaitingRequest of this.sasjsWaitingRequests) {
      this.request(sasjsWaitingRequest.SASjob, sasjsWaitingRequest.data).then(
        (res: any) => {
          sasjsWaitingRequest.requestPromise.resolve(res)
        },
        (err: any) => {
          sasjsWaitingRequest.requestPromise.reject(err)
        }
      )
    }

    this.sasjsWaitingRequests = []
  }

  private getRequestParamsWeb(config: any): any {
    const requestParams: any = {}

    if (this.csrfTokenWeb) {
      requestParams['_csrf'] = this.csrfTokenWeb.value
    }

    if (config.debug) {
      requestParams['_omittextlog'] = 'false'
      requestParams['_omitsessionresults'] = 'false'

      requestParams['_debug'] = 131
    }

    return requestParams
  }

  private updateUsername(response: any) {
    try {
      const responseJson = JSON.parse(response)
      if (this.sasjsConfig.serverType === ServerType.SAS9) {
        this.userName = responseJson['_METAUSER']
      } else {
        this.userName = responseJson['SYSUSERID']
      }
    } catch (e) {
      this.userName = ''
    }
  }

  private parseSASVIYADebugResponse(response: string) {
    return new Promise((resolve, reject) => {
      const iframeStart = response.split(
        '<iframe style="width: 99%; height: 500px" src="'
      )[1]
      const jsonUrl = iframeStart ? iframeStart.split('"></iframe>')[0] : null

      if (jsonUrl) {
        fetch(this.sasjsConfig.serverUrl + jsonUrl)
          .then((res) => res.text())
          .then((resText) => {
            resolve(resText)
          })
      } else {
        reject('No debug info found in response.')
      }
    })
  }

  private async getJobUri(sasJob: string) {
    if (!this.sasViyaApiClient) return ''
    let uri = ''

    let folderPath
    let jobName: string
    if (isRelativePath(sasJob)) {
      folderPath = sasJob.split('/')[0]
      jobName = sasJob.split('/')[1]
    } else {
      const folderPathParts = sasJob.split('/')
      jobName = folderPathParts.pop() || ''
      folderPath = folderPathParts.join('/')
    }

    const locJobs = await this.sasViyaApiClient.getJobsInFolder(folderPath)
    if (locJobs) {
      const job = locJobs.find(
        (el: any) => el.name === jobName && el.contentType === 'jobDefinition'
      )
      if (job) {
        uri = job.uri
      }
    }
    console.log('URI', uri)
    return uri
  }

  private parseSAS9ErrorResponse(response: string) {
    const logLines = response.split('\n')
    const parsedLines: string[] = []
    let firstErrorLineIndex: number = -1

    logLines.map((line: string, index: number) => {
      if (
        line.toLowerCase().includes('error') &&
        !line.toLowerCase().includes('this request completed with errors.') &&
        firstErrorLineIndex === -1
      ) {
        firstErrorLineIndex = index
      }
    })

    for (let i = firstErrorLineIndex - 10; i <= firstErrorLineIndex + 10; i++) {
      parsedLines.push(logLines[i])
    }

    return parsedLines.join(', ')
  }

  private parseLogFromResponse(response: any, program: string) {
    if (this.sasjsConfig.serverType === ServerType.SAS9) {
      this.appendSasjsRequest(response, program, null)
    } else {
      if (!this.sasjsConfig.debug) {
        this.appendSasjsRequest(null, program, null)
      } else {
        this.appendSasjsRequest(response, program, null)
      }
    }
  }

  private fetchLogFileContent(logLink: string) {
    return new Promise((resolve, reject) => {
      fetch(logLink, {
        method: 'GET'
      })
        .then((response: any) => response.text())
        .then((response: any) => resolve(response))
        .catch((err: Error) => reject(err))
    })
  }

  private async appendSasjsRequest(
    response: any,
    program: string,
    pgmData: any
  ) {
    let sourceCode = ''
    let generatedCode = ''
    let sasWork = null

    if (response && response.result && response.log) {
      sourceCode = parseSourceCode(response.log)
      generatedCode = parseGeneratedCode(response.log)

      if (this.sasjsConfig.debug) {
        if (response.log) {
          sasWork = response.log
        } else {
          sasWork = JSON.parse(parseWeboutResponse(response.result)).WORK
        }
      } else {
        sasWork = JSON.parse(response.result).WORK
      }
    } else {
      if (response) {
        sourceCode = parseSourceCode(response)
        generatedCode = parseGeneratedCode(response)
        sasWork = await this.parseSasWork(response)
      }
    }

    this.sasjsRequests.push({
      logFile: (response && response.log) || response,
      serviceLink: program,
      timestamp: new Date(),
      sourceCode,
      generatedCode,
      SASWORK: sasWork
    })

    if (this.sasjsRequests.length > 20) {
      this.sasjsRequests.splice(0, 1)
    }
  }

  private async parseSasWork(response: any) {
    if (this.sasjsConfig.debug) {
      let jsonResponse

      if (this.sasjsConfig.serverType === ServerType.SAS9) {
        try {
          jsonResponse = JSON.parse(parseWeboutResponse(response))
        } catch (e) {
          console.error(e)
        }
      } else {
        await this.parseSASVIYADebugResponse(response).then(
          (resText: any) => {
            try {
              jsonResponse = JSON.parse(resText)
            } catch (e) {
              console.error(e)
            }
          },
          (err: any) => {
            console.error(err)
          }
        )
      }

      if (jsonResponse) {
        return jsonResponse.WORK
      }
    }
    return null
  }

  public getSasRequests() {
    const sortedRequests = this.sasjsRequests.sort(compareTimestamps)
    return sortedRequests
  }

  public clearSasRequests() {
    this.sasjsRequests = []
  }

  private setupConfiguration() {
    if (
      this.sasjsConfig.serverUrl === undefined ||
      this.sasjsConfig.serverUrl === ''
    ) {
      let url = `${location.protocol}//${location.hostname}`
      if (location.port) {
        url = `${url}:${location.port}`
      }
      this.sasjsConfig.serverUrl = url
    }

    if (this.sasjsConfig.serverUrl.slice(-1) === '/') {
      this.sasjsConfig.serverUrl = this.sasjsConfig.serverUrl.slice(0, -1)
    }

    this.jobsPath =
      this.sasjsConfig.serverType === ServerType.SASViya
        ? this.sasjsConfig.pathSASViya
        : this.sasjsConfig.pathSAS9
    this.loginUrl = `${this.sasjsConfig.serverUrl}/SASLogon/login`
    this.logoutUrl =
      this.sasjsConfig.serverType === ServerType.SAS9
        ? '/SASLogon/logout?'
        : '/SASLogon/logout.do?'

    if (this.sasjsConfig.serverType === ServerType.SASViya) {
      if (this.sasViyaApiClient)
        this.sasViyaApiClient!.setConfig(
          this.sasjsConfig.serverUrl,
          this.sasjsConfig.appLoc
        )
      else
        this.sasViyaApiClient = new SASViyaApiClient(
          this.sasjsConfig.serverUrl,
          this.sasjsConfig.appLoc,
          this.sasjsConfig.contextName,
          this.setCsrfTokenApi
        )
    }
    if (this.sasjsConfig.serverType === ServerType.SAS9) {
      if (this.sas9ApiClient)
        this.sas9ApiClient!.setConfig(this.sasjsConfig.serverUrl)
      else this.sas9ApiClient = new SAS9ApiClient(this.sasjsConfig.serverUrl)
    }

    this.fileUploader = new FileUploader(
      this.sasjsConfig.appLoc,
      this.sasjsConfig.serverUrl,
      this.jobsPath,
      this.setCsrfTokenWeb
    )
  }

  private setLoginUrl = (matches: RegExpExecArray) => {
    let parsedURL = matches[1].replace(/\?.*/, '')
    if (parsedURL[0] === '/') {
      parsedURL = parsedURL.substr(1)

      const tempLoginLink = this.sasjsConfig.serverUrl
        ? `${this.sasjsConfig.serverUrl}/${parsedURL}`
        : `${parsedURL}`

      const loginUrl = tempLoginLink

      this.loginUrl =
        this.sasjsConfig.serverType === ServerType.SASViya
          ? tempLoginLink
          : loginUrl.replace('.do', '')
    }
  }

  private async getLoginForm() {
    const pattern: RegExp = /<form.+action="(.*Logon[^"]*).*>/
    const response = await fetch(this.loginUrl).then((r) => r.text())
    const matches = pattern.exec(response)
    const formInputs: any = {}
    if (matches && matches.length) {
      this.setLoginUrl(matches)
      const inputs = response.match(/<input.*"hidden"[^>]*>/g)
      if (inputs) {
        inputs.forEach((inputStr: string) => {
          const valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/)
          if (valueMatch && valueMatch.length) {
            formInputs[valueMatch[1]] = valueMatch[2]
          }
        })
      }
    }
    return Object.keys(formInputs).length ? formInputs : null
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

  private isMethodSupported(method: string, serverType: string) {
    if (this.sasjsConfig.serverType !== serverType) {
      throw new Error(
        `Method '${method}' is only supported on ${
          serverType === ServerType.SAS9 ? 'SAS9' : 'SAS Viya'
        } servers.`
      )
    }
  }
}
