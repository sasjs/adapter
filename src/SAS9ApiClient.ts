/**
 * A client for interfacing with the SAS9 REST API
 *
 */
export class SAS9ApiClient {
  constructor(private serverUrl: string) {}

  /**
   * returns on object containing the server URL
   */
  public getConfig() {
    return {
      serverUrl: this.serverUrl,
    };
  }

  /**
   * Updates serverurl which is not null
   * @param serverUrl - the URL of the server.
   */
  public setConfig(serverUrl: string) {
    if (serverUrl) this.serverUrl = serverUrl;
  }

  /**
   * Executes code on a SAS9 server.
   * @param linesOfCode - an array of lines of code to execute
   * @param serverName - the server to execute the code on
   * @param repositoryName - the repository to execute the code on
   */
  public async executeScript(
    linesOfCode: string[],
    serverName: string,
    repositoryName: string
  ) {
    const requestPayload = linesOfCode.join("\n");
    const executeScriptRequest = {
      method: "PUT",
      headers: {
        Accept: "application/json",
      },
      body: `command=${requestPayload}`,
    };
    const executeScriptResponse = await fetch(
      `${this.serverUrl}/sas/servers/${serverName}/cmd?repositoryName=${repositoryName}`,
      executeScriptRequest
    ).then((res) => res.text());

    return executeScriptResponse;
  }
}
