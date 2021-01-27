import { ServerType } from '@sasjs/utils/types'
import { ErrorResponse, JobExecutionError, LoginRequiredError } from '..'
import { generateFileUploadForm } from '../file/generateFileUploadForm'
import { generateTableUploadForm } from '../file/generateTableUploadForm'
import { RequestClient } from '../request/RequestClient'
import { SASViyaApiClient } from '../SASViyaApiClient'
import { SASjsRequest } from '../types'
import {
  asyncForEach,
  isRelativePath,
  parseGeneratedCode,
  parseSourceCode,
  parseWeboutResponse
} from '../utils'
import { ExecuteFunction, JobExecutor } from './JobExecutor'
import { parseSasWork } from './parseSasWork'

export class WebJobExecutor implements JobExecutor {
  waitingRequests: ExecuteFunction[] = []
  requests: SASjsRequest[] = []

  constructor(
    private serverUrl: string,
    private serverType: ServerType,
    private jobsPath: string,
    private requestClient: RequestClient,
    private sasViyaApiClient: SASViyaApiClient
  ) {}

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
    const jobUri =
      config.serverType === ServerType.SasViya
        ? await this.getJobUri(sasJob)
        : ''
    const apiUrl = `${config.serverUrl}${this.jobsPath}/?${
      jobUri.length > 0
        ? '__program=' + program + '&_job=' + jobUri
        : '_program=' + program
    }`

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
          const {
            formData: newFormData,
            requestParams: params
          } = generateTableUploadForm(formData, data)
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

    return this.requestClient!.post(
      apiUrl,
      formData,
      undefined,
      'application/json',
      {
        referrerPolicy: 'same-origin'
      }
    )
      .then(async (res) => {
        this.appendRequest(res, sasJob, config.debug)
        return res.result
      })
      .catch(async (e: Error) => {
        if (e instanceof JobExecutionError) {
          this.appendRequest(e, sasJob, config.debug)
        }
        if (e instanceof LoginRequiredError) {
          await loginCallback()
          this.waitingRequests.push(() =>
            this.execute(sasJob, data, config, loginRequiredCallback)
          )
        }
        return Promise.reject(new ErrorResponse(e?.message, e))
      })
  }

  resendWaitingRequests = async () => {
    await asyncForEach(
      this.waitingRequests,
      async (waitingRequest: ExecuteFunction) => {
        await waitingRequest()
      }
    )

    this.waitingRequests = []
    return
  }

  getRequests = () => this.requests

  clearRequests = () => {
    this.requests = []
  }

  private async getJobUri(sasJob: string) {
    if (!this.sasViyaApiClient) return ''
    let uri = ''

    let folderPath
    let jobName: string
    if (isRelativePath(sasJob)) {
      folderPath = sasJob.split('/')[0]
      jobName = sasJob.split('/')[1]
    } else {
      const folderPathParts = sasJob.split('/')
      jobName = folderPathParts.pop() || ''
      folderPath = folderPathParts.join('/')
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

  private async appendRequest(response: any, program: string, debug: boolean) {
    let sourceCode = ''
    let generatedCode = ''
    let sasWork = null

    if (debug) {
      if (response?.result && response?.log) {
        sourceCode = parseSourceCode(response.log)
        generatedCode = parseGeneratedCode(response.log)

        if (response.log) {
          sasWork = response.log
        } else {
          sasWork = JSON.parse(parseWeboutResponse(response.result)).WORK
        }
      } else if (response?.result) {
        sourceCode = parseSourceCode(response.result)
        generatedCode = parseGeneratedCode(response.result)
        sasWork = await parseSasWork(
          response.result,
          debug,
          this.serverUrl,
          this.serverType
        )
      }
    }

    this.requests.push({
      logFile: response?.log || response?.result || response,
      serviceLink: program,
      timestamp: new Date(),
      sourceCode,
      generatedCode,
      SASWORK: sasWork
    })

    if (this.requests.length > 20) {
      this.requests.splice(0, 1)
    }
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
