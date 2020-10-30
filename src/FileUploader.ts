import { isLogInRequired, needsRetry, isUrl } from './utils'
import { CsrfToken } from './types/CsrfToken'
import { UploadFile } from './types/UploadFile'
import { ErrorResponse } from './types'

const requestRetryLimit = 5

export class FileUploader {
  constructor(
    private appLoc: string,
    private serverUrl: string,
    private jobsPath: string,
    private setCsrfTokenWeb: any,
    private csrfToken: CsrfToken | null = null
  ) {
    if (serverUrl) isUrl(serverUrl)
  }

  private retryCount = 0

  public uploadFile(sasJob: string, files: UploadFile[], params: any) {
    return new Promise((resolve, reject) => {
      if (files?.length < 1) reject(new ErrorResponse('At least one file must be provided.'))
      if (!sasJob || sasJob === '') reject(new ErrorResponse('sasJob must be provided.'))

      let paramsString = ''

      for (let param in params) {
        if (params.hasOwnProperty(param)) {
          paramsString += `&${param}=${params[param]}`
        }
      }

      const program = this.appLoc
        ? this.appLoc.replace(/\/?$/, '/') + sasJob.replace(/^\//, '')
        : sasJob
      const uploadUrl = `${this.serverUrl}${this.jobsPath}/?${
        '_program=' + program
      }${paramsString}`

      const headers = {
        'cache-control': 'no-cache'
      }

      const formData = new FormData()

      for (let file of files) {
        formData.append('file', file.file, file.fileName)
      }

      if (this.csrfToken) formData.append('_csrf', this.csrfToken.value)
      
      fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        referrerPolicy: 'same-origin',
        headers
      })
        .then(async (response) => {
          if (!response.ok) {
            if (response.status === 403) {
              const tokenHeader = response.headers.get('X-CSRF-HEADER')

              if (tokenHeader) {
                const token = response.headers.get(tokenHeader)
                this.csrfToken = {
                  headerName: tokenHeader,
                  value: token || ''
                }

                this.setCsrfTokenWeb(this.csrfToken)
              }
            }
          }

          return response.text()
        })
        .then((responseText) => {
          if (isLogInRequired(responseText))
            reject(new ErrorResponse('You must be logged in to upload a file.'))

          if (needsRetry(responseText)) {
            if (this.retryCount < requestRetryLimit) {
              this.retryCount++
              this.uploadFile(sasJob, files, params).then(
                (res: any) => resolve(res),
                (err: any) => reject(err)
              )
            } else {
              this.retryCount = 0
              reject(responseText)
            }
          } else {
            this.retryCount = 0

            try {
              resolve(JSON.parse(responseText))
            } catch (e) {
              reject(new ErrorResponse('Error while parsing json from upload response.', e))
            }
          }
        })
        .catch((err: any) => {
          reject(new ErrorResponse('Upload request failed.', err))
        })
    })
  }
}
