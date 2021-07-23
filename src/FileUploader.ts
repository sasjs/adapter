import { isUrl, getValidJson, parseSasViyaDebugResponse } from './utils'
import { UploadFile } from './types/UploadFile'
import { ErrorResponse, LoginRequiredError } from './types/errors'
import { RequestClient } from './request/RequestClient'
import { ServerType } from '@sasjs/utils/types'
import SASjs from './SASjs'
import { Server } from 'https'
import { SASjsConfig } from './types'
import { config } from 'process'

export class FileUploader {
  constructor(
    private sasjsConfig: SASjsConfig,
    private jobsPath: string,
    private requestClient: RequestClient
  ) {
    if (this.sasjsConfig.serverUrl) isUrl(this.sasjsConfig.serverUrl)
  }

  public uploadFile(sasJob: string, files: UploadFile[], params: any) {
    if (files?.length < 1)
      return Promise.reject(
        new ErrorResponse('At least one file must be provided.')
      )
    if (!sasJob || sasJob === '')
      return Promise.reject(new ErrorResponse('sasJob must be provided.'))

    let paramsString = ''

    for (let param in params) {
      if (params.hasOwnProperty(param)) {
        paramsString += `&${param}=${params[param]}`
      }
    }

    const program = this.sasjsConfig.appLoc
      ? this.sasjsConfig.appLoc.replace(/\/?$/, '/') + sasJob.replace(/^\//, '')
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
    if (this.sasjsConfig.debug) formData.append('_debug', '131')
    if (
      this.sasjsConfig.serverType === ServerType.SasViya &&
      this.sasjsConfig.contextName
    )
      formData.append('_contextname', this.sasjsConfig.contextName)

    const headers = {
      'cache-control': 'no-cache',
      Accept: '*/*',
      'Content-Type': 'text/plain'
    }

    return this.requestClient
      .post(uploadUrl, formData, undefined, 'application/json', headers)
      .then(async (res) => {
        // for web approach on Viya
        if (
          this.sasjsConfig.debug &&
          (this.sasjsConfig.useComputeApi === null ||
            this.sasjsConfig.useComputeApi === undefined) &&
          this.sasjsConfig.serverType === ServerType.SasViya
        ) {
          const jsonResponse = await parseSasViyaDebugResponse(
            res.result as string,
            this.requestClient,
            this.sasjsConfig.serverUrl
          )
          return typeof jsonResponse === 'string'
            ? getValidJson(jsonResponse)
            : jsonResponse
        }

        return typeof res.result === 'string'
          ? getValidJson(res.result)
          : res.result

        //TODO: append to SASjs requests
      })
      .catch((err: Error) => {
        if (err instanceof LoginRequiredError) {
          return Promise.reject(
            new ErrorResponse('You must be logged in to upload a file.', err)
          )
        }
        return Promise.reject(
          new ErrorResponse('File upload request failed.', err)
        )
      })
  }
}
