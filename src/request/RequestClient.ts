import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import * as https from 'https'
import { CsrfToken } from '..'
import { isAuthorizeFormRequired, isLogInRequired } from '../auth'
import {
  AuthorizeError,
  LoginRequiredError,
  NotFoundError,
  InternalServerError,
  JobExecutionError,
  CertificateError
} from '../types/errors'
import { VerboseMode } from '../types'
import { parseWeboutResponse } from '../utils/parseWeboutResponse'
import { prefixMessage } from '@sasjs/utils/error'
import { SAS9AuthError } from '../types/errors/SAS9AuthError'
import {
  parseGeneratedCode,
  parseSourceCode,
  createAxiosInstance
} from '../utils'
import { InvalidSASjsCsrfError } from '../types/errors/InvalidSASjsCsrfError'
import { inspect } from 'util'

export interface HttpClient {
  get<T>(
    url: string,
    accessToken: string | undefined,
    contentType: string,
    overrideHeaders: { [key: string]: string | number }
  ): Promise<{ result: T; etag: string }>

  post<T>(
    url: string,
    data: any,
    accessToken: string | undefined,
    contentType: string,
    overrideHeaders: { [key: string]: string | number }
  ): Promise<{ result: T; etag: string }>

  put<T>(
    url: string,
    data: any,
    accessToken: string | undefined,
    overrideHeaders: { [key: string]: string | number }
  ): Promise<{ result: T; etag: string }>

  delete<T>(
    url: string,
    accessToken: string | undefined
  ): Promise<{ result: T; etag: string }>

  getCsrfToken(type: 'general' | 'file'): CsrfToken | undefined
  saveLocalStorageToken(accessToken: string, refreshToken: string): void
  clearCsrfTokens(): void
  clearLocalStorageTokens(): void
  getBaseUrl(): string
}

export class RequestClient implements HttpClient {
  private requests: SASjsRequest[] = []
  private requestsLimit: number = 10
  private httpInterceptor?: number
  private verboseMode: VerboseMode = false

  protected csrfToken: CsrfToken = { headerName: '', value: '' }
  protected fileUploadCsrfToken: CsrfToken | undefined
  protected httpClient!: AxiosInstance

  constructor(
    protected baseUrl: string,
    httpsAgentOptions?: https.AgentOptions,
    requestsLimit?: number,
    verboseMode?: VerboseMode
  ) {
    this.createHttpClient(baseUrl, httpsAgentOptions)

    if (requestsLimit) this.requestsLimit = requestsLimit

    if (verboseMode) {
      this.setVerboseMode(verboseMode)
      this.enableVerboseMode()
    }
  }

  public setConfig(baseUrl: string, httpsAgentOptions?: https.AgentOptions) {
    this.createHttpClient(baseUrl, httpsAgentOptions)
  }

  public saveLocalStorageToken(accessToken: string, refreshToken: string) {
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
  }

  public getCsrfToken(type: 'general' | 'file' = 'general') {
    return type === 'file' ? this.fileUploadCsrfToken : this.csrfToken
  }

  public clearCsrfTokens() {
    this.csrfToken = { headerName: '', value: '' }
    this.fileUploadCsrfToken = { headerName: '', value: '' }
  }
  public clearLocalStorageTokens() {
    localStorage.setItem('accessToken', '')
    localStorage.setItem('refreshToken', '')
  }

  public getBaseUrl() {
    return this.httpClient.defaults.baseURL || ''
  }

  /**
   * this method returns all requests, an array of SASjsRequest type
   * @returns SASjsRequest[]
   */
  public getRequests = () => this.requests

  /**
   * this method clears the requests array, i.e set to empty
   */
  public clearRequests = () => {
    this.requests = []
  }

  /**
   * this method appends the response from sasjs request to requests array
   * @param response - response from sasjs request
   * @param program - name of program
   * @param debug - a boolean that indicates whether debug was enabled or not
   */
  public appendRequest(response: any, program: string, debug: boolean) {
    let sourceCode = ''
    let generatedCode = ''
    let sasWork = null

    if (debug) {
      if (response?.log) {
        sourceCode = parseSourceCode(response.log)
        generatedCode = parseGeneratedCode(response.log)

        if (response?.result) {
          sasWork = response.result.WORK
        } else {
          sasWork = response.log
        }
      } else if (response?.result) {
        // We parse only if it's a string, otherwise it would throw error
        if (typeof response.result === 'string') {
          sourceCode = parseSourceCode(response.result)
          generatedCode = parseGeneratedCode(response.result)
        }

        sasWork = response.result.WORK
      }
    }

    const stringifiedResult =
      typeof response?.result === 'string'
        ? response?.result
        : JSON.stringify(response?.result, null, 2)

    this.requests.push({
      logFile: response?.log || stringifiedResult || response,
      serviceLink: program,
      timestamp: new Date(),
      sourceCode,
      generatedCode,
      SASWORK: sasWork
    })

    if (this.requests.length > this.requestsLimit) {
      this.requests.splice(0, 1)
    }
  }

  public async get<T>(
    url: string,
    accessToken: string | undefined,
    contentType: string = 'application/json',
    overrideHeaders: { [key: string]: string | number } = {},
    debug: boolean = false
  ): Promise<{ result: T; etag: string; status: number }> {
    const headers = {
      ...this.getHeaders(accessToken, contentType),
      ...overrideHeaders
    }

    const requestConfig: AxiosRequestConfig = {
      headers,
      responseType: contentType === 'text/plain' ? 'text' : 'json',
      withCredentials: true
    }

    if (contentType === 'text/plain') {
      requestConfig.transformResponse = undefined
    }

    return this.httpClient
      .get<T>(url, requestConfig)
      .then((response) => {
        throwIfError(response)

        return this.parseResponse<T>(response)
      })
      .catch(async (e: any) => {
        return await this.handleError(
          e,
          () =>
            this.get<T>(url, accessToken, contentType, overrideHeaders).catch(
              (err) => {
                throw prefixMessage(
                  err,
                  'Error while executing handle error callback. '
                )
              }
            ),
          debug
        )
      })
  }

  public async post<T>(
    url: string,
    data: any,
    accessToken: string | undefined,
    contentType = 'application/json',
    overrideHeaders: { [key: string]: string | number } = {},
    additionalSettings: { [key: string]: string | number } = {}
  ): Promise<{ result: T; etag: string }> {
    const headers = {
      ...this.getHeaders(accessToken, contentType),
      ...overrideHeaders
    }

    return this.httpClient
      .post<T>(url, data, {
        headers,
        withCredentials: true,
        ...additionalSettings
      })
      .then((response) => {
        throwIfError(response)

        return this.parseResponse<T>(response)
      })
      .catch(async (e: any) => {
        return await this.handleError(e, () =>
          this.post<T>(url, data, accessToken, contentType, overrideHeaders)
        )
      })
  }

  public async put<T>(
    url: string,
    data: any,
    accessToken: string | undefined,
    overrideHeaders: { [key: string]: string | number } = {}
  ): Promise<{ result: T; etag: string }> {
    const headers = {
      ...this.getHeaders(accessToken, 'application/json'),
      ...overrideHeaders
    }

    return this.httpClient
      .put<T>(url, data, { headers, withCredentials: true })
      .then((response) => {
        throwIfError(response)
        return this.parseResponse<T>(response)
      })
      .catch(async (e: any) => {
        return await this.handleError(e, () =>
          this.put<T>(url, data, accessToken, overrideHeaders)
        )
      })
  }

  public async delete<T>(
    url: string,
    accessToken?: string
  ): Promise<{ result: T; etag: string }> {
    const headers = this.getHeaders(accessToken, 'application/json')

    return this.httpClient
      .delete<T>(url, { headers, withCredentials: true })
      .then((response) => {
        throwIfError(response)
        return this.parseResponse<T>(response)
      })
      .catch(async (e: any) => {
        return await this.handleError(e, () => this.delete<T>(url, accessToken))
      })
  }

  public async patch<T>(
    url: string,
    data: any = {},
    accessToken?: string
  ): Promise<{ result: T; etag: string }> {
    const headers = this.getHeaders(accessToken, 'application/json')

    return this.httpClient
      .patch<T>(url, data, { headers, withCredentials: true })
      .then((response) => {
        throwIfError(response)
        return this.parseResponse<T>(response)
      })
      .catch(async (e: any) => {
        return await this.handleError(e, () =>
          this.patch<T>(url, data, accessToken)
        )
      })
  }

  public async uploadFile(
    url: string,
    content: string,
    accessToken?: string
  ): Promise<any> {
    const headers = this.getHeaders(accessToken, 'application/json')

    if (this.fileUploadCsrfToken?.value) {
      headers[this.fileUploadCsrfToken.headerName] =
        this.fileUploadCsrfToken.value
    }

    try {
      const response = await this.httpClient.post(url, content, {
        headers,
        transformRequest: (requestBody) => requestBody
      })

      return {
        result: response.data,
        etag: response.headers['etag'] as string
      }
    } catch (e: any) {
      const response = e.response as AxiosResponse
      if (response?.status === 403 || response?.status === 449) {
        this.parseAndSetFileUploadCsrfToken(response)

        if (this.fileUploadCsrfToken) {
          return this.uploadFile(url, content, accessToken)
        }
        throw e
      }
      throw e
    }
  }

  public authorize = async (response: string) => {
    let authUrl: string | null = null
    const params: any = {}

    const responseBody = response.split('<body>')[1].split('</body>')[0]
    const bodyElement = document.createElement('div')
    bodyElement.innerHTML = responseBody

    const form = bodyElement.querySelector('#application_authorization')
    authUrl = form ? this.baseUrl + form.getAttribute('action') : null

    const inputs: any = form?.querySelectorAll('input')

    for (const input of inputs) {
      if (input.name === 'user_oauth_approval') {
        input.value = 'true'
      }

      params[input.name] = input.value
    }

    const csrfTokenKey = Object.keys(params).find((k) =>
      k?.toLowerCase().includes('csrf')
    )
    if (csrfTokenKey) {
      this.csrfToken.value = params[csrfTokenKey]
      this.csrfToken.headerName = this.csrfToken.headerName || 'x-csrf-token'
    }

    const formData = new FormData()

    for (const key in params) {
      if (params.hasOwnProperty(key)) {
        formData.append(key, params[key])
      }
    }

    if (!authUrl) {
      throw new Error('Auth Form URL is null or undefined.')
    }

    return await this.httpClient
      .post(authUrl, formData, {
        responseType: 'text',
        headers: { Accept: '*/*', 'Content-Type': 'text/plain' }
      })
      .then((res) => res.data)
      .catch((error) => {
        const logger = process.logger || console
        logger.error(error)
      })
  }

  /**
   * Adds colors to the string.
   * If verboseMode is set to 'bleached', colors should be disabled
   * @param str - string to be prettified.
   * @returns - prettified string
   */
  private prettifyString = (str: any) =>
    inspect(str, { colors: this.verboseMode !== 'bleached' })

  /**
   * Formats HTTP request/response body.
   * @param body - HTTP request/response body.
   * @returns - formatted string.
   */
  private parseInterceptedBody = (body: any) => {
    if (!body) return ''

    let parsedBody

    // Tries to parse body into JSON object.
    if (typeof body === 'string') {
      try {
        parsedBody = JSON.parse(body)
      } catch (error) {
        parsedBody = body
      }
    } else {
      parsedBody = body
    }

    const bodyLines = this.prettifyString(parsedBody).split('\n')

    // Leaves first 50 lines
    if (bodyLines.length > 51) {
      bodyLines.splice(50)
      bodyLines.push('...')
    }

    return bodyLines.join('\n')
  }

  private defaultInterceptionCallBack = (response: AxiosResponse) => {
    const { status, config, request, data: resData } = response
    const { data: reqData } = config
    const { _header: reqHeaders, res } = request
    const { rawHeaders } = res

    // Converts an array of strings into a single string with the following format:
    // <headerName>: <headerValue>
    const resHeaders = rawHeaders.reduce(
      (acc: string, value: string, i: number) => {
        if (i % 2 === 0) {
          acc += `${i === 0 ? '' : '\n'}${value}`
        } else {
          acc += `: ${value}`
        }

        return acc
      },
      ''
    )

    const parsedResBody = this.parseInterceptedBody(resData)

    // HTTP response summary.
    process.logger?.info(`HTTP Request (first 50 lines):
${reqHeaders}${this.parseInterceptedBody(reqData)}

HTTP Response Code: ${this.prettifyString(status)}

HTTP Response (first 50 lines):
${resHeaders}${parsedResBody ? `\n\n${parsedResBody}` : ''}
`)

    return response
  }

  /**
   * Sets verbose mode.
   * @param verboseMode - value of the verbose mode, can be true, false or bleached(without extra colors).
   */
  public setVerboseMode = (verboseMode: VerboseMode) => {
    this.verboseMode = verboseMode
  }

  /**
   * Turns on verbose mode to log every HTTP response.
   * @param successCallBack - function that should be triggered on every HTTP response with the status 2**.
   * @param errorCallBack - function that should be triggered on every HTTP response with the status different from 2**.
   */
  public enableVerboseMode = (
    successCallBack = this.defaultInterceptionCallBack,
    errorCallBack = this.defaultInterceptionCallBack
  ) => {
    this.httpInterceptor = this.httpClient.interceptors.response.use(
      successCallBack,
      errorCallBack
    )
  }

  /**
   * Turns off verbose mode to log every HTTP response.
   */
  public disableVerboseMode = () => {
    if (this.httpInterceptor) {
      this.httpClient.interceptors.response.eject(this.httpInterceptor)
    }
  }

  protected getHeaders = (
    accessToken: string | undefined,
    contentType: string
  ) => {
    const headers: any = {}

    if (contentType !== 'application/x-www-form-urlencoded') {
      headers['Content-Type'] = contentType
    }

    if (contentType === 'application/json') {
      headers.Accept = 'application/json'
    } else {
      headers.Accept = '*/*'
    }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }
    if (this.csrfToken.headerName && this.csrfToken.value) {
      headers[this.csrfToken.headerName] = this.csrfToken.value
    }

    return headers
  }

  protected parseAndSetFileUploadCsrfToken = (response: AxiosResponse) => {
    const token = this.parseCsrfToken(response)

    if (token) {
      this.fileUploadCsrfToken = token
    }
  }

  protected parseAndSetCsrfToken = (response: AxiosResponse) => {
    const token = this.parseCsrfToken(response)

    if (token) {
      this.csrfToken = token
    }
  }

  private parseCsrfToken = (response: AxiosResponse): CsrfToken | undefined => {
    const tokenHeader = (
      response.headers['x-csrf-header'] as string
    )?.toLowerCase()

    if (tokenHeader) {
      const token = response.headers[tokenHeader]
      const csrfToken = {
        headerName: tokenHeader,
        value: token || ''
      }

      return csrfToken
    }
  }

  protected handleError = async (
    e: any,
    callback: any,
    debug: boolean = false
  ) => {
    const response = e.response as AxiosResponse

    if (e instanceof AuthorizeError) {
      const res = await this.httpClient
        .get(e.confirmUrl, {
          responseType: 'text',
          headers: { 'Content-Type': 'text/plain', Accept: '*/*' }
        })
        .catch((err) => {
          throw prefixMessage(err, 'Error while getting error confirmUrl. ')
        })

      if (isAuthorizeFormRequired(res?.data as string)) {
        await this.authorize(res.data as string).catch((err) => {
          throw prefixMessage(err, 'Error while authorizing request. ')
        })
      }

      return await callback().catch((err: any) => {
        throw prefixMessage(
          err,
          'Error while executing callback in handleError. '
        )
      })
    }

    if (e instanceof LoginRequiredError) {
      this.clearCsrfTokens()

      throw e
    }

    if (e instanceof InvalidSASjsCsrfError) {
      // Fetching root and creating CSRF cookie
      await this.httpClient
        .get('/', {
          withCredentials: true
        })
        .then((response) => {
          const cookie =
            /<script>document.cookie = '(XSRF-TOKEN=.*; Max-Age=86400; SameSite=Strict; Path=\/;)'<\/script>/.exec(
              response.data
            )?.[1]

          if (cookie) document.cookie = cookie
        })
        .catch((err) => {
          throw prefixMessage(err, 'Error while re-fetching CSRF token.')
        })

      return await callback().catch((err: any) => {
        throw prefixMessage(
          err,
          'Error while executing callback in handleError. '
        )
      })
    }

    if (response?.status === 403 || response?.status === 449) {
      this.parseAndSetCsrfToken(response)

      if (this.csrfToken.headerName && this.csrfToken.value) {
        return await callback().catch((err: any) => {
          throw prefixMessage(
            err,
            'Error while executing callback in handleError. '
          )
        })
      }

      throw e
    } else if (response?.status === 404) {
      throw new NotFoundError(response.config.url!)
    } else if (response?.status === 502) {
      if (debug) throw new InternalServerError()
      else return
    }

    if (e.isAxiosError && e.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      throw new CertificateError(e.message)
    }

    if (e.message) throw e
    else throw prefixMessage(e, 'Error while handling error. ')
  }

  protected parseResponse<T>(response: AxiosResponse<any>) {
    const etag = response?.headers ? response.headers['etag'] : ''
    let parsedResponse
    let includeSAS9Log: boolean = false

    try {
      if (typeof response.data === 'string') {
        parsedResponse = JSON.parse(response.data)
      } else {
        parsedResponse = response.data
      }
    } catch {
      try {
        parsedResponse = JSON.parse(parseWeboutResponse(response.data))
      } catch {
        parsedResponse = response.data
      }

      includeSAS9Log = true
    }

    let responseToReturn: {
      result: T
      etag: any
      log?: string
      status: number
    } = {
      result: parsedResponse as T,
      etag,
      status: response.status
    }

    if (includeSAS9Log) {
      responseToReturn.log = response.data
    }

    return responseToReturn
  }

  private createHttpClient(
    baseUrl: string,
    httpsAgentOptions?: https.AgentOptions
  ) {
    const httpsAgent = httpsAgentOptions
      ? new https.Agent(httpsAgentOptions)
      : undefined

    this.httpClient = createAxiosInstance(baseUrl, httpsAgent)

    this.httpClient.defaults.validateStatus = (status) => {
      return status >= 200 && status <= 401
    }
  }
}

export const throwIfError = (response: AxiosResponse) => {
  switch (response.status) {
    case 400:
      if (
        typeof response.data === 'object' &&
        response.data.error === 'invalid_grant'
      ) {
        // In SASVIYA when trying to get access token, if auth code is wrong status code will be 400 so in such case we return login required error.
        throw new LoginRequiredError(response.data)
      }

      if (
        typeof response.data === 'string' &&
        response.data.toLowerCase() === 'invalid csrf token!'
      ) {
        throw new InvalidSASjsCsrfError()
      }
      break
    case 401:
      if (typeof response.data === 'object') {
        throw new LoginRequiredError(response.data)
      } else {
        throw new LoginRequiredError()
      }
  }

  if (response.data?.entityID?.includes('login')) {
    throw new LoginRequiredError()
  }

  if (
    typeof response.data === 'string' &&
    isAuthorizeFormRequired(response.data)
  ) {
    throw new AuthorizeError(
      'Authorization required',
      response.request.responseURL
    )
  }

  if (
    typeof response.data === 'string' &&
    isLogInRequired(response.data) &&
    !response.config?.url?.includes('/SASLogon/login')
  ) {
    throw new LoginRequiredError()
  }
  if (response.data?.auth_request) {
    const authorizeRequestUrl = response.request.responseURL
    throw new AuthorizeError(response.data.message, authorizeRequestUrl)
  }

  if (response.config?.url?.includes('sasAuthError')) {
    throw new SAS9AuthError()
  }

  const error = parseError(response.data as string)

  if (error) {
    throw error
  }
}

const parseError = (data: string) => {
  if (!data) return null

  try {
    const responseJson = JSON.parse(data?.replace(/[\n\r]/g, ' '))
    if (responseJson.errorCode && responseJson.message) {
      return new JobExecutionError(
        responseJson.errorCode,
        responseJson.message,
        data?.replace(/[\n\r]/g, ' ')
      )
    }
  } catch (_) {}

  try {
    const hasError = data?.includes('{"errorCode')
    if (hasError) {
      const parts = data.split('{"errorCode')
      if (parts.length > 1) {
        const error = '{"errorCode' + parts[1].split('"}')[0] + '"}'
        const errorJson = JSON.parse(error.replace(/[\n\r]/g, ' '))
        return new JobExecutionError(
          errorJson.errorCode,
          errorJson.message,
          data?.replace(/[\n\r]/g, '\n')
        )
      }
    }
  } catch (_) {}

  try {
    const hasError = !!data?.match(/stored process not found: /i)
    if (hasError) {
      const parts = data.split(/stored process not found: /i)
      if (parts.length > 1) {
        const storedProcessPath = parts[1].split('<i>')[1].split('</i>')[0]
        const message = storedProcessPath.endsWith('runner')
          ? `SASJS runner not found. Here's the link (https://cli.sasjs.io/auth/#sasjs-runner) to the SAS code for registering the SASjs runner`
          : `Stored process not found: ${storedProcessPath}`
        return new JobExecutionError(500, message, '')
      }
    }
  } catch (_) {}

  try {
    // There are some edge cases in which the SAS mp_abort macro
    // (https://core.sasjs.io/mp__abort_8sas.html) is unable to
    // provide a clean exit.  In this case the JSON response will
    // be wrapped in >>weboutBEGIN<< and >>weboutEND<< strings.
    // Therefore, if the first string exists, we won't throw an
    // error just yet (the parser may yet throw one instead)
    const hasError =
      !data?.match(/>>weboutBEGIN<</) &&
      !!data?.match(/Stored Process Error/i) &&
      !!data?.match(/This request completed with errors./i)
    if (hasError) {
      const parts = data.split('<h2>SAS Log</h2>')
      if (parts.length > 1) {
        const log = parts[1].split('<pre>')[1].split('</pre>')[0]
        const message = `This request completed with errors.`
        return new JobExecutionError(500, message, log)
      }
    }
  } catch (_) {}

  return null
}
