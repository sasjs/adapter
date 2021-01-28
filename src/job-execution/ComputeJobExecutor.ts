import { ServerType } from '@sasjs/utils/types'
import { ErrorResponse } from '..'
import { SASViyaApiClient } from '../SASViyaApiClient'
import {
  ComputeJobExecutionError,
  LoginRequiredError,
  SASjsRequest
} from '../types'
import {
  asyncForEach,
  parseGeneratedCode,
  parseSourceCode,
  parseWeboutResponse
} from '../utils'
import { ExecuteFunction, JobExecutor } from './JobExecutor'
import { parseSasWork } from './parseSasWork'

export class ComputeJobExecutor implements JobExecutor {
  waitingRequests: ExecuteFunction[] = []
  requests: SASjsRequest[] = []

  constructor(
    private serverUrl: string,
    private sasViyaApiClient: SASViyaApiClient
  ) {}

  async execute(
    sasJob: string,
    data: any,
    config: any,
    loginRequiredCallback?: any,
    accessToken?: string
  ) {
    const loginCallback = loginRequiredCallback || (() => Promise.resolve())
    const waitForResult = true
    const expectWebout = true
    return this.sasViyaApiClient
      ?.executeComputeJob(
        sasJob,
        config.contextName,
        config.debug,
        data,
        accessToken,
        waitForResult,
        expectWebout
      )
      .then((response) => {
        this.appendRequest(response, sasJob, config.debug)

        let responseJson

        try {
          if (typeof response!.result === 'string') {
            responseJson = JSON.parse(response!.result)
          } else {
            responseJson = response!.result
          }
        } catch {
          responseJson = JSON.parse(parseWeboutResponse(response!.result))
        }

        return responseJson
      })
      .catch(async (e: Error) => {
        if (e instanceof ComputeJobExecutionError) {
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
          ServerType.SasViya
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
}
