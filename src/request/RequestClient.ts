import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { CsrfToken, JobExecutionError } from '..'
import { isAuthorizeFormRequired, isLogInRequired } from '../auth'
import { LoginRequiredError } from '../types'
import { AuthorizeError } from '../types/AuthorizeError'
import { NotFoundError } from '../types/NotFoundError'
import { parseWeboutResponse } from '../utils/parseWeboutResponse'
import { prefixMessage } from '@sasjs/utils/error'

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
  clearCsrfTokens(): void
}

export class RequestClient implements HttpClient {
  private csrfToken: CsrfToken = { headerName: '', value: '' }
  private fileUploadCsrfToken: CsrfToken | undefined
  private httpClient: AxiosInstance

  constructor(private baseUrl: string, allowInsecure = false) {
    const https = require('https')
    if (allowInsecure && https.Agent) {
      this.httpClient = axios.create({
        baseURL: baseUrl,
        httpsAgent: new https.Agent({
          rejectUnauthorized: !allowInsecure
        })
      })
    } else {
      this.httpClient = axios.create({
        baseURL: baseUrl
      })
    }
  }

  public getCsrfToken(type: 'general' | 'file' = 'general') {
    return type === 'file' ? this.fileUploadCsrfToken : this.csrfToken
  }

  public clearCsrfTokens() {
    this.csrfToken = { headerName: '', value: '' }
    this.fileUploadCsrfToken = { headerName: '', value: '' }
  }

  public async get<T>(
    url: string,
    accessToken: string | undefined,
    contentType: string = 'application/json',
    overrideHeaders: { [key: string]: string | number } = {}
  ): Promise<{ result: T; etag: string }> {
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
      .catch(async (e) => {
        return await this.handleError(e, () =>
          this.get<T>(url, accessToken, contentType, overrideHeaders)
        ).catch((err) => {
          throw prefixMessage(err, 'Error while handling error. ')
        })
      })
  }

  public post<T>(
    url: string,
    data: any,
    accessToken: string | undefined,
    contentType = 'application/json',
    overrideHeaders: { [key: string]: string | number } = {}
  ): Promise<{ result: T; etag: string }> {
    const headers = {
      ...this.getHeaders(accessToken, contentType),
      ...overrideHeaders
    }

    return this.httpClient
      .post<T>(url, data, { headers, withCredentials: true })
      .then((response) => {
        throwIfError(response)
        return this.parseResponse<T>(response)
      })
      .catch(async (e) => {
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
      .catch(async (e) => {
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
      .catch(async (e) => {
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
      .catch(async (e) => {
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
      headers[
        this.fileUploadCsrfToken.headerName
      ] = this.fileUploadCsrfToken.value
    }

    try {
      const response = await this.httpClient.post(url, content, { headers })
      return {
        result: response.data,
        etag: response.headers['etag'] as string
      }
    } catch (e) {
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
        console.log(error)
      })
  }

  private getHeaders = (
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

  private parseAndSetFileUploadCsrfToken = (response: AxiosResponse) => {
    const token = this.parseCsrfToken(response)

    if (token) {
      this.fileUploadCsrfToken = token
    }
  }

  private parseAndSetCsrfToken = (response: AxiosResponse) => {
    const token = this.parseCsrfToken(response)

    if (token) {
      this.csrfToken = token
    }
  }

  private parseCsrfToken = (response: AxiosResponse): CsrfToken | undefined => {
    const tokenHeader = (response.headers[
      'x-csrf-header'
    ] as string)?.toLowerCase()

    if (tokenHeader) {
      const token = response.headers[tokenHeader]
      const csrfToken = {
        headerName: tokenHeader,
        value: token || ''
      }

      return csrfToken
    }
  }

  private handleError = async (e: any, callback: any) => {
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
        await this.authorize(res.data as string)
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
    }

    throw e
  }

  private async parseResponse<T>(response: AxiosResponse<any>) {
    const etag = response?.headers ? response.headers['etag'] : ''
    let parsedResponse

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
    }
    return {
      result: parsedResponse as T,
      etag
    }
  }
}

const throwIfError = (response: AxiosResponse) => {
  if (response.status === 401) {
    throw new LoginRequiredError()
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

  const error = parseError(response.data as string)
  if (error) {
    throw error
  }
}

const parseError = (data: string) => {
  try {
    const responseJson = JSON.parse(data?.replace(/[\n\r]/g, ' '))
    return responseJson.errorCode && responseJson.message
      ? new JobExecutionError(
          responseJson.errorCode,
          responseJson.message,
          data?.replace(/[\n\r]/g, ' ')
        )
      : null
  } catch (_) {
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
        return null
      }
      try {
        const hasError = !!data?.match(/stored process not found: /i)
        if (hasError) {
          const parts = data.split(/stored process not found: /i)
          if (parts.length > 1) {
            const storedProcessPath = parts[1].split('<i>')[1].split('</i>')[0]
            const message = `Stored process not found: ${storedProcessPath}`
            return new JobExecutionError(404, message, '')
          }
        }
      } catch (_) {
        return null
      }
    } catch (_) {
      return null
    }
  }
}
