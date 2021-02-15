import axios, { AxiosInstance } from 'axios'
import { isUrl } from './utils'

/**
 * A client for interfacing with the SAS9 REST API.
 *
 */
export class SAS9ApiClient {
  private httpClient: AxiosInstance

  constructor(private serverUrl: string) {
    if (serverUrl) isUrl(serverUrl)
    this.httpClient = axios.create({ baseURL: this.serverUrl })
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
   * @param serverName - the server to execute the code on.
   * @param repositoryName - the repository to execute the code in.
   */
  public async executeScript(
    linesOfCode: string[],
    serverName: string,
    repositoryName: string
  ) {
    const requestPayload = linesOfCode.join('\n')

    const executeScriptResponse = await this.httpClient.put(
      `/sas/servers/${serverName}/cmd?repositoryName=${repositoryName}`,
      `command=${requestPayload}`,
      {
        headers: {
          Accept: 'application/json'
        },
        responseType: 'text'
      }
    )

    return executeScriptResponse.data
  }
}
