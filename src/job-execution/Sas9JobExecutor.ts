import { ServerType } from '@sasjs/utils/types'
import { Curl } from 'node-libcurl'
import * as NodeFormData from 'form-data'
import {
  ErrorResponse,
  JobExecutionError,
  LoginRequiredError
} from '../types/errors'
import { generateFileUploadForm } from '../file/generateFileUploadForm'
import { generateTableUploadForm } from '../file/generateTableUploadForm'
import { RequestClient } from '../request/RequestClient'
import { SASViyaApiClient } from '../SASViyaApiClient'
import { isRelativePath } from '../utils'
import { BaseJobExecutor } from './JobExecutor'

interface WaitingRequstPromise {
  promise: Promise<any> | null
  resolve: any
  reject: any
}
export class Sas9JobExecutor extends BaseJobExecutor {
  constructor(
    serverUrl: string,
    serverType: ServerType,
    private jobsPath: string,
    private requestClient: RequestClient
  ) {
    super(serverUrl, serverType)
  }

  async execute(
    sasJob: string,
    data: any,
    config: any,
    loginRequiredCallback?: any
  ) {
    const loginCallback = loginRequiredCallback || (() => Promise.resolve())
    const program = isRelativePath(sasJob)
      ? config.appLoc
        ? config.appLoc.replace(/\/?$/, '/') + sasJob.replace(/^\//, '')
        : sasJob
      : sasJob
    const jobUri = ''
    let apiUrl = `${config.serverUrl}${this.jobsPath}/?${
      jobUri.length > 0
        ? '__program=' + program + '&_job=' + jobUri
        : '_program=' + program
    }`
    apiUrl = `${apiUrl}${
      config.username && config.password
        ? '&_username=' + config.username + '&_password=' + config.password
        : ''
    }`

    let requestParams = {
      ...this.getRequestParams(config)
    }

    let formData =
      typeof FormData === 'undefined' ? new NodeFormData() : new FormData()

    if (data) {
      const stringifiedData = JSON.stringify(data)
      if (
        config.serverType === ServerType.Sas9 ||
        stringifiedData.length > 500000 ||
        stringifiedData.includes(';')
      ) {
        // file upload approach
        try {
          formData = generateFileUploadForm(formData as FormData, data)
        } catch (e) {
          return Promise.reject(new ErrorResponse(e?.message, e))
        }
      } else {
        // param based approach
        try {
          const {
            formData: newFormData,
            requestParams: params
          } = generateTableUploadForm(formData as FormData, data)
          formData = newFormData
          requestParams = { ...requestParams, ...params }
        } catch (e) {
          return Promise.reject(new ErrorResponse(e?.message, e))
        }
      }
    }

    for (const key in requestParams) {
      if (requestParams.hasOwnProperty(key)) {
        formData.append(key, requestParams[key])
      }
    }

    const requestPromise = new Promise((resolve, reject) => {
      const curl = new Curl()
      curl.setOpt('URL', apiUrl)
      curl.setOpt('USERAGENT', 'curl/7.64.1')
      curl.setOpt('FOLLOWLOCATION', true)
      curl.setOpt('SSL_VERIFYPEER', false)
      curl.setOpt('COOKIEFILE', 'cookiefile')
      curl.on('end', (statusCode, res, headers) => {
        console.log('res', res)
        console.log('statusCode', statusCode)
        console.log('statusCode', statusCode)
        curl.on('end', (statusCode, res, headers) => {
          console.log('res', res)
          console.log('statusCode', statusCode)
          console.log('statusCode', statusCode)
          resolve(res)
        })
        curl.perform()
      })
      curl.on('error', (error) => {
        console.log('error', error)
        reject(error)
      })

      curl.perform()
      // this.requestClient!.post(apiUrl, formData, undefined)
      //   .then(async (res) => {
      //     if (this.serverType === ServerType.SasViya && config.debug) {
      //       const jsonResponse = await this.parseSasViyaDebugResponse(
      //         res.result as string
      //       )
      //       this.appendRequest(res, sasJob, config.debug)
      //       resolve(jsonResponse)
      //     }
      //     this.appendRequest(res, sasJob, config.debug)
      //     resolve(res.result)
      //   })
      //   .catch(async (e: Error) => {
      //     if (e instanceof JobExecutionError) {
      //       this.appendRequest(e, sasJob, config.debug)

      //       reject(new ErrorResponse(e?.message, e))
      //     }

      //     if (e instanceof LoginRequiredError) {
      //       await loginCallback()

      //       this.appendWaitingRequest(() => {
      //         return this.execute(
      //           sasJob,
      //           data,
      //           config,
      //           loginRequiredCallback
      //         ).then(
      //           (res: any) => {
      //             resolve(res)
      //           },
      //           (err: any) => {
      //             reject(err)
      //           }
      //         )
      //       })
      //     } else {
      //       reject(new ErrorResponse(e?.message, e))
      //     }
      //   })
    })

    return requestPromise
  }

  private parseSasViyaDebugResponse = async (response: string) => {
    const iframeStart = response.split(
      '<iframe style="width: 99%; height: 500px" src="'
    )[1]
    const jsonUrl = iframeStart ? iframeStart.split('"></iframe>')[0] : null
    if (!jsonUrl) {
      throw new Error('Unable to find webout file URL.')
    }

    return this.requestClient
      .get(this.serverUrl + jsonUrl, undefined)
      .then((res) => res.result)
  }

  private getRequestParams(config: any): any {
    const requestParams: any = {}

    if (config.debug) {
      requestParams['_omittextlog'] = 'false'
      requestParams['_omitsessionresults'] = 'false'

      requestParams['_debug'] = 131
    }

    return requestParams
  }

  private parseSAS9ErrorResponse(response: string) {
    const logLines = response.split('\n')
    const parsedLines: string[] = []
    let firstErrorLineIndex: number = -1

    logLines.map((line: string, index: number) => {
      if (
        line.toLowerCase().includes('error') &&
        !line.toLowerCase().includes('this request completed with errors.') &&
        firstErrorLineIndex === -1
      ) {
        firstErrorLineIndex = index
      }
    })

    for (let i = firstErrorLineIndex - 10; i <= firstErrorLineIndex + 10; i++) {
      parsedLines.push(logLines[i])
    }

    return parsedLines.join(', ')
  }
}
