import { AuthConfig, ServerType } from '@sasjs/utils/types'
import { SASViyaApiClient } from '../SASViyaApiClient'
import {
  ErrorResponse,
  JobExecutionError,
  LoginRequiredError
} from '../types/errors'
import { ExtraResponseAttributes } from '@sasjs/utils/types'
import { BaseJobExecutor } from './JobExecutor'
import { appendExtraResponseAttributes } from '../utils'

export class JesJobExecutor extends BaseJobExecutor {
  constructor(
    serverUrl: string,
    private sasViyaApiClient: SASViyaApiClient
  ) {
    super(serverUrl, ServerType.SasViya)
  }

  async execute(
    sasJob: string,
    data: any,
    config: any,
    loginRequiredCallback?: any,
    authConfig?: AuthConfig,
    extraResponseAttributes: ExtraResponseAttributes[] = []
  ) {
    const loginCallback = loginRequiredCallback || (() => Promise.resolve())

    const requestPromise = new Promise((resolve, reject) => {
      this.sasViyaApiClient
        ?.executeJob(sasJob, config.contextName, config.debug, data, authConfig)
        .then((response: any) => {
          this.sasViyaApiClient.appendRequest(response, sasJob, config.debug)

          const responseObject = appendExtraResponseAttributes(
            response,
            extraResponseAttributes
          )

          resolve(responseObject)
        })
        .catch(async (e: Error) => {
          if (e instanceof JobExecutionError) {
            this.sasViyaApiClient.appendRequest(e, sasJob, config.debug)

            reject(new ErrorResponse(e?.message, e))
          }

          if (e instanceof LoginRequiredError) {
            this.appendWaitingRequest(() => {
              return this.execute(
                sasJob,
                data,
                config,
                loginRequiredCallback,
                authConfig,
                extraResponseAttributes
              ).then(
                (res: any) => {
                  resolve(res)
                },
                (err: any) => {
                  reject(err)
                }
              )
            })

            await loginCallback()
          } else {
            reject(new ErrorResponse(e?.message, e))
          }
        })
    })

    return requestPromise
  }
}
