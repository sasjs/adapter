import {
  isAuthorizeFormRequired,
  parseAndSubmitAuthorizeForm,
  convertToCSV,
  makeRequest,
  isUri,
  isUrl
} from './utils'
import * as NodeFormData from 'form-data'
import * as path from 'path'
import {
  Job,
  Session,
  Context,
  Folder,
  CsrfToken,
  EditContextInput
} from './types'
import { JobDefinition } from './types/JobDefinition'
import { formatDataForRequest } from './utils/formatDataForRequest'
import { SessionManager } from './SessionManager'

/**
 * A client for interfacing with the SAS Viya REST API
 *
 */
export class SASViyaApiClient {
  constructor(
    private serverUrl: string,
    private rootFolderName: string,
    private contextName: string,
    private setCsrfToken: (csrfToken: CsrfToken) => void,
    private rootFolderMap = new Map<string, Job[]>()
  ) {
    if (!rootFolderName) {
      throw new Error('Root folder must be provided.')
    }

    if (serverUrl) isUrl(serverUrl)
  }

  private csrfToken: CsrfToken | null = null
  private rootFolder: Folder | null = null
  private sessionManager = new SessionManager(
    this.serverUrl,
    this.contextName,
    this.setCsrfToken
  )
  private isForceDeploy: boolean = false

  /**
   * Returns a map containing the directory structure in the currently set root folder.
   */
  public async getAppLocMap() {
    if (this.rootFolderMap.size) {
      return this.rootFolderMap
    }

    this.populateRootFolderMap()
    return this.rootFolderMap
  }

  /**
   * returns an object containing the Server URL and root folder name
   */
  public getConfig() {
    return {
      serverUrl: this.serverUrl,
      rootFolderName: this.rootFolderName
    }
  }

  /**
   * Updates server URL or root folder name when not null
   * @param serverUrl - the URL of the server.
   * @param rootFolderName - the name for rootFolderName.
   */
  public setConfig(serverUrl: string, rootFolderName: string) {
    if (serverUrl) this.serverUrl = serverUrl
    if (rootFolderName) this.rootFolderName = rootFolderName
  }

  /**
   * Returns all available compute contexts on this server.
   * @param accessToken - an access token for an authorized user.
   */
  public async getAllContexts(accessToken?: string) {
    const headers: any = {
      'Content-Type': 'application/json'
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const { result: contexts } = await this.request<{ items: Context[] }>(
      `${this.serverUrl}/compute/contexts?limit=10000`,
      { headers }
    )

    const contextsList = contexts && contexts.items ? contexts.items : []

    return contextsList.map((context: any) => ({
      createdBy: context.createdBy,
      id: context.id,
      name: context.name,
      version: context.version,
      attributes: {}
    }))
  }

  /**
   * Returns all compute contexts on this server that the user has access to.
   * @param accessToken - an access token for an authorized user.
   */
  public async getExecutableContexts(accessToken?: string) {
    const headers: any = {
      'Content-Type': 'application/json'
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const { result: contexts } = await this.request<{ items: Context[] }>(
      `${this.serverUrl}/compute/contexts?limit=10000`,
      { headers }
    ).catch((err) => {
      throw new Error(err)
    })

    const contextsList = contexts.items || []
    const executableContexts: any[] = []

    const promises = contextsList.map((context: any) => {
      const linesOfCode = ['%put &=sysuserid;']

      return this.executeScript(
        `test-${context.name}`,
        linesOfCode,
        context.name,
        accessToken,
        false,
        null,
        true
      ).catch(() => null)
    })

    const results = await Promise.all(promises)

    results.forEach((result: any, index: number) => {
      if (result) {
        let sysUserId = ''

        if (result.log) {
          const sysUserIdLog = result.log
            .split('\n')
            .find((line: string) => line.startsWith('SYSUSERID='))

          if (sysUserIdLog) {
            sysUserId = sysUserIdLog.replace('SYSUSERID=', '')
          }
        }

        executableContexts.push({
          createdBy: contextsList[index].createdBy,
          id: contextsList[index].id,
          name: contextsList[index].name,
          version: contextsList[index].version,
          attributes: {
            sysUserId
          }
        })
      }
    })

    return executableContexts
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

    const { result: contexts } = await this.request<{ items: Context[] }>(
      `${this.serverUrl}/compute/contexts`,
      { headers }
    )
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
    const { result: createdSession } = await this.request<Session>(
      `${this.serverUrl}/compute/contexts/${executionContext.id}/sessions`,
      createSessionRequest
    )

    return createdSession
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
    accessToken?: string
  ) {
    if (!contextName) {
      throw new Error('Missing context name.')
    }

    if (!launchContextName) {
      throw new Error('Missing launch context name.')
    }

    if (!sharedAccountId) {
      throw new Error('Missing shared account ID.')
    }

    const headers: any = {
      'Content-Type': 'application/json'
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const requestBody: any = {
      name: contextName,
      launchContext: {
        contextName: launchContextName
      },
      attributes: {
        reuseServerProcesses: true,
        runServerAs: sharedAccountId
      }
    }

    if (authorizedUsers && authorizedUsers.length) {
      requestBody['authorizedUsers'] = authorizedUsers
    } else {
      requestBody['authorizeAllAuthenticatedUsers'] = true
    }

    if (autoExecLines) {
      requestBody.environment = { autoExecLines }
    }

    const createContextRequest: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    }

    const { result: context } = await this.request<Context>(
      `${this.serverUrl}/compute/contexts`,
      createContextRequest
    )

    return context
  }

  /**
   * Updates a compute context on the given server.
   * @param contextName - the original name of the context to be updated.
   * @param editedContext - an object with the properties to be updated.
   * @param accessToken - an access token for an authorized user.
   */
  public async editContext(
    contextName: string,
    editedContext: EditContextInput,
    accessToken?: string
  ) {
    if (!contextName) {
      throw new Error('Invalid context name.')
    }

    const headers: any = {
      'Content-Type': 'application/json'
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const originalContext = await this.getContextByName(
      contextName,
      accessToken
    )

    const { result: context, etag } = await this.request<Context>(
      `${this.serverUrl}/compute/contexts/${originalContext.id}`,
      {
        headers
      }
    ).catch((e) => {
      console.error(e)

      if (e && e.status === 404) {
        throw new Error(
          `The context ${contextName} was not found on this server.`
        )
      }
      throw new Error(
        `An error occurred when fetching the context ${contextName}`
      )
    })

    // An If-Match header with the value of the last ETag for the context
    // is required to be able to update it
    // https://developer.sas.com/apis/rest/Compute/#update-a-context-definition
    headers['If-Match'] = etag

    const updateContextRequest: RequestInit = {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        ...context,
        ...editedContext,
        attributes: { ...context.attributes, ...editedContext.attributes }
      })
    }

    return await this.request<Context>(
      `${this.serverUrl}/compute/contexts/${context.id}`,
      updateContextRequest
    )
  }

  /**
   * Deletes a compute context on the given server.
   * @param contextName - the name of the context to be deleted.
   * @param accessToken - an access token for an authorized user.
   */
  public async deleteContext(contextName: string, accessToken?: string) {
    if (!contextName) {
      throw new Error('Invalid context Name.')
    }

    const headers: any = {
      'Content-Type': 'application/json'
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const context = await this.getContextByName(contextName, accessToken)

    const deleteContextRequest: RequestInit = {
      method: 'DELETE',
      headers
    }

    return await this.request<Context>(
      `${this.serverUrl}/compute/contexts/${context.id}`,
      deleteContextRequest
    )
  }

  /**
   * Executes code on the current SAS Viya server.
   * @param fileName - a name for the file being submitted for execution.
   * @param linesOfCode - an array of lines of code to execute.
   * @param contextName - the context to execute the code in.
   * @param accessToken - an access token for an authorized user.
   * @param sessionId - optional session ID to reuse.
   * @param silent - optional flag to turn of logging.
   * @param data - execution data.
   * @param debug - flag taht indicates debug mode.
   * @param expectWebout - flag that indicates that web output is expected
   */
  public async executeScript(
    jobName: string,
    linesOfCode: string[],
    contextName: string,
    accessToken?: string,
    silent = false,
    data = null,
    debug = false,
    expectWebout = false
  ): Promise<any> {
    silent = !debug
    try {
      const headers: any = {
        'Content-Type': 'application/json'
      }

      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`
      }

      let executionSessionId: string
      const session = await this.sessionManager.getSession(accessToken)
      executionSessionId = session!.id

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

      const fileName = `exec-${
        jobName.includes('/') ? jobName.split('/')[1] : jobName
      }`

      let jobVariables: any = {
        SYS_JES_JOB_URI: '',
        _program: this.rootFolderName + '/' + jobName
      }

      let files: any[] = []

      if (data) {
        if (JSON.stringify(data).includes(';')) {
          files = await this.uploadTables(data, accessToken)

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
      const postJobRequest = {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: fileName,
          description: 'Powered by SASjs',
          code: linesOfCode,
          variables: jobVariables,
          arguments: jobArguments
        })
      }

      const { result: postedJob, etag } = await this.request<Job>(
        `${this.serverUrl}/compute/sessions/${executionSessionId}/jobs`,
        postJobRequest
      )

      if (!silent) {
        console.log(`Job has been submitted for ${fileName}`)
        console.log(
          `You can monitor the job progress at ${this.serverUrl}${
            postedJob.links.find((l: any) => l.rel === 'state')!.href
          }`
        )
      }

      const jobStatus = await this.pollJobState(
        postedJob,
        etag,
        accessToken,
        silent
      )

      const { result: currentJob } = await this.request<Job>(
        `${this.serverUrl}/compute/sessions/${executionSessionId}/jobs/${postedJob.id}`,
        { headers }
      )

      let jobResult
      let log

      const logLink = currentJob.links.find((l) => l.rel === 'log')

      if (debug && logLink) {
        log = await this.request<any>(
          `${this.serverUrl}${logLink.href}/content?limit=10000`,
          {
            headers
          }
        ).then((res: any) =>
          res.result.items.map((i: any) => i.line).join('\n')
        )
      }

      if (jobStatus === 'failed' || jobStatus === 'error') {
        return Promise.reject({ error: currentJob.error, log })
      }

      let resultLink

      if (expectWebout) {
        resultLink = `/compute/sessions/${executionSessionId}/filerefs/_webout/content`
      }

      if (resultLink) {
        jobResult = await this.request<any>(
          `${this.serverUrl}${resultLink}`,
          { headers },
          'text'
        ).catch((e) => ({
          result: JSON.stringify(e)
        }))
      }

      await this.sessionManager.clearSession(executionSessionId, accessToken)

      return { result: jobResult?.result, log }
    } catch (e) {
      if (e && e.status === 404) {
        return this.executeScript(
          jobName,
          linesOfCode,
          contextName,
          accessToken,
          silent,
          data,
          debug
        )
      } else {
        throw e
      }
    }
  }

  /**
   * Creates a folder in the specified location.  Either parentFolderPath or
   *   parentFolderUri must be provided.
   * @param folderName - the name of the new folder.
   * @param parentFolderPath - the full path to the parent folder.  If not
   *  provided, the parentFolderUri must be provided.
   * @param parentFolderUri - the URI (eg /folders/folders/UUID) of the parent
   *  folder.  If not provided, the parentFolderPath must be provided.
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
      throw new Error('Parent folder path or uri is required')
    }

    if (!parentFolderUri && parentFolderPath) {
      parentFolderUri = await this.getFolderUri(parentFolderPath, accessToken)
      if (!parentFolderUri) {
        if (isForced) this.isForceDeploy = true

        console.log(`Parent folder is not present: ${parentFolderPath}`)

        const newParentFolderPath = parentFolderPath.substring(
          0,
          parentFolderPath.lastIndexOf('/')
        )
        const newFolderName = `${parentFolderPath.split('/').pop()}`
        if (newParentFolderPath === '') {
          throw new Error('Root Folder should have been present on server')
        }
        console.log(
          `Creating Parent Folder:\n${newFolderName} in ${newParentFolderPath}`
        )
        const parentFolder = await this.createFolder(
          newFolderName,
          newParentFolderPath,
          undefined,
          accessToken
        )
        console.log(`Parent Folder "${newFolderName}" successfully created.`)
        parentFolderUri = `/folders/folders/${parentFolder.id}`
      } else if (isForced && accessToken && !this.isForceDeploy) {
        this.isForceDeploy = true

        await this.deleteFolder(parentFolderPath, accessToken)

        const newParentFolderPath = parentFolderPath.substring(
          0,
          parentFolderPath.lastIndexOf('/')
        )
        const newFolderName = `${parentFolderPath.split('/').pop()}`

        if (newParentFolderPath === '') {
          throw new Error('Root Folder should have been present on server')
        }

        console.log(
          `Creating Parent Folder:\n${newFolderName} in ${newParentFolderPath}`
        )

        const parentFolder = await this.createFolder(
          newFolderName,
          newParentFolderPath,
          undefined,
          accessToken
        )

        console.log(`Parent Folder "${newFolderName}" successfully created.`)

        parentFolderUri = `/folders/folders/${parentFolder.id}`
      }
    }

    const createFolderRequest: RequestInit = {
      method: 'POST',
      body: JSON.stringify({
        name: folderName,
        type: 'folder'
      })
    }

    createFolderRequest.headers = { 'Content-Type': 'application/json' }
    if (accessToken) {
      createFolderRequest.headers.Authorization = `Bearer ${accessToken}`
    }

    const { result: createFolderResponse } = await this.request<Folder>(
      `${this.serverUrl}/folders/folders?parentFolderUri=${parentFolderUri}`,
      createFolderRequest
    )

    // update rootFolderMap with newly created folder.
    await this.populateRootFolderMap(accessToken)
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
      throw new Error(
        'Either parentFolderPath or parentFolderUri must be provided'
      )
    }

    if (!parentFolderUri && parentFolderPath) {
      parentFolderUri = await this.getFolderUri(parentFolderPath, accessToken)
    }

    const createJobDefinitionRequest: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.sas.job.definition+json',
        Accept: 'application/vnd.sas.job.definition+json'
      },
      body: JSON.stringify({
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
      })
    }

    if (accessToken) {
      createJobDefinitionRequest!.headers = {
        ...createJobDefinitionRequest.headers,
        Authorization: `Bearer ${accessToken}`
      }
    }

    return await this.request<Job>(
      `${this.serverUrl}/jobDefinitions/definitions?parentFolderUri=${parentFolderUri}`,
      createJobDefinitionRequest
    )
  }

  /**
   * Performs a login redirect and returns an auth code for the given client
   * @param clientId - the client ID to authenticate with.
   */
  public async getAuthCode(clientId: string) {
    const authUrl = `${this.serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`

    const authCode = await fetch(authUrl, {
      referrerPolicy: 'same-origin',
      credentials: 'include'
    })
      .then((response) => response.text())
      .then(async (response) => {
        let code = ''
        if (isAuthorizeFormRequired(response)) {
          const formResponse: any = await parseAndSubmitAuthorizeForm(
            response,
            this.serverUrl
          )

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
      formData.append('grant_type', 'authorization_code')
      formData.append('code', authCode)
    } else {
      formData = new FormData()
      formData.append('grant_type', 'authorization_code')
      formData.append('code', authCode)
    }

    const authResponse = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData as any,
      referrerPolicy: 'same-origin'
    }).then((res) => res.json())

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

    const authResponse = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData as any,
      referrerPolicy: 'same-origin'
    }).then((res) => res.json())

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
    const deleteResponse = await this.request(url, {
      method: 'DELETE',
      credentials: 'include',
      headers
    })

    return deleteResponse
  }

  /**
   * Executes a job via the SAS Viya Compute API
   * @param sasJob - the relative path to the job.
   * @param contextName - the name of the context where the job is to be executed.
   * @param debug - sets the _debug flag in the job arguments.
   * @param data - any data to be passed in as input to the job.
   * @param accessToken - an optional access token for an authorized user.
   */
  public async executeComputeJob(
    sasJob: string,
    contextName: string,
    debug: boolean,
    data?: any,
    accessToken?: string
  ) {
    if (!this.rootFolder) {
      await this.populateRootFolder(accessToken)
    }
    if (!this.rootFolder) {
      console.error('Root folder was not found')
      throw new Error('Root folder was not found')
    }
    if (!this.rootFolderMap.size) {
      await this.populateRootFolderMap(accessToken)
    }
    if (!this.rootFolderMap.size) {
      console.error(`The job ${sasJob} was not found in ${this.rootFolderName}`)
      throw new Error(
        `The job ${sasJob} was not found in ${this.rootFolderName}`
      )
    }

    const headers: any = { 'Content-Type': 'application/json' }
    if (!!accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const folderName = sasJob.split('/')[0]
    const jobName = sasJob.split('/')[1]
    const jobFolder = this.rootFolderMap.get(folderName)
    const jobToExecute = jobFolder?.find((item) => item.name === jobName)

    if (!jobToExecute) {
      throw new Error('Job was not found.')
    }

    let code = jobToExecute?.code

    if (!code) {
      const jobDefinitionLink = jobToExecute?.links.find(
        (l) => l.rel === 'getResource'
      )

      if (!jobDefinitionLink) {
        console.error('Job definition URI was not found.')
        throw new Error('Job definition URI was not found.')
      }

      const { result: jobDefinition } = await this.request<JobDefinition>(
        `${this.serverUrl}${jobDefinitionLink.href}`,
        { headers }
      )

      code = jobDefinition.code

      // Add code to existing job definition
      jobToExecute.code = code
    }

    const linesToExecute = code.replace(/\r\n/g, '\n').split('\n')
    return await this.executeScript(
      sasJob,
      linesToExecute,
      contextName,
      accessToken,
      true,
      data,
      debug,
      true
    )
  }

  /**
   * Executes a job via the SAS Viya Job Execution API
   * @param sasJob - the relative path to the job.
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
    if (!this.rootFolder) {
      await this.populateRootFolder(accessToken)
    }

    if (!this.rootFolder) {
      throw new Error('Root folder was not found')
    }
    if (!this.rootFolderMap.size) {
      await this.populateRootFolderMap(accessToken)
    }
    if (!this.rootFolderMap.size) {
      throw new Error(
        `The job ${sasJob} was not found in ${this.rootFolderName}`
      )
    }

    let files: any[] = []
    if (data && Object.keys(data).length) {
      files = await this.uploadTables(data, accessToken)
    }

    const jobName = path.basename(sasJob)
    const jobFolder = sasJob.replace(`/${jobName}`, '')
    const allJobsInFolder = this.rootFolderMap.get(jobFolder.replace('/', ''))

    if (allJobsInFolder) {
      const jobSpec = allJobsInFolder.find((j: Job) => j.name === jobName)
      const jobDefinitionLink = jobSpec?.links.find(
        (l) => l.rel === 'getResource'
      )?.href
      const requestInfo: any = {
        method: 'GET'
      }
      const headers: any = { 'Content-Type': 'application/json' }

      if (!!accessToken) {
        headers.Authorization = `Bearer ${accessToken}`
      }

      requestInfo.headers = headers

      const { result: jobDefinition } = await this.request<Job>(
        `${this.serverUrl}${jobDefinitionLink}`,
        requestInfo
      )

      const jobArguments: { [key: string]: any } = {
        _contextName: contextName,
        _program: `${this.rootFolderName}/${sasJob}`,
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

      const postJobRequest = {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: `exec-${jobName}`,
          description: 'Powered by SASjs',
          jobDefinition,
          arguments: jobArguments
        })
      }
      const { result: postedJob, etag } = await this.request<Job>(
        `${this.serverUrl}/jobExecution/jobs?_action=wait`,
        postJobRequest
      )
      const jobStatus = await this.pollJobState(
        postedJob,
        etag,
        accessToken,
        true
      )
      const { result: currentJob } = await this.request<Job>(
        `${this.serverUrl}/jobExecution/jobs/${postedJob.id}`,
        { headers }
      )

      let jobResult, log
      if (jobStatus === 'failed') {
        return Promise.reject(currentJob.error)
      }
      const resultLink = currentJob.results['_webout.json']
      const logLink = currentJob.links.find((l) => l.rel === 'log')
      if (resultLink) {
        jobResult = await this.request<any>(
          `${this.serverUrl}${resultLink}/content`,
          { headers },
          'text'
        )
      }
      if (debug && logLink) {
        log = await this.request<any>(
          `${this.serverUrl}${logLink.href}/content`,
          {
            headers
          }
        ).then((res: any) =>
          res.result.items.map((i: any) => i.line).join('\n')
        )
      }
      return { result: jobResult?.result, log }
    } else {
      throw new Error(
        `The job ${sasJob} was not found at the location ${this.rootFolderName}`
      )
    }
  }

  private async populateRootFolderMap(accessToken?: string) {
    const allItems = new Map<string, Job[]>()
    const url = '/folders/folders/@item?path=' + this.rootFolderName
    const requestInfo: any = {
      method: 'GET'
    }
    if (accessToken) {
      requestInfo.headers = { Authorization: `Bearer ${accessToken}` }
    }
    const { result: folder } = await this.request<Folder>(
      `${this.serverUrl}${url}`,
      requestInfo
    )
    if (!folder) {
      throw new Error('Cannot populate RootFolderMap unless rootFolder exists')
    }
    const { result: members } = await this.request<{ items: any[] }>(
      `${this.serverUrl}/folders/folders/${folder.id}/members`,
      requestInfo
    )

    const itemsAtRoot = members.items
    allItems.set('', itemsAtRoot)
    const subfolderRequests = members.items
      .filter((i: any) => i.contentType === 'folder')
      .map(async (member: any) => {
        const subFolderUrl =
          '/folders/folders/@item?path=' +
          this.rootFolderName +
          '/' +
          member.name
        const { result: memberDetail } = await this.request<Folder>(
          `${this.serverUrl}${subFolderUrl}`,
          requestInfo
        )

        const membersLink = memberDetail.links.find(
          (l: any) => l.rel === 'members'
        )

        const { result: memberContents } = await this.request<{ items: any[] }>(
          `${this.serverUrl}${membersLink!.href}`,
          requestInfo
        )
        const itemsInFolder = memberContents.items as any[]
        allItems.set(member.name, itemsInFolder)
        return itemsInFolder
      })
    await Promise.all(subfolderRequests)

    this.rootFolderMap = allItems
  }

  private async populateRootFolder(accessToken?: string) {
    const url = '/folders/folders/@item?path=' + this.rootFolderName
    const requestInfo: RequestInit = {
      method: 'GET'
    }
    if (accessToken) {
      requestInfo.headers = { Authorization: `Bearer ${accessToken}` }
    }
    let error
    const rootFolder = await this.request<Folder>(
      `${this.serverUrl}${url}`,
      requestInfo
    )

    this.rootFolder = rootFolder?.result || null
    if (error) {
      throw new Error(JSON.stringify(error))
    }
  }

  private async pollJobState(
    postedJob: any,
    etag: string | null,
    accessToken?: string,
    silent = false
  ) {
    const MAX_POLL_COUNT = 1000
    const POLL_INTERVAL = 100
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
      Promise.reject('Job state link was not found.')
    }

    const { result: state } = await this.request<string>(
      `${this.serverUrl}${stateLink.href}?_action=wait&wait=30`,
      {
        headers
      },
      'text'
    )

    const currentState = state.trim()
    if (currentState === 'completed') {
      return Promise.resolve(currentState)
    }

    return new Promise(async (resolve, _) => {
      const interval = setInterval(async () => {
        if (
          postedJobState === 'running' ||
          postedJobState === '' ||
          postedJobState === 'pending'
        ) {
          if (stateLink) {
            if (!silent) {
              console.log('Polling job status... \n')
            }
            const { result: jobState } = await this.request<string>(
              `${this.serverUrl}${stateLink.href}?_action=wait&wait=30`,
              {
                headers
              },
              'text'
            )

            postedJobState = jobState.trim()
            if (!silent) {
              console.log(`Current state: ${postedJobState}\n`)
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

  private async waitForSession(
    session: Session,
    etag: string | null,
    accessToken?: string,
    silent = false
  ) {
    let sessionState = session.state
    let pollCount = 0
    const headers: any = {
      'Content-Type': 'application/json',
      'If-None-Match': etag
    }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }
    const stateLink = session.links.find((l: any) => l.rel === 'state')
    return new Promise(async (resolve, _) => {
      if (sessionState === 'pending') {
        if (stateLink) {
          if (!silent) {
            console.log('Polling session status... \n')
          }
          const { result: state } = await this.request<string>(
            `${this.serverUrl}${stateLink.href}?wait=30`,
            {
              headers
            },
            'text'
          )

          sessionState = state.trim()
          if (!silent) {
            console.log(`Current state: ${sessionState}\n`)
          }
          pollCount++
          resolve(sessionState)
        }
      } else {
        resolve(sessionState)
      }
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

      const createFileRequest = {
        method: 'POST',
        body: csv,
        headers
      }

      const uploadResponse = await this.request<any>(
        `${this.serverUrl}/files/files#rawUpload`,
        createFileRequest
      )

      uploadedFiles.push({ tableName, file: uploadResponse.result })
    }
    return uploadedFiles
  }

  private async getFolderUri(folderPath: string, accessToken?: string) {
    const url = '/folders/folders/@item?path=' + folderPath
    const requestInfo: any = {
      method: 'GET'
    }
    if (accessToken) {
      requestInfo.headers = { Authorization: `Bearer ${accessToken}` }
    }
    const { result: folder } = await this.request<Folder>(
      `${this.serverUrl}${url}`,
      requestInfo
    ).catch((err) => {
      return { result: null }
    })

    if (!folder) return undefined
    return `/folders/folders/${folder.id}`
  }

  private async getRecycleBinUri(accessToken: string) {
    const url = '/folders/folders/@myRecycleBin'
    const requestInfo = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken
      }
    }

    const { result: folder } = await this.request<Folder>(
      `${this.serverUrl}${url}`,
      requestInfo
    ).catch((err) => {
      return { result: null }
    })

    if (!folder) return undefined

    return `/folders/folders/${folder.id}`
  }

  private async getContextByName(
    contextName: string,
    accessToken?: string
  ): Promise<Context> {
    const headers: any = {
      'Content-Type': 'application/json'
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const { result: contexts } = await this.request<{ items: Context[] }>(
      `${this.serverUrl}/compute/contexts?filter=eq(name, "${contextName}")`,
      { headers }
    ).catch((e) => {
      console.error(e)

      throw new Error(
        `An error occurred when fetching the context with ID ${contextName}`
      )
    })

    if (!contexts || !(contexts.items && contexts.items.length)) {
      throw new Error(
        `The context ${contextName} was not found on ${this.serverUrl}.`
      )
    }

    return contexts.items[0]
  }

  /**
   * Moves a Viya folder to a new location.  The folder may be renamed at the same time.
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
    // checks if 'sourceFolder' is already a URI
    const sourceFolderUri = isUri(sourceFolder)
      ? sourceFolder
      : await this.getFolderUri(sourceFolder, accessToken)

    // checks if 'targetParentFolder' is already a URI
    const targetParentFolderUri = isUri(targetParentFolder)
      ? targetParentFolder
      : await this.getFolderUri(targetParentFolder, accessToken)

    const sourceFolderId = sourceFolderUri?.split('/').pop()
    const url = sourceFolderUri

    const requestInfo = {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + accessToken
      },
      body: JSON.stringify({
        id: sourceFolderId,
        name: targetFolderName,
        parentFolderUri: targetParentFolderUri
      })
    }

    const { result: folder } = await this.request<Folder>(
      `${this.serverUrl}${url}`,
      requestInfo
    ).catch((err) => {
      throw err
    })

    if (!folder) return undefined

    return folder
  }

  /**
   * For performance (and in case of accidental error) the `deleteFolder` function does not actually delete the folder (and all it's content and subfolder content). Instead the folder is simply moved to the recycle bin. Deletion time will be added to the folder name.
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

  setCsrfTokenLocal = (csrfToken: CsrfToken) => {
    this.csrfToken = csrfToken
    this.setCsrfToken(csrfToken)
  }

  private async request<T>(
    url: string,
    options: RequestInit,
    contentType: 'text' | 'json' = 'json'
  ) {
    if (this.csrfToken) {
      options.headers = {
        ...options.headers,
        [this.csrfToken.headerName]: this.csrfToken.value
      }
    }
    return await makeRequest<T>(
      url,
      options,
      this.setCsrfTokenLocal,
      contentType
    )
  }
}
