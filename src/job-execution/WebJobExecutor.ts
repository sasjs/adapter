import { ServerType } from '@sasjs/utils/types'
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
    loginRequiredCallback?: any
  ) {
    const loginCallback = loginRequiredCallback || (() => Promise.resolve())
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

      apiUrl += config.contextName ? `&_contextname=${config.contextName}` : ''
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
        .then(async (res) => {
          if (this.serverType === ServerType.SasViya && config.debug) {
            const jsonResponse = await this.parseSasViyaDebugResponse(
              res.result as string
            )
            this.appendRequest(res, sasJob, config.debug)
            resolve(jsonResponse)
          }
          this.appendRequest(res, sasJob, config.debug)
          resolve(res.result)
        })
        .catch(async (e: Error) => {
          if (e instanceof JobExecutionError) {
            this.appendRequest(e, sasJob, config.debug)

            reject(new ErrorResponse(e?.message, e))
          }

          if (e instanceof LoginRequiredError) {
            await loginCallback()

            this.appendWaitingRequest(() => {
              return this.execute(
                sasJob,
                data,
                config,
                loginRequiredCallback
              ).then(
                (res: any) => {
                  resolve(res)
                },
                (err: any) => {
                  reject(err)
                }
              )
            })
          } else {
            reject(new ErrorResponse(e?.message, e))
          }
        })
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
