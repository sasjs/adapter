import { ServerType } from '@sasjs/utils/types'
import { ErrorResponse } from '..'
import { SASViyaApiClient } from '../SASViyaApiClient'
import { JobExecutionError, LoginRequiredError } from '../types'
import { parseWeboutResponse } from '../utils'
import { BaseJobExecutor } from './JobExecutor'

export class JesJobExecutor extends BaseJobExecutor {
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
    return await this.sasViyaApiClient
      ?.executeJob(sasJob, config.contextName, config.debug, data, accessToken)
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
        if (e instanceof JobExecutionError) {
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
