import { isUrl } from './utils'
import { UploadFile } from './types/UploadFile'
import { ErrorResponse } from './types'
import { RequestClient } from './request/RequestClient'

export class FileUploader {
  constructor(
    private appLoc: string,
    serverUrl: string,
    private jobsPath: string,
    private requestClient: RequestClient
  ) {
    if (serverUrl) isUrl(serverUrl)
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

    const program = this.appLoc
      ? this.appLoc.replace(/\/?$/, '/') + sasJob.replace(/^\//, '')
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

    const headers = {
      'cache-control': 'no-cache',
      Accept: '*/*',
      'Content-Type': 'text/plain'
    }

    return this.requestClient
      .post(uploadUrl, formData, undefined, 'application/json', headers)
      .then((res) => res.result)
      .catch((err: Error) => {
        return Promise.reject(
          new ErrorResponse('File upload request failed', err)
        )
      })
  }
}
