import { ServerType } from '@sasjs/utils/types'
import * as NodeFormData from 'form-data'
import { ErrorResponse } from '../types/errors'
import { convertToCSV, isRelativePath } from '../utils'
import { BaseJobExecutor } from './JobExecutor'
import { Sas9RequestClient } from '../request/Sas9RequestClient'

/**
 * Job executor for SAS9 servers for use in Node.js environments.
 * Initiates login with the provided username and password from the config
 * The cookies are stored in the request client and used in subsequent
 * job execution requests.
 */
export class Sas9JobExecutor extends BaseJobExecutor {
  private requestClient: Sas9RequestClient
  constructor(
    serverUrl: string,
    serverType: ServerType,
    private jobsPath: string
  ) {
    super(serverUrl, serverType)
    this.requestClient = new Sas9RequestClient(serverUrl, false)
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

    let requestParams = {
      ...this.getRequestParams(config)
    }

    let formData = new NodeFormData()

    if (data) {
      try {
        formData = generateFileUploadForm(formData, data)
      } catch (e) {
        return Promise.reject(new ErrorResponse(e?.message, e))
      }
    }

    for (const key in requestParams) {
      if (requestParams.hasOwnProperty(key)) {
        formData.append(key, requestParams[key])
      }
    }

    await this.requestClient.login(
      config.username,
      config.password,
      this.jobsPath
    )
    const contentType =
      data && Object.keys(data).length
        ? 'multipart/form-data; boundary=' + (formData as any)._boundary
        : 'text/plain'
    return await this.requestClient!.post(
      apiUrl,
      formData,
      undefined,
      contentType,
      {
        Accept: '*/*',
        Connection: 'Keep-Alive'
      }
    )
  }

  private getRequestParams(config: any): any {
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
    const csv = convertToCSV(data[tableName])
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
