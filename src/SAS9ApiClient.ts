import { generateTimestamp } from '@sasjs/utils/time'
import * as NodeFormData from 'form-data'
import { Sas9RequestClient } from './request/Sas9RequestClient'
import { isUrl } from './utils'

/**
 * A client for interfacing with the SAS9 REST API.
 *
 */
export class SAS9ApiClient {
  private requestClient: Sas9RequestClient

  constructor(private serverUrl: string, private jobsPath: string) {
    if (serverUrl) isUrl(serverUrl)
    this.requestClient = new Sas9RequestClient(serverUrl, false)
  }

  /**
   * Returns an object containing server URL.
   */
  public getConfig() {
    return {
      serverUrl: this.serverUrl
    }
  }

  /**
   * Updates server URL which is not null.
   * @param serverUrl - URL of the server to be set.
   */
  public setConfig(serverUrl: string) {
    if (serverUrl) this.serverUrl = serverUrl
  }

  /**
   * Executes code on a SAS9 server.
   * @param linesOfCode - an array of code lines to execute.
   * @param userName - the user name to log into the current SAS server.
   * @param password - the password to log into the current SAS server.
   */
  public async executeScript(
    linesOfCode: string[],
    userName: string,
    password: string
  ) {
    await this.requestClient.login(userName, password, this.jobsPath)

    const formData = generateFileUploadForm(linesOfCode.join('\n'))

    const codeInjectorPath = `/User Folders/${userName}/My Folder/sasjs/runner`
    const contentType =
      'multipart/form-data; boundary=' + formData.getBoundary()
    const contentLength = formData.getLengthSync()

    const headers = {
      'cache-control': 'no-cache',
      Accept: '*/*',
      'Content-Type': contentType,
      'Content-Length': contentLength,
      Connection: 'keep-alive'
    }
    const storedProcessUrl = `${this.jobsPath}/?${
      '_program=' + codeInjectorPath + '&_debug=log'
    }`
    const response = await this.requestClient.post(
      storedProcessUrl,
      formData,
      undefined,
      contentType,
      headers
    )

    return response.result as string
  }
}

const generateFileUploadForm = (data: any): NodeFormData => {
  const formData = new NodeFormData()
  const fileName = `sasjs-execute-sas9-${generateTimestamp('')}.sas`
  formData.append(fileName, data, {
    filename: `${fileName}.csv`,
    contentType: 'text/plain'
  })

  return formData
}
