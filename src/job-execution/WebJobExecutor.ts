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
  getValidJson,
  parseSasViyaDebugResponse,
  appendExtraResponseAttributes
} from '../utils'
import { BaseJobExecutor } from './JobExecutor'
import { parseWeboutResponse } from '../utils/parseWeboutResponse'
import { isLoggedInSASVIYA } from '../auth/verifyingPopUpLoginSASVIYA'

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
    const loginCallback = loginRequiredCallback || (() => Promise.resolve())

    if (this.serverType === ServerType.SasViya && !isLoggedInSASVIYA()) {
      await loginCallback()
    }

    const program = isRelativePath(sasJob)
      ? config.appLoc
        ? config.appLoc.replace(/\/?$/, '/') + sasJob.replace(/^\//, '')
        : sasJob
      : sasJob
    let apiUrl = `${config.serverUrl}${this.jobsPath}/?${'_program=' + program}`

    if (config.serverType === ServerType.SasViya) {
      const jobUri =
        config.serverType === ServerType.SasViya
          ? await this.getJobUri(sasJob)
          : ''

      apiUrl += jobUri.length > 0 ? '&_job=' + jobUri : ''

      if (jobUri.length > 0) {
        apiUrl += '&_job=' + jobUri
        /**
         * Using both _job and _program parameters will cause a conflict in the JES web app, as it’s not clear whether or not the server should make the extra fetch for the job uri.
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

    let formData = new FormData()

    if (data) {
      const stringifiedData = JSON.stringify(data)
      if (
        config.serverType === ServerType.Sas9 ||
        stringifiedData.length > 500000 ||
        stringifiedData.includes(';')
      ) {
        // file upload approach
        try {
          formData = generateFileUploadForm(formData, data)
        } catch (e) {
          return Promise.reject(new ErrorResponse(e?.message, e))
        }
      } else {
        // param based approach
        try {
          const { formData: newFormData, requestParams: params } =
            generateTableUploadForm(formData, data)
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
      this.requestClient!.post(apiUrl, formData, undefined)
        .then(async (res: any) => {
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
            }
          }

          this.appendRequest(res, sasJob, config.debug)

          const responseObject = appendExtraResponseAttributes(
            { result: jsonResponse },
            extraResponseAttributes
          )
          resolve(responseObject)
        })
        .catch(async (e: Error) => {
          if (e instanceof JobExecutionError) {
            this.appendRequest(e, sasJob, config.debug)

            reject(new ErrorResponse(e?.message, e))
          }

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

            await loginCallback()
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
