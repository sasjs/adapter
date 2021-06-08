import { ServerType } from '@sasjs/utils/types'
import { SASViyaApiClient } from '../SASViyaApiClient'
import {
  ErrorResponse,
  JobExecutionError,
  LoginRequiredError
} from '../types/errors'
import { ExtraResponseAttributes } from '../types/ExtraResponseAttributes'
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
    accessToken?: string,
    extraResponseAttributes: ExtraResponseAttributes[] = []
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
        .then((response: any) => {
          this.appendRequest(response, sasJob, config.debug)

          let responseObject = {}

          if (extraResponseAttributes && extraResponseAttributes.length > 0) {
            const extraAttributes = extraResponseAttributes.reduce(
              (map: any, obj: any) => ((map[obj] = response[obj]), map),
              {}
            )

            responseObject = {
              result: response.result,
              ...extraAttributes
            }
          } else {
            responseObject = response.result
          }

          resolve(responseObject)
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
                loginRequiredCallback,
                accessToken,
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
          } else {
            reject(new ErrorResponse(e?.message, e))
          }
        })
    })

    return requestPromise
  }
}
