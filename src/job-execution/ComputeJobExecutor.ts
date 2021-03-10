import { ServerType } from '@sasjs/utils/types'
import { SASViyaApiClient } from '../SASViyaApiClient'
import {
  ErrorResponse,
  ComputeJobExecutionError,
  LoginRequiredError
} from '../types/errors'
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

    const requestPromise = new Promise((resolve, reject) => {
      this.sasViyaApiClient
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

          resolve(response.result)
        })
        .catch(async (e: Error) => {
          if (e instanceof ComputeJobExecutionError) {
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
}
