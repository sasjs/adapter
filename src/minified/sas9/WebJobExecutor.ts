import {
  AuthConfig,
  ExtraResponseAttributes,
  ServerType
} from '@sasjs/utils/types'
import {
  ErrorResponse,
  JobExecutionError,
  LoginRequiredError
} from '../../types/errors'
import { RequestClient } from '../../request/RequestClient'
import {
  isRelativePath,
  parseSasViyaDebugResponse,
  appendExtraResponseAttributes,
  convertToCSV
} from '../../utils'
import { BaseJobExecutor } from '../../job-execution/JobExecutor'
import { parseWeboutResponse } from '../../utils/parseWeboutResponse'

export interface WaitingRequstPromise {
  promise: Promise<any> | null
  resolve: any
  reject: any
}
export class WebJobExecutor extends BaseJobExecutor {
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
    const loginCallback = loginRequiredCallback
    const program = isRelativePath(sasJob)
      ? config.appLoc
        ? config.appLoc.replace(/\/?$/, '/') + sasJob.replace(/^\//, '')
        : sasJob
      : sasJob
    let apiUrl = `${config.serverUrl}${this.jobsPath}/?${'_program=' + program}`

    let requestParams = {
      ...this.getRequestParams(config)
    }

    let formData = new FormData()

    if (data) {
      try {
        formData = generateFileUploadForm(formData, data)
      } catch (e: any) {
        return Promise.reject(new ErrorResponse(e?.message, e))
      }
    }

    for (const key in requestParams) {
      if (requestParams.hasOwnProperty(key)) {
        formData.append(key, requestParams[key])
      }
    }

    const requestPromise = new Promise((resolve, reject) => {
      this.requestClient!.post(apiUrl, formData, authConfig?.access_token)
        .then(async (res: any) => {
          this.requestClient!.appendRequest(res, sasJob, config.debug)

          const jsonResponse =
            config.debug && typeof res.result === 'string'
              ? parseWeboutResponse(res.result, apiUrl)
              : res.result

          const responseObject = appendExtraResponseAttributes(
            { result: jsonResponse, log: res.log },
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
            if (!loginRequiredCallback) {
              reject(
                new ErrorResponse(
                  'Request is not authenticated. Make sure .env file exists with valid credentials.',
                  e
                )
              )
            }

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

            if (loginCallback) await loginCallback()
          } else reject(new ErrorResponse(e?.message, e))
        })
    })

    return requestPromise
  }
}

/**
 * One of the approaches SASjs takes to send tables-formatted JSON (see README)
 * to SAS is as multipart form data, where each table is provided as a specially
 * formatted CSV file.
 */
const generateFileUploadForm = (formData: FormData, data: any): FormData => {
  for (const tableName in data) {
    if (!Array.isArray(data[tableName])) continue

    const name = tableName
    const csv = convertToCSV(data, tableName)

    if (csv === 'ERROR: LARGE STRING LENGTH') {
      throw new Error(
        'The max length of a string value in SASjs is 32765 characters.'
      )
    }

    const file = new Blob([csv], {
      type: 'application/csv'
    })

    formData.append(name, file, `${name}.csv`)
  }

  return formData
}
