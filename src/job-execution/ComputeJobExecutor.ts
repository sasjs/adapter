import { ServerType } from '@sasjs/utils/types'
import { ErrorResponse } from '..'
import { SASViyaApiClient } from '../SASViyaApiClient'
import { ComputeJobExecutionError, LoginRequiredError } from '../types'
import { BaseJobExecutor } from './JobExecutor'

export class ComputeJobExecutor extends BaseJobExecutor {
  constructor(serverUrl: string, private sasViyaApiClient: SASViyaApiClient) {
    super(serverUrl, ServerType.SasViya)
  }

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

        return response.result

        return responseJson
      })
      .catch(async (e: Error) => {
        if (e instanceof ComputeJobExecutionError) {
          this.appendRequest(e, sasJob, config.debug)
        }
        if (e instanceof LoginRequiredError) {
          await loginCallback()
          this.appendWaitingRequest(() =>
            this.execute(sasJob, data, config, loginRequiredCallback)
          )
        }
        return Promise.reject(new ErrorResponse(e?.message, e))
      })
  }
}
