import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { CsrfToken, JobExecutionError } from '..'
import { LoginRequiredError } from '../types'
import { AuthorizeError } from '../types/AuthorizeError'

export class RequestClient {
  private csrfToken: CsrfToken | undefined
  private fileUploadCsrfToken: CsrfToken | undefined
  private httpClient: AxiosInstance

  constructor(baseUrl: string) {
    this.httpClient = axios.create({ baseURL: baseUrl })
  }

  public getCsrfToken(type: 'general' | 'file' = 'general') {
    return type === 'file' ? this.fileUploadCsrfToken : this.csrfToken
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
      requestConfig.headers.Accept = '*/*'
      requestConfig.transformResponse = undefined
    }

    try {
      const response = await this.httpClient.get<T>(url, requestConfig)
      return {
        result: response.data as T,
        etag: response.headers['etag']
      }
    } catch (e) {
      const response_1 = e.response as AxiosResponse
      if (response_1.status === 403 || response_1.status === 449) {
        this.parseAndSetCsrfToken(response_1)
        if (this.csrfToken) {
          return this.get<T>(url, accessToken, contentType, overrideHeaders)
        }
        throw e
      }
      throw e
    }
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
        return {
          result: response.data as T,
          etag: response.headers['etag'] as string
        }
      })
      .catch(async (e) => {
        const response = e.response as AxiosResponse
        if (e instanceof AuthorizeError) {
          await this.post(e.confirmUrl, { value: true }, undefined)
          return this.post<T>(url, data, accessToken)
        }
        if (response?.status === 403 || response?.status === 449) {
          this.parseAndSetCsrfToken(response)

          if (this.csrfToken) {
            return this.post<T>(url, data, accessToken)
          }
          throw e
        }
        throw e
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

    try {
      const response = await this.httpClient.put<T>(url, data, {
        headers,
        withCredentials: true
      })
      return {
        result: response.data as T,
        etag: response.headers['etag'] as string
      }
    } catch (e) {
      const response = e.response as AxiosResponse
      if (response?.status === 403 || response?.status === 449) {
        this.parseAndSetCsrfToken(response)

        if (this.csrfToken) {
          return this.put<T>(url, data, accessToken)
        }
        throw e
      }

      if (response?.status === 401) {
        throw new LoginRequiredError()
      }
      throw e
    }
  }

  public async delete<T>(
    url: string,
    accessToken?: string
  ): Promise<{ result: T; etag: string }> {
    const headers = this.getHeaders(accessToken, 'application/json')

    const requestConfig: AxiosRequestConfig = {
      headers
    }

    try {
      const response = await this.httpClient.delete<T>(url, requestConfig)
      return {
        result: response.data as T,
        etag: response.headers['etag']
      }
    } catch (e) {
      const response = e.response as AxiosResponse
      if (response?.status === 403 || response?.status === 449) {
        this.parseAndSetCsrfToken(response)

        if (this.csrfToken) {
          return this.delete<T>(url, accessToken)
        }
        throw e
      }
      throw e
    }
  }

  public async patch<T>(
    url: string,
    data: any = {},
    accessToken?: string
  ): Promise<{ result: T; etag: string }> {
    const headers = this.getHeaders(accessToken, 'application/json')

    try {
      const response = await this.httpClient.patch<T>(url, data, {
        headers,
        withCredentials: true
      })
      return {
        result: response.data as T,
        etag: response.headers['etag'] as string
      }
    } catch (e) {
      const response = e.response as AxiosResponse
      if (response?.status === 403 || response?.status === 449) {
        this.parseAndSetCsrfToken(response)

        if (this.csrfToken) {
          return this.patch<T>(url, accessToken)
        }
        throw e
      }
      throw e
    }
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

  private getHeaders = (
    accessToken: string | undefined,
    contentType: string
  ) => {
    const headers: any = {
      'Content-Type': contentType
    }

    if (contentType === 'text/plain') {
      headers.Accept = '*/*'
    }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }
    if (this.csrfToken?.value) {
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
}

const throwIfError = (response: AxiosResponse) => {
  if (response.data?.entityID?.includes('login')) {
    throw new LoginRequiredError()
  }

  if (response.data?.auth_request) {
    throw new AuthorizeError(
      response.data.message,
      response.data.options.confirm.location
    )
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
      return null
    } catch (_) {
      return null
    }
  }
}
