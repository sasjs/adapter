import { ServerType } from '@sasjs/utils/types'
import { parseSasWork } from '.'
import { SASjsRequest } from '../types'
import {
  asyncForEach,
  parseGeneratedCode,
  parseSourceCode,
  parseWeboutResponse
} from '../utils'

export type ExecuteFunction = () => Promise<any>

export interface JobExecutor {
  execute: (
    sasJob: string,
    data: any,
    config: any,
    loginRequiredCallback?: any,
    accessToken?: string
  ) => Promise<any>
  resendWaitingRequests: () => Promise<void>
  getRequests: () => SASjsRequest[]
  clearRequests: () => void
}

export abstract class BaseJobExecutor implements JobExecutor {
  constructor(protected serverUrl: string, protected serverType: ServerType) {}

  private waitingRequests: ExecuteFunction[] = []
  private requests: SASjsRequest[] = []

  abstract execute(
    sasJob: string,
    data: any,
    config: any,
    loginRequiredCallback?: any,
    accessToken?: string | undefined
  ): Promise<any>

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

  protected appendWaitingRequest(request: ExecuteFunction) {
    this.waitingRequests.push(request)
  }

  protected async appendRequest(
    response: any,
    program: string,
    debug: boolean
  ) {
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
}
