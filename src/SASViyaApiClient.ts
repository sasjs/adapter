import {
  convertToCSV,
  isRelativePath,
  isUri,
  isUrl,
  fetchLogByChunks
} from './utils'
import * as NodeFormData from 'form-data'
import {
  Job,
  Session,
  Context,
  ContextAllAttributes,
  Folder,
  EditContextInput,
  JobDefinition,
  PollOptions
} from './types'
import {
  ComputeJobExecutionError,
  JobExecutionError,
  NotFoundError
} from './types/errors'
import { formatDataForRequest } from './utils/formatDataForRequest'
import { SessionManager } from './SessionManager'
import { ContextManager } from './ContextManager'
import { timestampToYYYYMMDDHHMMSS } from '@sasjs/utils/time'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import { isAuthorizeFormRequired } from './auth/isAuthorizeFormRequired'
import { RequestClient } from './request/RequestClient'
import { SasAuthResponse } from '@sasjs/utils/types'
import { prefixMessage } from '@sasjs/utils/error'

/**
 * A client for interfacing with the SAS Viya REST API.
 *
 */
export class SASViyaApiClient {
  constructor(
    private serverUrl: string,
    private rootFolderName: string,
    private contextName: string,
    private requestClient: RequestClient
  ) {
    if (serverUrl) isUrl(serverUrl)
  }

  private _debug = false
  private sessionManager = new SessionManager(
    this.serverUrl,
    this.contextName,
    this.requestClient
  )
  private contextManager = new ContextManager(
    this.serverUrl,
    this.requestClient
  )
  private folderMap = new Map<string, Job[]>()

  public get debug() {
    return this._debug
  }

  public set debug(value: boolean) {
    this._debug = value
    if (this.sessionManager) {
      this.sessionManager.debug = value
    }
  }

  /**
   * Returns a list of jobs in the currently set root folder.
   */
  public async getJobsInFolder(folderPath: string) {
    const path = isRelativePath(folderPath)
      ? `${this.rootFolderName}/${folderPath}`
      : folderPath
    if (this.folderMap.get(path)) {
      return this.folderMap.get(path)
    }

    await this.populateFolderMap(path)
    return this.folderMap.get(path)
  }

  /**
   * Returns an object containing the server URL and root folder name.
   */
  public getConfig() {
    return {
      serverUrl: this.serverUrl,
      rootFolderName: this.rootFolderName
    }
  }

  /**
   * Updates server URL and root folder name, if it was not set.
   * @param serverUrl - the URL of the server.
   * @param rootFolderName - the name for root folder.
   */
  public setConfig(serverUrl: string, rootFolderName: string) {
    if (serverUrl) this.serverUrl = serverUrl
    if (rootFolderName) this.rootFolderName = rootFolderName
  }

  /**
   * Returns all available compute contexts on this server.
   * @param accessToken - an access token for an authorized user.
   */
  public async getComputeContexts(accessToken?: string) {
    return await this.contextManager.getComputeContexts(accessToken)
  }

  /**
   * Returns default(system) compute contexts.
   */
  public getDefaultComputeContexts() {
    return this.contextManager.getDefaultComputeContexts
  }

  /**
   * Returns all available launcher contexts on this server.
   * @param accessToken - an access token for an authorized user.
   */
  public async getLauncherContexts(accessToken?: string) {
    return await this.contextManager.getLauncherContexts(accessToken)
  }

  /**
   * Returns all compute contexts on this server that the user has access to.
   * @param accessToken - an access token for an authorized user.
   */
  public async getExecutableContexts(accessToken?: string) {
    const bindedExecuteScript = this.executeScript.bind(this)

    return await this.contextManager.getExecutableContexts(
      bindedExecuteScript,
      accessToken
    )
  }

  /**
   * Creates a session on the given context.
   * @param contextName - the name of the context to create a session on.
   * @param accessToken - an access token for an authorized user.
   */
  public async createSession(contextName: string, accessToken?: string) {
    const headers: any = {
      'Content-Type': 'application/json'
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const { result: contexts } = await this.requestClient.get<{
      items: Context[]
    }>(`/compute/contexts?limit=10000`, accessToken)

    const executionContext =
      contexts.items && contexts.items.length
        ? contexts.items.find((c: any) => c.name === contextName)
        : null
    if (!executionContext) {
      throw new Error(`Execution context ${contextName} not found.`)
    }

    const createSessionRequest = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
    const { result: createdSession } = await this.requestClient.post<Session>(
      `/compute/contexts/${executionContext.id}/sessions`,
      {},
      accessToken
    )

    return createdSession
  }

  /**
   * Creates a compute context on the given server.
   * @param contextName - the name of the context to be created.
   * @param launchContextName - the name of the launcher context used by the compute service.
   * @param sharedAccountId - the ID of the account to run the servers for this context.
   * @param autoExecLines - the lines of code to execute during session initialization.
   * @param accessToken - an access token for an authorized user.
   * @param authorizedUsers - an optional list of authorized user IDs.
   */
  public async createComputeContext(
    contextName: string,
    launchContextName: string,
    sharedAccountId: string,
    autoExecLines: string[],
    accessToken?: string,
    authorizedUsers?: string[]
  ) {
    return await this.contextManager.createComputeContext(
      contextName,
      launchContextName,
      sharedAccountId,
      autoExecLines,
      accessToken,
      authorizedUsers
    )
  }

  /**
   * Creates a launcher context on the given server.
   * @param contextName - the name of the context to be created.
   * @param description - the description of the context to be created.
   * @param launchType - launch type of the context to be created.
   * @param accessToken - an access token for an authorized user.
   */
  public async createLauncherContext(
    contextName: string,
    description: string,
    launchType = 'direct',
    accessToken?: string
  ) {
    return await this.contextManager.createLauncherContext(
      contextName,
      description,
      launchType,
      accessToken
    )
  }

  /**
   * Updates a compute context on the given server.
   * @param contextName - the original name of the context to be updated.
   * @param editedContext - an object with the properties to be updated.
   * @param accessToken - an access token for an authorized user.
   */
  public async editComputeContext(
    contextName: string,
    editedContext: EditContextInput,
    accessToken?: string
  ) {
    return await this.contextManager.editComputeContext(
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
  public async deleteComputeContext(contextName: string, accessToken?: string) {
    return await this.contextManager.deleteComputeContext(
      contextName,
      accessToken
    )
  }

  /**
   * Executes code on the current SAS Viya server.
   * @param jobPath - the path to the file being submitted for execution.
   * @param linesOfCode - an array of code lines to execute.
   * @param contextName - the context to execute the code in.
   * @param accessToken - an access token for an authorized user.
   * @param data - execution data.
   * @param debug - when set to true, the log will be returned.
   * @param expectWebout - when set to true, the automatic _webout fileref will be checked for content, and that content returned. This fileref is used when the Job contains a SASjs web request (as opposed to executing arbitrary SAS code).
   * @param waitForResult - when set to true, function will return the session
   * @param pollOptions - an object that represents poll interval(milliseconds) and maximum amount of attempts. Object example: { MAX_POLL_COUNT: 24 * 60 * 60, POLL_INTERVAL: 1000 }.
   * @param printPid - a boolean that indicates whether the function should print (PID) of the started job.
   */
  public async executeScript(
    jobPath: string,
    linesOfCode: string[],
    contextName: string,
    accessToken?: string,
    data = null,
    debug: boolean = false,
    expectWebout = false,
    waitForResult = true,
    pollOptions?: PollOptions,
    printPid = false
  ): Promise<any> {
    try {
      const headers: any = {
        'Content-Type': 'application/json'
      }

      if (accessToken) headers.Authorization = `Bearer ${accessToken}`

      let executionSessionId: string

      const session = await this.sessionManager
        .getSession(accessToken)
        .catch((err) => {
          throw prefixMessage(err, 'Error while getting session. ')
        })

      executionSessionId = session!.id

      if (printPid) {
        const { result: jobIdVariable } = await this.sessionManager
          .getVariable(executionSessionId, 'SYSJOBID', accessToken)
          .catch((err) => {
            throw prefixMessage(err, 'Error while getting session variable. ')
          })

        if (jobIdVariable && jobIdVariable.value) {
          const relativeJobPath = this.rootFolderName
            ? jobPath.split(this.rootFolderName).join('').replace(/^\//, '')
            : jobPath

          const logger = new Logger(debug ? LogLevel.Debug : LogLevel.Info)

          logger.info(
            `Triggered '${relativeJobPath}' with PID ${
              jobIdVariable.value
            } at ${timestampToYYYYMMDDHHMMSS()}`
          )
        }
      }

      const jobArguments: { [key: string]: any } = {
        _contextName: contextName,
        _OMITJSONLISTING: true,
        _OMITJSONLOG: true,
        _OMITSESSIONRESULTS: true,
        _OMITTEXTLISTING: true,
        _OMITTEXTLOG: true
      }

      if (debug) {
        jobArguments['_OMITTEXTLOG'] = false
        jobArguments['_OMITSESSIONRESULTS'] = false
        jobArguments['_DEBUG'] = 131
      }

      let fileName

      if (isRelativePath(jobPath)) {
        fileName = `exec-${
          jobPath.includes('/') ? jobPath.split('/')[1] : jobPath
        }`
      } else {
        const jobPathParts = jobPath.split('/')
        fileName = jobPathParts.pop()
      }

      let jobVariables: any = {
        SYS_JES_JOB_URI: '',
        _program: isRelativePath(jobPath)
          ? this.rootFolderName + '/' + jobPath
          : jobPath
      }

      let files: any[] = []

      if (data) {
        if (JSON.stringify(data).includes(';')) {
          files = await this.uploadTables(data, accessToken).catch((err) => {
            throw prefixMessage(err, 'Error while uploading tables. ')
          })

          jobVariables['_webin_file_count'] = files.length

          files.forEach((fileInfo, index) => {
            jobVariables[
              `_webin_fileuri${index + 1}`
            ] = `/files/files/${fileInfo.file.id}`
            jobVariables[`_webin_name${index + 1}`] = fileInfo.tableName
          })
        } else {
          jobVariables = { ...jobVariables, ...formatDataForRequest(data) }
        }
      }

      // Execute job in session
      const jobRequestBody = {
        name: fileName,
        description: 'Powered by SASjs',
        code: linesOfCode,
        variables: jobVariables,
        arguments: jobArguments
      }

      const { result: postedJob, etag } = await this.requestClient
        .post<Job>(
          `/compute/sessions/${executionSessionId}/jobs`,
          jobRequestBody,
          accessToken
        )
        .catch((err) => {
          throw prefixMessage(err, 'Error while posting job. ')
        })

      if (!waitForResult) return session

      if (debug) {
        console.log(`Job has been submitted for '${fileName}'.`)
        console.log(
          `You can monitor the job progress at '${this.serverUrl}${
            postedJob.links.find((l: any) => l.rel === 'state')!.href
          }'.`
        )
      }

      const jobStatus = await this.pollJobState(
        postedJob,
        etag,
        accessToken,
        pollOptions
      ).catch((err) => {
        throw prefixMessage(err, 'Error while polling job status. ')
      })

      const { result: currentJob } = await this.requestClient
        .get<Job>(
          `/compute/sessions/${executionSessionId}/jobs/${postedJob.id}`,
          accessToken
        )
        .catch((err) => {
          throw prefixMessage(err, 'Error while getting job. ')
        })

      let jobResult
      let log = ''

      const logLink = currentJob.links.find((l) => l.rel === 'log')

      if (debug && logLink) {
        const logUrl = `${logLink.href}/content`
        const logCount = currentJob.logStatistics?.lineCount ?? 1000000
        log = await fetchLogByChunks(
          this.requestClient,
          accessToken!,
          logUrl,
          logCount
        )
      }

      if (jobStatus === 'failed' || jobStatus === 'error') {
        return Promise.reject(new ComputeJobExecutionError(currentJob, log))
      }

      let resultLink

      if (expectWebout) {
        resultLink = `/compute/sessions/${executionSessionId}/filerefs/_webout/content`
      } else {
        return { job: currentJob, log }
      }

      if (resultLink) {
        jobResult = await this.requestClient
          .get<any>(resultLink, accessToken, 'text/plain')
          .catch(async (e) => {
            if (e instanceof NotFoundError) {
              if (logLink) {
                const logUrl = `${logLink.href}/content`
                const logCount = currentJob.logStatistics?.lineCount ?? 1000000
                log = await fetchLogByChunks(
                  this.requestClient,
                  accessToken!,
                  logUrl,
                  logCount
                )

                return Promise.reject({
                  status: 500,
                  log
                })
              }
            }

            return {
              result: JSON.stringify(e)
            }
          })
      }

      await this.sessionManager
        .clearSession(executionSessionId, accessToken)
        .catch((err) => {
          throw prefixMessage(err, 'Error while clearing session. ')
        })

      return { result: jobResult?.result, log }
    } catch (e) {
      if (e && e.status === 404) {
        return this.executeScript(
          jobPath,
          linesOfCode,
          contextName,
          accessToken,
          data,
          debug,
          false,
          true
        )
      } else {
        throw prefixMessage(e, 'Error while executing script. ')
      }
    }
  }

  /**
   * Fetches a folder. Path to the folder is required.
   * @param folderPath - the absolute path to the folder.
   * @param accessToken - an access token for authorizing the request.
   */
  public async getFolder(folderPath: string, accessToken?: string) {
    return await this.requestClient
      .get(`/folders/folders/@item?path=${folderPath}`, accessToken)
      .then((res) => res.result)
  }

  /**
   * Creates a folder. Path to or URI of the parent folder is required.
   * @param folderName - the name of the new folder.
   * @param parentFolderPath - the full path to the parent folder.  If not
   *  provided, the parentFolderUri must be provided.
   * @param parentFolderUri - the URI (eg /folders/folders/UUID) of the parent
   *  folder. If not provided, the parentFolderPath must be provided.
   * @param accessToken - an access token for authorizing the request.
   * @param isForced - flag that indicates if target folder already exists, it and all subfolders have to be deleted.
   */
  public async createFolder(
    folderName: string,
    parentFolderPath?: string,
    parentFolderUri?: string,
    accessToken?: string,
    isForced?: boolean
  ): Promise<Folder> {
    if (!parentFolderPath && !parentFolderUri) {
      throw new Error('Path or URI of the parent folder is required.')
    }

    if (!parentFolderUri && parentFolderPath) {
      parentFolderUri = await this.getFolderUri(parentFolderPath, accessToken)
      if (!parentFolderUri) {
        console.log(
          `Parent folder at path '${parentFolderPath}' is not present.`
        )

        const newParentFolderPath = parentFolderPath.substring(
          0,
          parentFolderPath.lastIndexOf('/')
        )
        const newFolderName = `${parentFolderPath.split('/').pop()}`
        if (newParentFolderPath === '') {
          throw new Error('Root folder has to be present on the server.')
        }
        console.log(
          `Creating parent folder:\n'${newFolderName}' in '${newParentFolderPath}'`
        )
        const parentFolder = await this.createFolder(
          newFolderName,
          newParentFolderPath,
          undefined,
          accessToken
        )
        console.log(
          `Parent folder '${newFolderName}' has been successfully created.`
        )
        parentFolderUri = `/folders/folders/${parentFolder.id}`
      } else if (isForced && accessToken) {
        const folderPath = parentFolderPath + '/' + folderName
        const folderUri = await this.getFolderUri(folderPath, accessToken)

        if (folderUri) {
          await this.deleteFolder(
            parentFolderPath + '/' + folderName,
            accessToken
          )
        }
      }
    }

    const {
      result: createFolderResponse
    } = await this.requestClient.post<Folder>(
      `/folders/folders?parentFolderUri=${parentFolderUri}`,
      {
        name: folderName,
        type: 'folder'
      },
      accessToken
    )

    // update folder map with newly created folder.
    await this.populateFolderMap(
      `${parentFolderPath}/${folderName}`,
      accessToken
    )
    return createFolderResponse
  }

  /**
   * Creates a Job in the specified folder (or folder uri).
   * @param parentFolderPath - the location of the new job.
   * @param parentFolderUri - the URI location of the new job. The function is a
   * little faster if the folder URI is supplied instead of the path.
   * @param jobName - the name of the new job to be created.
   * @param code - the SAS code for the new job.
   */
  public async createJobDefinition(
    jobName: string,
    code: string,
    parentFolderPath?: string,
    parentFolderUri?: string,
    accessToken?: string
  ) {
    if (!parentFolderPath && !parentFolderUri) {
      throw new Error(`Path to or URI of the parent folder is required.`)
    }

    if (!parentFolderUri && parentFolderPath) {
      parentFolderUri = await this.getFolderUri(parentFolderPath, accessToken)
    }

    return await this.requestClient.post<Job>(
      `${this.serverUrl}/jobDefinitions/definitions?parentFolderUri=${parentFolderUri}`,
      {
        name: jobName,
        parameters: [
          {
            name: '_addjesbeginendmacros',
            type: 'CHARACTER',
            defaultValue: 'false'
          }
        ],
        type: 'Compute',
        code
      },
      accessToken
    )
  }

  /**
   * Performs a login redirect and returns an auth code for the given client.
   * @param clientId - the client ID to authenticate with.
   */
  public async getAuthCode(clientId: string) {
    const authUrl = `${this.serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`

    const authCode = await this.requestClient
      .get<string>(authUrl, undefined, 'text/plain')
      .then((response) => response.result)
      .then(async (response) => {
        let code = ''
        if (isAuthorizeFormRequired(response)) {
          const formResponse: any = await this.requestClient.authorize(response)

          const responseBody = formResponse
            .split('<body>')[1]
            .split('</body>')[0]
          const bodyElement: any = document.createElement('div')
          bodyElement.innerHTML = responseBody

          code = bodyElement.querySelector('.infobox h4').innerText

          return code
        } else {
          const responseBody = response.split('<body>')[1].split('</body>')[0]
          const bodyElement: any = document.createElement('div')
          bodyElement.innerHTML = responseBody

          if (bodyElement) {
            code = bodyElement.querySelector('.infobox h4').innerText
          }

          return code
        }
      })
      .catch(() => null)

    return authCode
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
  ): Promise<SasAuthResponse> {
    const url = this.serverUrl + '/SASLogon/oauth/token'
    let token
    if (typeof Buffer === 'undefined') {
      token = btoa(clientId + ':' + clientSecret)
    } else {
      token = Buffer.from(clientId + ':' + clientSecret).toString('base64')
    }
    const headers = {
      Authorization: 'Basic ' + token
    }

    let formData
    if (typeof FormData === 'undefined') {
      formData = new NodeFormData()
      formData.append('grant_type', 'authorization_code')
      formData.append('code', authCode)
    } else {
      formData = new FormData()
      formData.append('grant_type', 'authorization_code')
      formData.append('code', authCode)
    }

    const authResponse = await this.requestClient
      .post(
        url,
        formData,
        undefined,
        'multipart/form-data; boundary=' + (formData as any)._boundary,
        headers
      )
      .then((res) => res.result as SasAuthResponse)

    return authResponse
  }

  /**
   * Exchanges the refresh token for an access token for the given client.
   * @param clientId - the client ID to authenticate with.
   * @param clientSecret - the client secret to authenticate with.
   * @param authCode - the refresh token received from the server.
   */
  public async refreshTokens(
    clientId: string,
    clientSecret: string,
    refreshToken: string
  ) {
    const url = this.serverUrl + '/SASLogon/oauth/token'
    let token
    if (typeof Buffer === 'undefined') {
      token = btoa(clientId + ':' + clientSecret)
    } else {
      token = Buffer.from(clientId + ':' + clientSecret).toString('base64')
    }
    const headers = {
      Authorization: 'Basic ' + token
    }

    let formData
    if (typeof FormData === 'undefined') {
      formData = new NodeFormData()
      formData.append('grant_type', 'refresh_token')
      formData.append('refresh_token', refreshToken)
    } else {
      formData = new FormData()
      formData.append('grant_type', 'refresh_token')
      formData.append('refresh_token', refreshToken)
    }

    const authResponse = await this.requestClient
      .post<SasAuthResponse>(
        url,
        formData,
        undefined,
        'multipart/form-data; boundary=' + (formData as any)._boundary,
        headers
      )
      .then((res) => res.result)

    return authResponse
  }

  /**
   * Deletes the client representing the supplied ID.
   * @param clientId - the client ID to authenticate with.
   * @param accessToken - an access token for authorizing the request.
   */
  public async deleteClient(clientId: string, accessToken?: string) {
    const url = this.serverUrl + `/oauth/clients/${clientId}`
    const headers: any = {}
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const deleteResponse = await this.requestClient.delete(url, accessToken)

    return deleteResponse.result
  }

  /**
   * Executes a job via the SAS Viya Compute API.
   * @param sasJob - the relative path to the job.
   * @param contextName - the name of the context where the job is to be executed.
   * @param debug - sets the _debug flag in the job arguments.
   * @param data - any data to be passed in as input to the job.
   * @param accessToken - an optional access token for an authorized user.
   * @param waitForResult - a boolean indicating if the function should wait for a result.
   * @param expectWebout - a boolean indicating whether to expect a _webout response.
   * @param pollOptions - an object that represents poll interval(milliseconds) and maximum amount of attempts. Object example: { MAX_POLL_COUNT: 24 * 60 * 60, POLL_INTERVAL: 1000 }.
   * @param printPid - a boolean that indicates whether the function should print (PID) of the started job.
   */
  public async executeComputeJob(
    sasJob: string,
    contextName: string,
    debug?: boolean,
    data?: any,
    accessToken?: string,
    waitForResult = true,
    expectWebout = false,
    pollOptions?: PollOptions,
    printPid = false
  ) {
    if (isRelativePath(sasJob) && !this.rootFolderName) {
      throw new Error(
        'Relative paths cannot be used without specifying a root folder name'
      )
    }

    const folderPathParts = sasJob.split('/')
    const jobName = folderPathParts.pop()
    const folderPath = folderPathParts.join('/')
    const fullFolderPath = isRelativePath(sasJob)
      ? `${this.rootFolderName}/${folderPath}`
      : folderPath

    await this.populateFolderMap(fullFolderPath, accessToken).catch((err) => {
      throw prefixMessage(err, 'Error while populating folder map. ')
    })

    const jobFolder = this.folderMap.get(fullFolderPath)

    if (!jobFolder) {
      throw new Error(
        `The folder '${fullFolderPath}' was not found on '${this.serverUrl}'`
      )
    }

    const headers: any = { 'Content-Type': 'application/json' }

    if (!!accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const jobToExecute = jobFolder?.find((item) => item.name === jobName)

    if (!jobToExecute) {
      throw new Error(`Job was not found.`)
    }

    let code = jobToExecute?.code

    if (!code) {
      const jobDefinitionLink = jobToExecute?.links.find(
        (l) => l.rel === 'getResource'
      )

      if (!jobDefinitionLink) {
        throw new Error(`URI of job definition was not found.`)
      }

      const {
        result: jobDefinition
      } = await this.requestClient
        .get<JobDefinition>(
          `${this.serverUrl}${jobDefinitionLink.href}`,
          accessToken
        )
        .catch((err) => {
          throw prefixMessage(err, 'Error while getting job definition. ')
        })

      code = jobDefinition.code

      // Adds code to existing job definition
      jobToExecute.code = code
    }

    if (!code) code = ''

    const linesToExecute = code.replace(/\r\n/g, '\n').split('\n')

    return await this.executeScript(
      sasJob,
      linesToExecute,
      contextName,
      accessToken,
      data,
      debug,
      expectWebout,
      waitForResult,
      pollOptions,
      printPid
    )
  }

  /**
   * Executes a job via the SAS Viya Job Execution API
   * @param sasJob - the relative or absolute path to the job.
   * @param contextName - the name of the context where the job is to be executed.
   * @param debug - sets the _debug flag in the job arguments.
   * @param data - any data to be passed in as input to the job.
   * @param accessToken - an optional access token for an authorized user.
   */
  public async executeJob(
    sasJob: string,
    contextName: string,
    debug: boolean,
    data?: any,
    accessToken?: string
  ) {
    if (isRelativePath(sasJob) && !this.rootFolderName) {
      throw new Error(
        'Relative paths cannot be used without specifying a root folder name.'
      )
    }

    const folderPathParts = sasJob.split('/')
    const jobName = folderPathParts.pop()
    const folderPath = folderPathParts.join('/')
    const fullFolderPath = isRelativePath(sasJob)
      ? `${this.rootFolderName}/${folderPath}`
      : folderPath
    await this.populateFolderMap(fullFolderPath, accessToken)

    const jobFolder = this.folderMap.get(fullFolderPath)
    if (!jobFolder) {
      throw new Error(
        `The folder '${fullFolderPath}' was not found on '${this.serverUrl}'.`
      )
    }

    const jobToExecute = jobFolder?.find((item) => item.name === jobName)

    let files: any[] = []
    if (data && Object.keys(data).length) {
      files = await this.uploadTables(data, accessToken)
    }

    if (!jobToExecute) {
      throw new Error(`Job was not found.`)
    }
    const jobDefinitionLink = jobToExecute?.links.find(
      (l) => l.rel === 'getResource'
    )?.href

    const { result: jobDefinition } = await this.requestClient.get<Job>(
      `${this.serverUrl}${jobDefinitionLink}`,
      accessToken
    )

    const jobArguments: { [key: string]: any } = {
      _contextName: contextName,
      _program: `${fullFolderPath}/${jobName}`,
      _webin_file_count: files.length,
      _OMITJSONLISTING: true,
      _OMITJSONLOG: true,
      _OMITSESSIONRESULTS: true,
      _OMITTEXTLISTING: true,
      _OMITTEXTLOG: true
    }

    if (debug) {
      jobArguments['_OMITTEXTLOG'] = 'false'
      jobArguments['_OMITSESSIONRESULTS'] = 'false'
      jobArguments['_DEBUG'] = 131
    }

    files.forEach((fileInfo, index) => {
      jobArguments[
        `_webin_fileuri${index + 1}`
      ] = `/files/files/${fileInfo.file.id}`
      jobArguments[`_webin_name${index + 1}`] = fileInfo.tableName
    })

    const postJobRequestBody = {
      name: `exec-${jobName}`,
      description: 'Powered by SASjs',
      jobDefinition,
      arguments: jobArguments
    }
    const { result: postedJob, etag } = await this.requestClient.post<Job>(
      `${this.serverUrl}/jobExecution/jobs?_action=wait`,
      postJobRequestBody,
      accessToken
    )
    const jobStatus = await this.pollJobState(
      postedJob,
      etag,
      accessToken
    ).catch((err) => {
      throw prefixMessage(err, 'Error while polling job status. ')
    })
    const { result: currentJob } = await this.requestClient.get<Job>(
      `${this.serverUrl}/jobExecution/jobs/${postedJob.id}`,
      accessToken
    )

    let jobResult
    let log

    const resultLink = currentJob.results['_webout.json']
    const logLink = currentJob.links.find((l) => l.rel === 'log')
    if (resultLink) {
      jobResult = await this.requestClient.get<any>(
        `${this.serverUrl}${resultLink}/content`,
        accessToken,
        'text/plain'
      )
    }
    if (debug && logLink) {
      log = await this.requestClient
        .get<any>(`${this.serverUrl}${logLink.href}/content`, accessToken)
        .then((res: any) => res.result.items.map((i: any) => i.line).join('\n'))
    }
    if (jobStatus === 'failed') {
      throw new JobExecutionError(
        currentJob.error?.errorCode,
        currentJob.error?.message,
        log
      )
    }
    return { result: jobResult?.result, log }
  }

  private async populateFolderMap(folderPath: string, accessToken?: string) {
    const path = isRelativePath(folderPath)
      ? `${this.rootFolderName}/${folderPath}`
      : folderPath
    if (this.folderMap.get(path)) {
      return
    }

    const url = '/folders/folders/@item?path=' + path
    const { result: folder } = await this.requestClient
      .get<Folder>(`${url}`, accessToken)
      .catch((err) => {
        throw prefixMessage(err, 'Error while getting folder. ')
      })

    if (!folder) {
      throw new Error(`The path ${path} does not exist on ${this.serverUrl}`)
    }

    const { result: members } = await this.requestClient
      .get<{ items: any[] }>(
        `/folders/folders/${folder.id}/members?limit=${folder.memberCount}`,
        accessToken
      )
      .catch((err) => {
        throw prefixMessage(err, 'Error while getting members. ')
      })

    const itemsAtRoot = members.items

    this.folderMap.set(path, itemsAtRoot)
  }

  // REFACTOR: set default value for 'pollOptions' attribute
  private async pollJobState(
    postedJob: any,
    etag: string | null,
    accessToken?: string,
    pollOptions?: PollOptions
  ) {
    let POLL_INTERVAL = 300
    let MAX_POLL_COUNT = 1000

    if (pollOptions) {
      POLL_INTERVAL = pollOptions.POLL_INTERVAL || POLL_INTERVAL
      MAX_POLL_COUNT = pollOptions.MAX_POLL_COUNT || MAX_POLL_COUNT
    }

    let postedJobState = ''
    let pollCount = 0
    const headers: any = {
      'Content-Type': 'application/json',
      'If-None-Match': etag
    }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }
    const stateLink = postedJob.links.find((l: any) => l.rel === 'state')
    if (!stateLink) {
      Promise.reject(`Job state link was not found.`)
    }

    const { result: state } = await this.requestClient
      .get<string>(
        `${this.serverUrl}${stateLink.href}?_action=wait&wait=30`,
        accessToken,
        'text/plain',
        {},
        this.debug
      )
      .catch((err) => {
        throw prefixMessage(err, 'Error while getting job state. ')
      })

    const currentState = state.trim()
    if (currentState === 'completed') {
      return Promise.resolve(currentState)
    }

    return new Promise(async (resolve, _) => {
      let printedState = ''

      const interval = setInterval(async () => {
        if (
          postedJobState === 'running' ||
          postedJobState === '' ||
          postedJobState === 'pending'
        ) {
          if (stateLink) {
            const { result: jobState } = await this.requestClient
              .get<string>(
                `${this.serverUrl}${stateLink.href}?_action=wait&wait=30`,
                accessToken,
                'text/plain',
                {},
                this.debug
              )
              .catch((err) => {
                throw prefixMessage(
                  err,
                  'Error while getting job state after interval. '
                )
              })

            postedJobState = jobState.trim()

            if (this.debug && printedState !== postedJobState) {
              console.log('Polling job status...')
              console.log(`Current job state: ${postedJobState}`)

              printedState = postedJobState
            }

            pollCount++

            if (pollCount >= MAX_POLL_COUNT) {
              resolve(postedJobState)
            }
          }
        } else {
          clearInterval(interval)
          resolve(postedJobState)
        }
      }, POLL_INTERVAL)
    })
  }

  private async uploadTables(data: any, accessToken?: string) {
    const uploadedFiles = []
    const headers: any = {
      'Content-Type': 'application/json'
    }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    for (const tableName in data) {
      const csv = convertToCSV(data[tableName])
      if (csv === 'ERROR: LARGE STRING LENGTH') {
        throw new Error(
          'The max length of a string value in SASjs is 32765 characters.'
        )
      }

      const uploadResponse = await this.requestClient
        .uploadFile(`${this.serverUrl}/files/files#rawUpload`, csv, accessToken)
        .catch((err) => {
          throw prefixMessage(err, 'Error while uploading file. ')
        })

      uploadedFiles.push({ tableName, file: uploadResponse.result })
    }
    return uploadedFiles
  }

  private async getFolderDetails(
    folderPath: string,
    accessToken?: string
  ): Promise<Folder | undefined> {
    const url = isUri(folderPath)
      ? folderPath
      : `/folders/folders/@item?path=${folderPath}`

    const { result: folder } = await this.requestClient
      .get<Folder>(`${this.serverUrl}${url}`, accessToken)
      .catch(() => {
        return { result: null }
      })

    if (!folder) return undefined
    return folder
  }

  private async getFolderUri(folderPath: string, accessToken?: string) {
    const folderDetails = await this.getFolderDetails(folderPath, accessToken)

    if (!folderDetails) return undefined

    return `/folders/folders/${folderDetails.id}`
  }

  private async getRecycleBinUri(accessToken: string) {
    const url = '/folders/folders/@myRecycleBin'

    const { result: folder } = await this.requestClient
      .get<Folder>(`${this.serverUrl}${url}`, accessToken)
      .catch(() => {
        return { result: null }
      })

    if (!folder) return undefined

    return `/folders/folders/${folder.id}`
  }

  /**
   * Returns a JSON representation of a compute context.
   * @example: { "createdBy": "admin", "links": [...], "id": "ID", "version": 2, "name": "context1" }
   * @param contextName - the name of the context to return.
   * @param accessToken - an access token for an authorized user.
   */
  public async getComputeContextByName(
    contextName: string,
    accessToken?: string
  ): Promise<Context> {
    return await this.contextManager.getComputeContextByName(
      contextName,
      accessToken
    )
  }

  /**
   * Returns a JSON representation of a compute context.
   * @param contextId - an id of the context to return.
   * @param accessToken - an access token for an authorized user.
   */
  public async getComputeContextById(
    contextId: string,
    accessToken?: string
  ): Promise<ContextAllAttributes> {
    return await this.contextManager.getComputeContextById(
      contextId,
      accessToken
    )
  }

  /**
   * Lists children folders for given Viya folder.
   * @param sourceFolder - the full path (eg `/Public/example/myFolder`) or URI of the source folder listed. Providing URI instead of path will save one extra request.
   * @param accessToken - an access token for authorizing the request.
   */
  public async listFolder(
    sourceFolder: string,
    accessToken?: string,
    limit: number = 20
  ) {
    // checks if 'sourceFolder' is already a URI
    const sourceFolderUri = isUri(sourceFolder)
      ? sourceFolder
      : await this.getFolderUri(sourceFolder, accessToken)

    const requestInfo = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken
      }
    }

    const { result: members } = await this.requestClient.get<{ items: any[] }>(
      `${this.serverUrl}${sourceFolderUri}/members?limit=${limit}`,
      accessToken
    )

    if (members && members.items) {
      return members.items.map((item: any) => item.name)
    } else {
      return []
    }
  }

  /**
   * Moves Viya folder to a new location.  The folder may be renamed at the same time.
   * @param sourceFolder - the full path (eg `/Public/example/myFolder`) or URI of the source folder to be moved. Providing URI instead of path will save one extra request.
   * @param targetParentFolder - the full path or URI of the _parent_ folder to which the `sourceFolder` will be moved (eg `/Public/newDestination`). To move a folder, a user has to have write permissions in targetParentFolder. Providing URI instead of the path will save one extra request.
   * @param targetFolderName - the name of the "moved" folder.  If left blank, the original folder name will be used (eg `myFolder` in `/Public/newDestination/myFolder` for the example above).  Optional field.
   * @param accessToken - an access token for authorizing the request.
   */
  public async moveFolder(
    sourceFolder: string,
    targetParentFolder: string,
    targetFolderName: string,
    accessToken: string
  ) {
    // If target path is an existing folder, than keep source folder name, othervise rename it with given target folder name
    const sourceFolderName = sourceFolder.split('/').pop() as string
    const targetFolderDetails = await this.getFolderDetails(
      targetParentFolder,
      accessToken
    )

    if (!targetFolderDetails) {
      let targetParentFolderArr = targetParentFolder.split('/')
      targetParentFolderArr.splice(targetParentFolderArr.length - 1, 1)
      targetParentFolder = targetParentFolderArr.join('/')
    } else {
      targetFolderName = sourceFolderName
    }

    // checks if 'sourceFolder' is already an URI
    const sourceFolderUri = await this.getFolderUri(sourceFolder, accessToken)

    // checks if 'targetParentFolder' is already a URI
    const targetParentFolderUri = await this.getFolderUri(
      targetParentFolder,
      accessToken
    )

    const sourceFolderId = sourceFolderUri?.split('/').pop()

    const { result: folder } = await this.requestClient
      .patch<Folder>(
        `${this.serverUrl}${sourceFolderUri}`,
        {
          id: sourceFolderId,
          name: targetFolderName,
          parentFolderUri: targetParentFolderUri
        },
        accessToken
      )
      .catch((err) => {
        if (err.code && err.code === 'ENOTFOUND') {
          const notFoundError = {
            body: {
              message: `Folder '${sourceFolder
                .split('/')
                .pop()}' was not found.`
            }
          }

          throw notFoundError
        }

        throw err
      })

    if (!folder) return undefined

    return folder
  }

  /**
   * For performance (and in case of accidental error) the `deleteFolder` function does not actually delete the folder (and all its content and subfolder content). Instead the folder is simply moved to the recycle bin. Deletion time will be added to the folder name.
   * @param folderPath - the full path (eg `/Public/example/deleteThis`) of the folder to be deleted.
   * @param accessToken - an access token for authorizing the request.
   */
  public async deleteFolder(folderPath: string, accessToken: string) {
    const recycleBinUri = await this.getRecycleBinUri(accessToken)
    const folderName = folderPath.split('/').pop() || ''
    const date = new Date()
    const timeMark = date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
    const deletedFolderName = folderName + ' ' + timeMark

    const movedFolder = await this.moveFolder(
      folderPath,
      recycleBinUri!,
      deletedFolderName,
      accessToken
    )

    return movedFolder
  }
}
