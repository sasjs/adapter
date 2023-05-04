import { RequestClient } from './RequestClient'
import { AxiosResponse } from 'axios'
import { SASJS_LOGS_SEPARATOR } from '../utils'

interface SasjsParsedResponse<T> {
  result: T
  log: string
  etag: string
  status: number
  printOutput?: string
}

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

    if (!accessToken && typeof window !== 'undefined')
      accessToken = localStorage.getItem('accessToken') ?? undefined

    if (accessToken) headers.Authorization = `Bearer ${accessToken}`

    return headers
  }

  protected parseResponse<T>(response: AxiosResponse<any>) {
    const etag = response?.headers ? response.headers['etag'] : ''
    let parsedResponse = {}
    let webout, log, printOutput

    try {
      if (typeof response.data === 'string') {
        parsedResponse = JSON.parse(response.data)
      } else {
        parsedResponse = response.data
      }
    } catch {
      if (response.data.includes(SASJS_LOGS_SEPARATOR)) {
        const splittedResponse = response.data.split(SASJS_LOGS_SEPARATOR)

        webout = splittedResponse[0]
        if (webout) parsedResponse = webout

        log = splittedResponse[1]
        printOutput = splittedResponse[2]
      } else {
        parsedResponse = response.data
      }
    }

    const returnResult: SasjsParsedResponse<T> = {
      result: parsedResponse as T,
      log,
      etag,
      status: response.status
    }

    if (printOutput) returnResult.printOutput = printOutput

    return returnResult
  }
}
