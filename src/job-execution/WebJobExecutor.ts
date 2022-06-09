import * as NodeFormData from 'form-data'
import {
  AuthConfig,
  ExtraResponseAttributes,
  ServerType
} from '@sasjs/utils/types'
import {
  ErrorResponse,
  JobExecutionError,
  LoginRequiredError
} from '../types/errors'
import { generateFileUploadForm } from '../file/generateFileUploadForm'
import { generateTableUploadForm } from '../file/generateTableUploadForm'
import { RequestClient } from '../request/RequestClient'
import { SASViyaApiClient } from '../SASViyaApiClient'
import {
  isRelativePath,
  parseSasViyaDebugResponse,
  appendExtraResponseAttributes,
  getValidJson
} from '../utils'
import { BaseJobExecutor } from './JobExecutor'
import { parseWeboutResponse } from '../utils/parseWeboutResponse'
import { Server } from 'https'

export interface WaitingRequstPromise {
  promise: Promise<any> | null
  resolve: any
  reject: any
}
export class WebJobExecutor extends BaseJobExecutor {
  constructor(
    serverUrl: string,
    serverType: ServerType,
    private jobsPath: string,
    private requestClient: RequestClient,
    private sasViyaApiClient: SASViyaApiClient
  ) {
    super(serverUrl, serverType)
  }

  async execute(
    sasJob: string,
    data: any,
    config: any,
    loginRequiredCallback?: any,
    authConfig?: AuthConfig,
    extraResponseAttributes: ExtraResponseAttributes[] = []
  ) {
    const loginCallback = loginRequiredCallback
    const program = isRelativePath(sasJob)
      ? config.appLoc
        ? config.appLoc.replace(/\/?$/, '/') + sasJob.replace(/^\//, '')
        : sasJob
      : sasJob
    let apiUrl = `${config.serverUrl}${this.jobsPath}/?${'_program=' + program}`

    if (config.serverType === ServerType.SasViya) {
      let jobUri
      try {
        jobUri = await this.getJobUri(sasJob)
      } catch (e: any) {
        return new Promise(async (resolve, reject) => {
          if (e instanceof LoginRequiredError) {
            this.appendWaitingRequest(() => {
              return this.execute(
                sasJob,
                data,
                config,
                loginRequiredCallback,
                authConfig,
                extraResponseAttributes
              ).then(
                (res: any) => {
                  resolve(res)
                },
                (err: any) => {
                  reject(err)
                }
              )
            })

            if (loginCallback) await loginCallback()
          } else {
            reject(new ErrorResponse(e?.message, e))
          }
        })
      }

      apiUrl += jobUri.length > 0 ? '&_job=' + jobUri : ''

      if (jobUri.length > 0) {
        apiUrl += '&_job=' + jobUri
        /**
         * Using both _job and _program parameters will cause a conflict in the JES web app, as it's not clear whether or not the server should make the extra fetch for the job uri.
         * To handle this, we add the extra underscore and recreate the _program variable in the SAS side of the SASjs adapter so it remains available for backend developers.
         */
        apiUrl = apiUrl.replace('_program=', '__program=')
      }

      // if context name exists and is not blank string
      // then add _contextname variable in apiUrl
      apiUrl +=
        config.contextName && !/\s/.test(config.contextName)
          ? `&_contextname=${config.contextName}`
          : ''
    }

    let requestParams = {
      ...this.getRequestParams(config)
    }

    /**
     * Use the available form data object (FormData in Browser, NodeFormData in
     *  Node)
     */
    let formData =
      typeof FormData === 'undefined' ? new NodeFormData() : new FormData()

    if (data) {
      const stringifiedData = JSON.stringify(data)
      if (
        config.serverType === ServerType.Sas9 ||
        config.serverType === ServerType.Sasjs ||
        stringifiedData.length > 500000 ||
        stringifiedData.includes(';')
      ) {
        // file upload approach
        try {
          formData = generateFileUploadForm(formData, data)
        } catch (e: any) {
          return Promise.reject(new ErrorResponse(e?.message, e))
        }
      } else {
        // param based approach
        try {
          const { formData: newFormData, requestParams: params } =
            generateTableUploadForm(formData, data)
          formData = newFormData
          requestParams = { ...requestParams, ...params }
        } catch (e: any) {
          return Promise.reject(new ErrorResponse(e?.message, e))
        }
      }
    }

    for (const key in requestParams) {
      if (requestParams.hasOwnProperty(key)) {
        formData.append(key, requestParams[key])
      }
    }

    /* The NodeFormData object does not set the request header - so, set it */
    const contentType =
      formData instanceof NodeFormData && typeof FormData === 'undefined'
        ? `multipart/form-data; boundary=${formData.getBoundary()}`
        : undefined

    const requestPromise = new Promise((resolve, reject) => {
      this.requestClient!.post(
        apiUrl,
        formData,
        authConfig?.access_token,
        contentType
      )
        .then(async (res: any) => {
          const parsedSasjsServerLog =
            this.serverType === ServerType.Sasjs
              ? res.result.log.map((logLine: any) => logLine.line).join('\n')
              : res.result.log

          const resObj =
            this.serverType === ServerType.Sasjs
              ? {
                  result: res.result._webout,
                  log: parsedSasjsServerLog
                }
              : res

          this.requestClient!.appendRequest(resObj, sasJob, config.debug)

          if (
            this.serverType === ServerType.Sasjs &&
            res.result._webout.length < 1
          ) {
            throw new JobExecutionError(
              0,
              'Job execution failed',
              parsedSasjsServerLog
            )
          }

          let jsonResponse = res.result

          if (config.debug) {
            switch (this.serverType) {
              case ServerType.SasViya:
                jsonResponse = await parseSasViyaDebugResponse(
                  res.result,
                  this.requestClient,
                  this.serverUrl
                )
                break
              case ServerType.Sas9:
                jsonResponse =
                  typeof res.result === 'string'
                    ? parseWeboutResponse(res.result, apiUrl)
                    : res.result
                break
              case ServerType.Sasjs:
                if (typeof res.result._webout === 'object') {
                  jsonResponse = res.result._webout
                } else {
                  const webout = parseWeboutResponse(res.result._webout, apiUrl)
                  jsonResponse = getValidJson(webout)
                }
                break
            }
          } else if (this.serverType === ServerType.Sasjs) {
            jsonResponse = getValidJson(res.result._webout)
          }

          const responseObject = appendExtraResponseAttributes(
            { result: jsonResponse, log: parsedSasjsServerLog },
            extraResponseAttributes
          )
          resolve(responseObject)
        })
        .catch(async (e: Error) => {
          if (e instanceof JobExecutionError) {
            this.requestClient!.appendRequest(e, sasJob, config.debug)
            reject(new ErrorResponse(e?.message, e))
          }

          if (e instanceof LoginRequiredError) {
            if (!loginRequiredCallback) {
              reject(
                new ErrorResponse(
                  'Request is not authenticated. Make sure .env file exists with valid credentials.',
                  e
                )
              )
            }

            this.appendWaitingRequest(() => {
              return this.execute(
                sasJob,
                data,
                config,
                loginRequiredCallback,
                authConfig,
                extraResponseAttributes
              ).then(
                (res: any) => {
                  resolve(res)
                },
                (err: any) => {
                  reject(err)
                }
              )
            })

            if (loginCallback) await loginCallback()
          } else {
            reject(new ErrorResponse(e?.message, e))
          }
        })
    })

    return requestPromise
  }

  private async getJobUri(sasJob: string) {
    if (!this.sasViyaApiClient) return ''
    let uri = ''

    let folderPath
    let jobName: string
    if (isRelativePath(sasJob)) {
      const folderPathParts = sasJob.split('/')
      folderPath = folderPathParts.length > 1 ? folderPathParts[0] : ''
      jobName = folderPathParts.length > 1 ? folderPathParts[1] : ''
    } else {
      const folderPathParts = sasJob.split('/')
      jobName = folderPathParts.pop() || ''
      folderPath = folderPathParts.join('/')
    }

    if (!jobName) {
      throw new Error('Job name is empty, null or undefined.')
    }

    const locJobs = await this.sasViyaApiClient.getJobsInFolder(folderPath)
    if (locJobs) {
      const job = locJobs.find(
        (el: any) => el.name === jobName && el.contentType === 'jobDefinition'
      )
      if (job) {
        uri = job.uri
      }
    }
    return uri
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
