import { RequestClient } from './RequestClient'
import { AxiosResponse } from 'axios'
import { SasjsParsedResponse } from '../types'

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
        const { data } = response
        const splittedResponse: string[] = data.split(SASJS_LOGS_SEPARATOR)

        webout = splittedResponse.splice(0, 1)[0]
        if (webout !== undefined) parsedResponse = webout

        // log can contain nested logs
        const logs = splittedResponse.splice(0, splittedResponse.length - 1)

        // tests if string ends with SASJS_LOGS_SEPARATOR
        const endingWithLogSepRegExp = new RegExp(`${SASJS_LOGS_SEPARATOR}$`)

        // at this point splittedResponse can contain only one item
        const lastChunk = splittedResponse[0]

        if (lastChunk) {
          // if the last chunk doesn't end with SASJS_LOGS_SEPARATOR, then it is a printOutput
          // else the last chunk is part of the log and has to be joined
          if (!endingWithLogSepRegExp.test(data)) printOutput = lastChunk
          else if (logs.length > 1) logs.push(lastChunk)
        }

        // join logs into single log with SASJS_LOGS_SEPARATOR
        log = logs.join(SASJS_LOGS_SEPARATOR)
      } else {
        parsedResponse = response.data
      }
    }

    const returnResult: SasjsParsedResponse<T> = {
      result: parsedResponse as T,
      log: log || '',
      etag,
      status: response.status
    }

    if (printOutput) returnResult.printOutput = printOutput

    return returnResult
  }
}

export const SASJS_LOGS_SEPARATOR =
  'SASJS_LOGS_SEPARATOR_163ee17b6ff24f028928972d80a26784'
