import type * as https from 'https'
import { AxiosRequestConfig } from 'axios'
import { wrapper } from 'axios-cookiejar-support'
import * as tough from 'tough-cookie'
import { prefixMessage } from '@sasjs/utils/error'
import { RequestClient, throwIfError } from './RequestClient'
import { JobExecutionError, UnsafeRedirectError } from '../types/errors'
import { getLogger } from '../utils/host'

let hasWarnedAboutSas9Login = false

/**
 * Warns once per process rather than per request: a job that runs repeatedly
 * through the SAS 9 credential path should not repeat this on every call, and
 * a single line is enough for the reader to find the README note.
 */
const warnDeprecatedSas9Login = () => {
  if (hasWarnedAboutSas9Login) return
  hasWarnedAboutSas9Login = true

  getLogger().warn(
    'The SAS 9 username / password login is deprecated and will be removed in a future major version. It appends the credentials to the _program query string, which SAS 9 only accepts when the platform is configured to allow URL credentials.'
  )
}

/**
 * Specific request client for SAS9 in Node.js environments.
 * Handles redirects and cookie management.
 */
export class Sas9RequestClient extends RequestClient {
  constructor(baseUrl: string, httpsAgentOptions?: https.AgentOptions) {
    super(baseUrl, httpsAgentOptions)
    this.httpClient.defaults.maxRedirects = 0
    this.httpClient.defaults.validateStatus = (status) =>
      status >= 200 && status < 303

    if (wrapper) {
      wrapper(this.httpClient)
      this.httpClient.defaults.jar = new tough.CookieJar()
    }
  }

  public resetInMemoryAuthState() {
    super.resetInMemoryAuthState()
    if (this.httpClient.defaults.jar) {
      ;(this.httpClient.defaults.jar as tough.CookieJar).removeAllCookiesSync()
    }
  }

  /**
   * Logs into SAS 9 by appending the credentials to a `_program` call.
   *
   * @deprecated The credentials travel in the query string, and SAS 9 only
   * accepts them when the platform is configured to allow URL credentials -
   * which is why this was never usable without a server-side change. There is
   * no drop-in replacement for the mechanism itself; it will be removed in a
   * future major version, so new work should not depend on it.
   */
  public async login(username: string, password: string, jobsPath: string) {
    if (username && password) warnDeprecatedSas9Login()

    const codeInjectorPath = `/User Folders/${username}/My Folder/sasjs/runner`
    if (this.httpClient.defaults.jar) {
      ;(this.httpClient.defaults.jar as tough.CookieJar).removeAllCookies()
      await this.get(
        `${jobsPath}?_program=${codeInjectorPath}&_username=${username}&_password=${password}`,
        undefined,
        'text/plain'
      )
    }
  }

  /**
   * A 302 is followed by hand rather than by axios (maxRedirects is 0), and the
   * request carries the access token, so the token would otherwise travel to
   * whatever host the response names. Only a redirect to the origin of the
   * request is followed.
   *
   * Resolving against `url` and `baseUrl` is what makes the check hold for
   * every form a Location can take: a relative path or a protocol-relative
   * value resolves to the origin it was resolved against, and an absolute one
   * that leaves it is refused. The Location is passed through unchanged, so a
   * same-origin redirect behaves exactly as it did before.
   */
  private assertSafeRedirect(location: string | undefined, url: string) {
    if (!location) {
      throw new UnsafeRedirectError(
        url,
        'the response carried no Location header'
      )
    }

    const requested = new URL(url, this.baseUrl)
    const target = new URL(location, requested)

    if (target.origin !== requested.origin) {
      throw new UnsafeRedirectError(
        url,
        `${target.origin} is not the origin of the request`,
        location
      )
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
      withXSRFToken: true
    }
    if (contentType === 'text/plain') {
      requestConfig.transformResponse = undefined
    }

    return this.httpClient
      .get<T>(url, requestConfig)
      .then((response) => {
        if (response.status === 302) {
          const location = response.headers['location']
          this.assertSafeRedirect(location, url)

          return this.get(location, accessToken, contentType)
        }
        throwIfError(response)
        return this.parseResponse<T>(response)
      })
      .catch(async (e: any) => {
        if (e instanceof JobExecutionError) throw e

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

  public async post<T>(
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
      .post<T>(url, data, { headers, withXSRFToken: true })
      .then(async (response) => {
        if (response.status === 302) {
          const location = response.headers['location']
          this.assertSafeRedirect(location, url)

          return await this.get(
            location,
            undefined,
            contentType,
            overrideHeaders
          )
        }
        throwIfError(response)
        return this.parseResponse<T>(response)
      })
      .catch(async (e: any) => {
        return await this.handleError(e, () =>
          this.post<T>(url, data, accessToken, contentType, overrideHeaders)
        )
      })
  }
}
