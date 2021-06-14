import { ServerType } from '@sasjs/utils/types'
import { SASjsRequest } from '../types'
import { ExtraResponseAttributes } from '@sasjs/utils/types'
import { asyncForEach, parseGeneratedCode, parseSourceCode } from '../utils'

export type ExecuteFunction = () => Promise<any>

export interface JobExecutor {
  execute: (
    sasJob: string,
    data: any,
    config: any,
    loginRequiredCallback?: any,
    accessToken?: string,
    extraResponseAttributes?: ExtraResponseAttributes[]
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
    accessToken?: string | undefined,
    extraResponseAttributes?: ExtraResponseAttributes[]
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

  protected appendRequest(response: any, program: string, debug: boolean) {
    let sourceCode = ''
    let generatedCode = ''
    let sasWork = null

    if (debug) {
      if (response?.log) {
        sourceCode = parseSourceCode(response.log)
        generatedCode = parseGeneratedCode(response.log)

        if (response?.result) {
          sasWork = response.result.WORK
        } else {
          sasWork = response.log
        }
      } else if (response?.result) {
        sourceCode = parseSourceCode(response.result)
        generatedCode = parseGeneratedCode(response.result)
        sasWork = response.result.WORK
      }
    }

    const stringifiedResult =
      typeof response?.result === 'string'
        ? response?.result
        : JSON.stringify(response?.result, null, 2)

    this.requests.push({
      logFile: response?.log || stringifiedResult || response,
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
