import {
  AuthConfig,
  ExtraResponseAttributes,
  ServerType
} from '@sasjs/utils/types'
import {
  ErrorResponse,
  JobExecutionError,
  LoginRequiredError
} from '../types/errors'
import { RequestClient } from '../request/RequestClient'
import {
  isRelativePath,
  appendExtraResponseAttributes,
  getValidJson
} from '../utils'
import { BaseJobExecutor } from './JobExecutor'
import { parseWeboutResponse } from '../utils/parseWeboutResponse'

export class SasJsJobExecutor extends BaseJobExecutor {
  constructor(
    serverUrl: string,
    serverType: ServerType,
    private jobsPath: string,
    private requestClient: RequestClient
  ) {
    super(serverUrl, serverType)
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
    const program = isRelativePath(sasJob)
      ? config.appLoc
        ? config.appLoc.replace(/\/?$/, '/') + sasJob.replace(/^\//, '')
        : sasJob
      : sasJob
    let apiUrl = `${config.serverUrl}${this.jobsPath}/?${'_program=' + program}`

    const requestParams = this.getRequestParams(config)

    const requestPromise = new Promise((resolve, reject) => {
      this.requestClient!.post(
        apiUrl,
        { ...requestParams, ...data },
        authConfig?.access_token
      )
        .then(async (res: any) => {
          const parsedSasjsServerLog = res.result.log
            .map((logLine: any) => logLine.line)
            .join('\n')

          const resObj = {
            result: res.result._webout,
            log: parsedSasjsServerLog
          }
          this.requestClient!.appendRequest(resObj, sasJob, config.debug)

          let jsonResponse = res.result

          if (config.debug) {
            if (typeof res.result._webout === 'object') {
              jsonResponse = res.result._webout
            } else {
              const webout = parseWeboutResponse(res.result._webout, apiUrl)
              jsonResponse = getValidJson(webout)
            }
          } else {
            jsonResponse = getValidJson(res.result._webout)
          }

          const responseObject = appendExtraResponseAttributes(
            { result: jsonResponse },
            extraResponseAttributes
          )
          resolve(responseObject)
        })
        .catch(async (e: Error) => {
          if (e instanceof JobExecutionError) {
            this.requestClient!.appendRequest(e, sasJob, config.debug)
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

  private getRequestParams(config: any): any {
    const requestParams: any = {}

    if (config.debug) {
      requestParams['_omittextlog'] = 'false'
      requestParams['_omitsessionresults'] = 'false'

      requestParams['_debug'] = 131
    }

    return requestParams
  }
}
