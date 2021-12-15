import { RequestClient } from './RequestClient'

/**
 * Specific request client for SASJS.
 * Append tokens in headers.
 */
export class SasjsRequestClient extends RequestClient {
  getHeaders = (accessToken: string | undefined, contentType: string) => {
    const headers: any = {}

    if (contentType !== 'application/x-www-form-urlencoded')
      headers['Content-Type'] = contentType

    headers.Accept = contentType === 'application/json' ? contentType : '*/*'

    if (!accessToken)
      accessToken = localStorage.getItem('accessToken') ?? undefined

    if (accessToken) headers.Authorization = `Bearer ${accessToken}`

    return headers
  }
}
