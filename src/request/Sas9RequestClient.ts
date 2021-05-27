import { AxiosRequestConfig } from 'axios'
import axiosCookieJarSupport from 'axios-cookiejar-support'
import * as tough from 'tough-cookie'
import { prefixMessage } from '@sasjs/utils/error'
import { RequestClient, throwIfError } from './RequestClient'

export class Sas9RequestClient extends RequestClient {
  constructor(baseUrl: string, allowInsecure = false) {
    super(baseUrl, allowInsecure)
    this.httpClient.defaults.maxRedirects = 0
    this.httpClient.defaults.validateStatus = (status) =>
      status >= 200 && status < 303

    if (axiosCookieJarSupport) {
      axiosCookieJarSupport(this.httpClient)
      this.httpClient.defaults.jar = new tough.CookieJar()
    }
  }

  public async login(username: string, password: string) {
    const codeInjectorPath = `/User Folders/${username}/My Folder/sasjs/runner`
    if (this.httpClient.defaults.jar) {
      ;(this.httpClient.defaults.jar as tough.CookieJar).removeAllCookies()
      await this.get(
        `/SASStoredProcess/do?_program=${codeInjectorPath}&_username=${username}&_password=${password}`,
        undefined,
        'text/plain'
      )
    }
  }

  public async get<T>(
    url: string,
    accessToken: string | undefined,
    contentType: string = 'application/json',
    overrideHeaders: { [key: string]: string | number } = {},
    debug: boolean = false
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
        if (response.status === 302) {
          return this.get(
            response.headers['location'],
            accessToken,
            contentType
          )
        }
        throwIfError(response)
        return this.parseResponse<T>(response)
      })
      .catch(async (e) => {
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
      .then(async (response) => {
        if (response.status === 302) {
          return await this.get(
            response.headers['location'],
            undefined,
            contentType,
            overrideHeaders
          )
        }
        throwIfError(response)
        return this.parseResponse<T>(response)
      })
      .catch(async (e) => {
        return await this.handleError(e, () =>
          this.post<T>(url, data, accessToken, contentType, overrideHeaders)
        )
      })
  }
}
