import * as NodeFormData from 'form-data'
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
import { generateFileUploadForm } from '../file/generateFileUploadForm'
import { RequestClient } from '../request/RequestClient'
import { getFormData } from '../utils'

import {
  isRelativePath,
  appendExtraResponseAttributes,
  getValidJson
} from '../utils'
import { BaseJobExecutor } from './JobExecutor'

export class SasjsJobExecutor extends BaseJobExecutor {
  constructor(
    serverUrl: string,
    private jobsPath: string,
    private requestClient: RequestClient
  ) {
    super(serverUrl, ServerType.Sasjs)
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
    const program =
      isRelativePath(sasJob) && config.appLoc
        ? config.appLoc.replace(/\/?$/, '/') + sasJob.replace(/^\//, '')
        : sasJob

    let apiUrl = `${config.serverUrl}${this.jobsPath}/?${'_program=' + program}`

    let requestParams = {
      ...this.getRequestParams(config)
    }

    /**
     * Use the available form data object (FormData in Browser, NodeFormData in
     *  Node)
     */
    let formData = getFormData()

    if (data) {
      // file upload approach
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

    /* The NodeFormData object does not set the request header - so, set it */
    const contentType =
      formData instanceof NodeFormData && typeof FormData === 'undefined'
        ? `multipart/form-data; boundary=${formData.getBoundary()}`
        : undefined

    const requestPromise = new Promise((resolve, reject) => {
      this.requestClient!.post(
        apiUrl,
        formData,
        authConfig?.access_token,
        contentType
      )
        .then(async (res: any) => {
          if (Object.entries(res.result).length < 1) {
            throw new JobExecutionError(
              0,
              `No webout was returned by job ${program}.  Please check the SAS log for more info.`,
              res.log
            )
          }

          const { result } = res

          if (result && typeof result === 'string' && result.trim())
            res.result = getValidJson(result)

          this.requestClient!.appendRequest(res, sasJob, config.debug)

          const responseObject = appendExtraResponseAttributes(
            res,
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
