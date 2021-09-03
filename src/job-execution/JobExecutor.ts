import { AuthConfig, ServerType } from '@sasjs/utils/types'
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
    authConfig?: AuthConfig,
    extraResponseAttributes?: ExtraResponseAttributes[]
  ) => Promise<any>
  resendWaitingRequests: () => Promise<void>
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
    authConfig?: AuthConfig | undefined,
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

  protected appendWaitingRequest(request: ExecuteFunction) {
    this.waitingRequests.push(request)
  }
}
