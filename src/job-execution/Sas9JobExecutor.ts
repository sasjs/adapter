import * as https from 'https'
import { ServerType } from '@sasjs/utils/types'
import NodeFormData from 'form-data'
import { ErrorResponse } from '../types/errors'
import { convertToCSV, isRelativePath } from '../utils'
import { BaseJobExecutor } from './JobExecutor'
import { Sas9RequestClient } from '../request/Sas9RequestClient'
import { RequestClient } from '../request/RequestClient'

/**
 * Job executor for SAS9 servers for use in Node.js environments.
 * Initiates login with the provided username and password from the config
 * The cookies are stored in the request client and used in subsequent
 * job execution requests.
 */
export class Sas9JobExecutor extends BaseJobExecutor {
  private sas9RequestClient: Sas9RequestClient
  constructor(
    serverUrl: string,
    serverType: ServerType,
    private jobsPath: string,
    private requestClient: RequestClient,
    httpsAgentOptions?: https.AgentOptions
  ) {
    super(serverUrl, serverType)
    this.sas9RequestClient = new Sas9RequestClient(serverUrl, httpsAgentOptions)
  }

  async execute(sasJob: string, data: any, config: any) {
    const program = isRelativePath(sasJob)
      ? config.appLoc
        ? config.appLoc.replace(/\/?$/, '/') + sasJob.replace(/^\//, '')
        : sasJob
      : sasJob
    let apiUrl = `${config.serverUrl}${this.jobsPath}?${'_program=' + program}`
    apiUrl = `${apiUrl}${
      config.username && config.password
        ? '&_username=' + config.username + '&_password=' + config.password
        : ''
    }`

    apiUrl = `${apiUrl}${config.debug ? '&_debug=131' : ''}`

    let requestParams = {
      ...this.getRequestParams(config)
    }

    let formData = new NodeFormData()

    if (data) {
      try {
        formData = generateFileUploadForm(formData, data)
      } catch (e: any) {
        return Promise.reject(new ErrorResponse(e?.message, e))
      }
    } else {
      data = ''
    }

    for (const key in requestParams) {
      if (requestParams.hasOwnProperty(key)) {
        formData.append(key, requestParams[key])
      }
    }

    await this.sas9RequestClient.login(
      config.username,
      config.password,
      this.jobsPath
    )

    const contentType =
      data && Object.keys(data).length
        ? 'multipart/form-data; boundary=' + (formData as any)._boundary
        : 'text/plain'

    const requestPromise = new Promise((resolve, reject) =>
      this.sas9RequestClient!.post(apiUrl, formData, undefined, contentType, {
        Accept: '*/*',
        Connection: 'Keep-Alive'
      })
        .then((res: any) => {
          // appending response to requests array that will be used for requests history reference
          this.requestClient!.appendRequest(res, sasJob, config.debug)
          resolve(res)
        })
        .catch((err: any) => {
          // by default error string is equal to actual error object
          let errString = err

          // if error object contains non empty result attribute, set result to errString
          if (err.result && err.result !== '') errString = err.result
          // if there's no result but error message, set error message to errString
          else if (err.message) errString = err.message

          // appending error to requests array that will be used for requests history reference
          this.requestClient!.appendRequest(errString, sasJob, config.debug)
          reject(new ErrorResponse(err?.message, err))
        })
    )

    return requestPromise
  }

  protected getRequestParams(config: any): any {
    const requestParams: any = {}

    if (config.debug) {
      requestParams['_debug'] = 131
    }

    return requestParams
  }
}

const generateFileUploadForm = (
  formData: NodeFormData,
  data: any
): NodeFormData => {
  for (const tableName in data) {
    const name = tableName
    const csv = convertToCSV(data, tableName)

    if (csv === 'ERROR: LARGE STRING LENGTH') {
      throw new Error(
        'The max length of a string value in SASjs is 32765 characters.'
      )
    }

    formData.append(name, csv, {
      filename: `${name}.csv`,
      contentType: 'application/csv'
    })
  }

  return formData
}
