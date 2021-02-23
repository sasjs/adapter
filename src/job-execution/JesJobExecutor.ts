import { ServerType } from '@sasjs/utils/types'
import { ErrorResponse } from '..'
import { SASViyaApiClient } from '../SASViyaApiClient'
import { JobExecutionError, LoginRequiredError } from '../types'
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

    const requestPromise = new Promise((resolve, reject) => {
      this.sasViyaApiClient
        ?.executeJob(
          sasJob,
          config.contextName,
          config.debug,
          data,
          accessToken
        )
        .then((response) => {
          this.appendRequest(response, sasJob, config.debug)

          resolve(response.result)
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
          }
        })
    })

    return requestPromise
  }
}
