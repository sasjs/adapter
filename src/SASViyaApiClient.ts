import { isRelativePath, isUri, isUrl } from './utils'
import * as NodeFormData from 'form-data'
import {
  Job,
  Session,
  Context,
  ContextAllAttributes,
  Folder,
  File,
  EditContextInput,
  JobDefinition,
  PollOptions
} from './types'
import { JobExecutionError, RootFolderNotFoundError } from './types/errors'
import { SessionManager } from './SessionManager'
import { ContextManager } from './ContextManager'
import { SasAuthResponse, MacroVar, AuthConfig } from '@sasjs/utils/types'
import { isAuthorizeFormRequired } from './auth/isAuthorizeFormRequired'
import { RequestClient } from './request/RequestClient'
import { prefixMessage } from '@sasjs/utils/error'
import { pollJobState } from './api/viya/pollJobState'
import { getTokens } from './auth/getTokens'
import { uploadTables } from './api/viya/uploadTables'
import { executeScript } from './api/viya/executeScript'
import { getAccessToken } from './auth/getAccessToken'
import { refreshTokens } from './auth/refreshTokens'

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
   * @param authConfig - an access token, refresh token, client and secret for an authorized user.
   */
  public async getExecutableContexts(authConfig?: AuthConfig) {
    const bindedExecuteScript = this.executeScript.bind(this)

    return await this.contextManager.getExecutableContexts(
      bindedExecuteScript,
      authConfig
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
   * @param authConfig - an object containing an access token, refresh token, client ID and secret.
   * @param data - execution data.
   * @param debug - when set to true, the log will be returned.
   * @param expectWebout - when set to true, the automatic _webout fileref will be checked for content, and that content returned. This fileref is used when the Job contains a SASjs web request (as opposed to executing arbitrary SAS code).
   * @param waitForResult - when set to true, function will return the session
   * @param pollOptions - an object that represents poll interval(milliseconds) and maximum amount of attempts. Object example: { MAX_POLL_COUNT: 24 * 60 * 60, POLL_INTERVAL: 1000 }.
   * @param printPid - a boolean that indicates whether the function should print (PID) of the started job.
   * @param variables - an object that represents macro variables.
   */
  public async executeScript(
    jobPath: string,
    linesOfCode: string[],
    contextName: string,
    authConfig?: AuthConfig,
    data = null,
    debug: boolean = false,
    expectWebout = false,
    waitForResult = true,
    pollOptions?: PollOptions,
    printPid = false,
    variables?: MacroVar
  ): Promise<any> {
    return executeScript(
      this.requestClient,
      this.sessionManager,
      this.rootFolderName,
      jobPath,
      linesOfCode,
      contextName,
      authConfig,
      data,
      debug,
      expectWebout,
      waitForResult,
      pollOptions,
      printPid,
      variables
    )
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
   * Creates a file. Path to or URI of the parent folder is required.
   * @param fileName - the name of the new file.
   * @param contentBuffer - the content of the new file in Buffer.
   * @param parentFolderPath - the full path to the parent folder.  If not
   *  provided, the parentFolderUri must be provided.
   * @param parentFolderUri - the URI (eg /folders/folders/UUID) of the parent
   *  folder. If not provided, the parentFolderPath must be provided.
   * @param accessToken - an access token for authorizing the request.
   */
  public async createFile(
    fileName: string,
    contentBuffer: Buffer,
    parentFolderPath?: string,
    parentFolderUri?: string,
    accessToken?: string
  ): Promise<File> {
    if (!parentFolderPath && !parentFolderUri) {
      throw new Error('Path or URI of the parent folder is required.')
    }

    if (!parentFolderUri && parentFolderPath) {
      parentFolderUri = await this.getFolderUri(parentFolderPath, accessToken)
    }

    const headers = {
      Accept: 'application/vnd.sas.file+json',
      'Content-Disposition': `filename="${fileName}";`
    }

    const formData = new NodeFormData()
    formData.append('file', contentBuffer, fileName)

    return (
      await this.requestClient.post<File>(
        `/files/files?parentFolderUri=${parentFolderUri}&typeDefName=file#rawUpload`,
        formData,
        accessToken,
        'multipart/form-data; boundary=' + (formData as any)._boundary,
        headers
      )
    ).result
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
    const logger = process.logger || console
    if (!parentFolderPath && !parentFolderUri) {
      throw new Error('Path or URI of the parent folder is required.')
    }

    if (!parentFolderUri && parentFolderPath) {
      parentFolderUri = await this.getFolderUri(parentFolderPath, accessToken)
      if (!parentFolderUri) {
        logger.info(
          `Parent folder at path '${parentFolderPath}' is not present.`
        )

        const newParentFolderPath = parentFolderPath.substring(
          0,
          parentFolderPath.lastIndexOf('/')
        )
        const newFolderName = `${parentFolderPath.split('/').pop()}`
        if (newParentFolderPath === '') {
          throw new RootFolderNotFoundError(
            parentFolderPath,
            this.serverUrl,
            accessToken
          )
        }
        logger.info(
          `Creating parent folder:\n'${newFolderName}' in '${newParentFolderPath}'`
        )
        const parentFolder = await this.createFolder(
          newFolderName,
          newParentFolderPath,
          undefined,
          accessToken
        )
        logger.info(
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

    const { result: createFolderResponse } =
      await this.requestClient.post<Folder>(
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
    return getAccessToken(this.requestClient, clientId, clientSecret, authCode)
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
    return refreshTokens(
      this.requestClient,
      clientId,
      clientSecret,
      refreshToken
    )
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
   * @param variables - an object that represents macro variables.
   */
  public async executeComputeJob(
    sasJob: string,
    contextName: string,
    debug?: boolean,
    data?: any,
    authConfig?: AuthConfig,
    waitForResult = true,
    expectWebout = false,
    pollOptions?: PollOptions,
    printPid = false,
    variables?: MacroVar
  ) {
    let access_token = (authConfig || {}).access_token
    if (authConfig) {
      ;({ access_token } = await getTokens(this.requestClient, authConfig))
    }

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

    await this.populateFolderMap(fullFolderPath, access_token).catch((err) => {
      throw prefixMessage(err, 'Error while populating folder map. ')
    })

    const jobFolder = this.folderMap.get(fullFolderPath)

    if (!jobFolder) {
      throw new Error(
        `The folder '${fullFolderPath}' was not found on '${this.serverUrl}'`
      )
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

      const { result: jobDefinition } = await this.requestClient
        .get<JobDefinition>(
          `${this.serverUrl}${jobDefinitionLink.href}`,
          access_token
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
      authConfig,
      data,
      debug,
      expectWebout,
      waitForResult,
      pollOptions,
      printPid,
      variables
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
    authConfig?: AuthConfig
  ) {
    let access_token = (authConfig || {}).access_token
    if (authConfig) {
      ;({ access_token } = await getTokens(this.requestClient, authConfig))
    }
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
    await this.populateFolderMap(fullFolderPath, access_token)

    const jobFolder = this.folderMap.get(fullFolderPath)
    if (!jobFolder) {
      throw new Error(
        `The folder '${fullFolderPath}' was not found on '${this.serverUrl}'.`
      )
    }

    const jobToExecute = jobFolder?.find((item) => item.name === jobName)

    let files: any[] = []
    if (data && Object.keys(data).length) {
      files = await this.uploadTables(data, access_token)
    }

    if (!jobToExecute) {
      throw new Error(`Job was not found.`)
    }
    const jobDefinitionLink = jobToExecute?.links.find(
      (l) => l.rel === 'getResource'
    )?.href

    const { result: jobDefinition } = await this.requestClient.get<Job>(
      `${this.serverUrl}${jobDefinitionLink}`,
      access_token
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
    const { result: postedJob } = await this.requestClient.post<Job>(
      `${this.serverUrl}/jobExecution/jobs?_action=wait`,
      postJobRequestBody,
      access_token
    )
    const jobStatus = await this.pollJobState(postedJob, authConfig).catch(
      (err) => {
        throw prefixMessage(err, 'Error while polling job status. ')
      }
    )
    const { result: currentJob } = await this.requestClient.get<Job>(
      `${this.serverUrl}/jobExecution/jobs/${postedJob.id}`,
      access_token
    )

    let jobResult
    let log

    const resultLink = currentJob.results['_webout.json']
    const logLink = currentJob.links.find((l) => l.rel === 'log')
    if (resultLink) {
      jobResult = await this.requestClient.get<any>(
        `${this.serverUrl}${resultLink}/content`,
        access_token,
        'text/plain'
      )
    }
    if (debug && logLink) {
      log = await this.requestClient
        .get<any>(`${this.serverUrl}${logLink.href}/content`, access_token)
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

  private async pollJobState(
    postedJob: Job,
    authConfig?: AuthConfig,
    pollOptions?: PollOptions
  ) {
    return pollJobState(
      this.requestClient,
      postedJob,
      this.debug,
      authConfig,
      pollOptions
    )
  }

  private async uploadTables(data: any, accessToken?: string) {
    return uploadTables(this.requestClient, data, accessToken)
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

    if (!sourceFolderUri) {
      return undefined
    }
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
