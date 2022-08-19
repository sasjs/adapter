import {
  getValidJson,
  parseSasViyaDebugResponse,
  parseWeboutResponse,
  SASJS_LOGS_SEPARATOR
} from '../utils'
import { UploadFile } from '../types/UploadFile'
import {
  ErrorResponse,
  JobExecutionError,
  LoginRequiredError
} from '../types/errors'
import { RequestClient } from '../request/RequestClient'
import { ServerType } from '@sasjs/utils/types'
import { BaseJobExecutor } from './JobExecutor'

interface dataFileUpload {
  files: UploadFile[]
  params: { [key: string]: any } | null
}

export class FileUploader extends BaseJobExecutor {
  constructor(
    serverUrl: string,
    serverType: ServerType,
    private jobsPath: string,
    private requestClient: RequestClient
  ) {
    super(serverUrl, serverType)
  }

  public async execute(
    sasJob: string,
    data: any,
    config: any,
    loginRequiredCallback?: any
  ) {
    const { files, params }: dataFileUpload = data
    const loginCallback = loginRequiredCallback || (() => Promise.resolve())

    if (!files?.length)
      throw new ErrorResponse('At least one file must be provided.')

    if (!sasJob || sasJob === '')
      throw new ErrorResponse('sasJob must be provided.')

    let paramsString = ''

    for (let param in params)
      if (params.hasOwnProperty(param))
        paramsString += `&${param}=${params[param]}`

    const program = config.appLoc
      ? config.appLoc.replace(/\/?$/, '/') + sasJob.replace(/^\//, '')
      : sasJob
    const uploadUrl = `${this.jobsPath}/?${
      '_program=' + program
    }${paramsString}`

    const formData = new FormData()

    for (let file of files) {
      formData.append('file', file.file, file.fileName)
    }

    const csrfToken = this.requestClient.getCsrfToken('file')
    if (csrfToken) formData.append('_csrf', csrfToken.value)
    if (config.debug) formData.append('_debug', '131')
    if (config.serverType === ServerType.SasViya && config.contextName)
      formData.append('_contextname', config.contextName)

    const headers = {
      'cache-control': 'no-cache',
      Accept: '*/*',
      'Content-Type': 'text/plain'
    }

    // currently only web approach is supported for file upload
    // therefore log is part of response with debug enabled and must be parsed
    const requestPromise = new Promise((resolve, reject) => {
      this.requestClient
        .post(uploadUrl, formData, undefined, 'application/json', headers)
        .then(async (res: any) => {
          const parsedSasjsLog =
            this.serverType === ServerType.Sasjs
              ? res.log?.split(SASJS_LOGS_SEPARATOR)[1]
              : res.result.log

          const parsedSasjsServerWebout =
            this.serverType === ServerType.Sasjs
              ? typeof res.result === 'string'
                ? getValidJson(res.log?.split(SASJS_LOGS_SEPARATOR)[0])
                : res.result
              : undefined

          const resObj =
            this.serverType === ServerType.Sasjs
              ? {
                  result: parsedSasjsServerWebout,
                  log: parsedSasjsLog
                }
              : res

          this.requestClient.appendRequest(resObj, sasJob, config.debug)

          let jsonResponse = resObj.result

          if (config.debug) {
            switch (this.serverType) {
              case ServerType.SasViya:
                jsonResponse = await parseSasViyaDebugResponse(
                  res.result,
                  this.requestClient,
                  config.serverUrl
                )
                break
              case ServerType.Sas9:
                jsonResponse =
                  typeof res.result === 'string'
                    ? parseWeboutResponse(res.result, uploadUrl)
                    : res.result
                break
            }
          }

          resolve(jsonResponse)
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

            await loginCallback()
          } else {
            reject(new ErrorResponse('File upload request failed.', e))
          }
        })
    })
    return requestPromise
  }
}
