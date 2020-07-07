import {
  isAuthorizeFormRequired,
  parseAndSubmitAuthorizeForm,
  convertToCSV,
  makeRequest,
} from "./utils";
import * as NodeFormData from "form-data";
import * as path from "path";
import { Job, Session, Context, Folder } from "./types";

/**
 * A client for interfacing with the SAS Viya REST API
 *
 */
export class SASViyaApiClient {
  constructor(
    private serverUrl: string,
    private rootFolderName: string,
    private rootFolderMap = new Map<string, Job[]>()
  ) {
    if (!rootFolderName) {
      throw new Error("Root folder must be provided.");
    }
  }
  private csrfToken: { headerName: string; value: string } | null = null;
  private rootFolder: Folder | null = null;

  /**
   * Returns a map containing the directory structure in the currently set root folder.
   */
  public async getAppLocMap() {
    if (this.rootFolderMap.size) {
      return this.rootFolderMap;
    }
    
    this.populateRootFolderMap();
    return this.rootFolderMap;
  }

  /**
   * returns an object containing the Server URL and root folder name
   */
  public getConfig() {
    return {
      serverUrl: this.serverUrl,
      rootFolderName: this.rootFolderName,
    };
  }

  /**
   * Updates server URL or root folder name when not null
   * @param serverUrl - the URL of the server.
   * @param rootFolderName - the name for rootFolderName.
   */
  public setConfig(serverUrl: string, rootFolderName: string) {
    if (serverUrl) this.serverUrl = serverUrl;
    if (rootFolderName) this.rootFolderName = rootFolderName;
  }

  /**
   * Returns all available compute contexts on this server.
   * @param accessToken - an access token for an authorized user.
   */
  public async getAllContexts(accessToken?: string) {
    const headers: any = {
      "Content-Type": "application/json",
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    const contexts = await this.request<{ items: Context[] }>(
      `${this.serverUrl}/compute/contexts`,
      { headers }
    );
    const contextsList = contexts && contexts.items ? contexts.items : [];
    return contextsList.map((context: any) => ({
      createdBy: context.createdBy,
      id: context.id,
      name: context.name,
      version: context.version,
      attributes: {},
    }));
  }

  /**
   * Returns all compute contexts on this server that the user has access to.
   * @param accessToken - an access token for an authorized user.
   */
  public async getExecutableContexts(accessToken?: string) {
    const headers: any = {
      "Content-Type": "application/json",
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    const contexts = await this.request<{ items: Context[] }>(
      `${this.serverUrl}/compute/contexts`,
      { headers }
    );
    const contextsList = contexts && contexts.items ? contexts.items : [];
    const executableContexts: any[] = [];

    const promises = contextsList.map((context: any) => {
      const linesOfCode = ["%put &=sysuserid;"];
      return this.executeScript(
        `test-${context.name}`,
        linesOfCode,
        context.name,
        accessToken,
        undefined,
        true
      ).catch(() => null);
    });
    const results = await Promise.all(promises);
    results.forEach((result: any, index: number) => {
      if (result && result.jobStatus === "completed") {
        let sysUserId = "";
        if (result && result.log && result.log.items) {
          const sysUserIdLog = result.log.items.find((i: any) =>
            i.line.startsWith("SYSUSERID=")
          );
          if (sysUserIdLog) {
            sysUserId = sysUserIdLog.line.replace("SYSUSERID=", "");
          }
        }

        executableContexts.push({
          createdBy: contextsList[index].createdBy,
          id: contextsList[index].id,
          name: contextsList[index].name,
          version: contextsList[index].version,
          attributes: {
            sysUserId,
          },
        });
      }
    });

    return executableContexts;
  }

  /**
   * Creates a session on the given context.
   * @param contextName - the name of the context to create a session on.
   * @param accessToken - an access token for an authorized user.
   */
  public async createSession(contextName: string, accessToken?: string) {
    const headers: any = {
      "Content-Type": "application/json",
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const contexts = await this.request<{ items: Context[] }>(
      `${this.serverUrl}/compute/contexts`,
      { headers }
    );
    const executionContext =
      contexts.items && contexts.items.length
        ? contexts.items.find((c: any) => c.name === contextName)
        : null;
    if (!executionContext) {
      throw new Error(`Execution context ${contextName} not found.`);
    }

    const createSessionRequest = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    };
    const createdSession = this.request<Session>(
      `${this.serverUrl}/compute/contexts/${executionContext.id}/sessions`,
      createSessionRequest
    );

    return createdSession;
  }

  /**
   * Executes code on the current SAS Viya server.
   * @param fileName - a name for the file being submitted for execution.
   * @param linesOfCode - an array of lines of code to execute.
   * @param contextName - the context to execute the code in.
   * @param accessToken - an access token for an authorized user.
   * @param sessionId - optional session ID to reuse.
   * @param silent - optional flag to turn of logging.
   */
  public async executeScript(
    fileName: string,
    linesOfCode: string[],
    contextName: string,
    accessToken?: string,
    sessionId = "",
    silent = false
  ) {
    const headers: any = {
      "Content-Type": "application/json",
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    if (this.csrfToken) {
      headers[this.csrfToken.headerName] = this.csrfToken.value;
    }
    const contexts = await this.request<{ items: Context[] }>(
      `${this.serverUrl}/compute/contexts`,
      { headers }
    );
    const executionContext =
      contexts.items && contexts.items.length
        ? contexts.items.find((c: any) => c.name === contextName)
        : null;

    if (executionContext) {
      // Request new session in context or use the ID passed in
      let executionSessionId: string;
      if (sessionId) {
        executionSessionId = sessionId;
      } else {
        const createSessionRequest = {
          method: "POST",
          headers,
        };
        const createdSession = await this.request<Session>(
          `${this.serverUrl}/compute/contexts/${executionContext.id}/sessions`,
          createSessionRequest
        );

        executionSessionId = createdSession.id;
      }
      // Execute job in session
      const postJobRequest = {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: fileName,
          description: "Powered by SASjs",
          code: linesOfCode,
        }),
      };
      const postedJob = await this.request<Job>(
        `${this.serverUrl}/compute/sessions/${executionSessionId}/jobs`,
        postJobRequest
      );
      if (!silent) {
        console.log(`Job has been submitted for ${fileName}`);
        console.log(
          `You can monitor the job progress at ${this.serverUrl}${
            postedJob.links.find((l: any) => l.rel === "state")!.href
          }`
        );
      }

      const jobStatus = await this.pollJobState(postedJob, accessToken, silent);
      const logLink = postedJob.links.find((l: any) => l.rel === "log");
      if (logLink) {
        const log = await this.request(
          `${this.serverUrl}${logLink.href}?limit=100000`,
          {
            headers,
          }
        );

        return { jobStatus, log };
      }
    } else {
      console.error(
        `Unable to find execution context ${contextName}.\nPlease check the contextName in the tgtDeployVars and try again.`
      );
      console.error("Response from server: ", JSON.stringify(contexts));
    }
  }

  /**
   * Creates a folder in the specified location.  Either parentFolderPath or 
   *   parentFolderUri must be provided.  
   * @param folderName - the name of the new folder.
   * @param parentFolderPath - the full path to the parent folder.  If not 
   *  provided, the parentFolderUri must be provided.
   * @param parentFolderUri - the URI (eg /folders/folders/UUID) of the parent 
   *  folder.  If not provided, the parentFolderPath must be provided.
   */
  public async createFolder(
    folderName: string,
    parentFolderPath?: string,
    parentFolderUri?: string,
    accessToken?: string
  ): Promise<Folder> {
    if (!parentFolderPath && !parentFolderUri) {
      throw new Error("Parent folder path or uri is required");
    }

    if (!parentFolderUri && parentFolderPath) {
      parentFolderUri = await this.getFolderUri(parentFolderPath, accessToken);
      if (!parentFolderUri){
        console.log(`Parent folder is not present: ${parentFolderPath}`);

        const newParentFolderPath = parentFolderPath.substring(0, parentFolderPath.lastIndexOf("/"));
        const newFolderName = `${parentFolderPath.split("/").pop()}`;
        if (newParentFolderPath === ""){
          throw new Error("Root Folder should have been present on server");
        }
        console.log(`Creating Parent Folder:\n${newFolderName} in ${newParentFolderPath}`)
        const parentFolder = await this.createFolder(newFolderName, newParentFolderPath, undefined, accessToken)
        console.log(`Parent Folder "${newFolderName}" successfully created.`)
        parentFolderUri = `/folders/folders/${parentFolder.id}`;
      }
    }

    const createFolderRequest: RequestInit = {
      method: "POST",
      body: JSON.stringify({
        name: folderName,
        type: "folder",
      }),
    };

    createFolderRequest.headers = { "Content-Type": "application/json" };
    if (accessToken) {
      createFolderRequest.headers.Authorization = `Bearer ${accessToken}`;
    }

    const createFolderResponse = await this.request<Folder>(
      `${this.serverUrl}/folders/folders?parentFolderUri=${parentFolderUri}`,
      createFolderRequest
    );

    // update rootFolderMap with newly created folder.
    await this.populateRootFolderMap(accessToken);
    return createFolderResponse;
  }

  /**
   * Creates a Job in the specified folder (or folder uri).
   * @param parentFolderPath - the location of the new job.
   * @param parentFolderUri - the URI location of the new job. The function is a
   * little faster if the folder URI is supplied instead of the path.
   * @param jobName - the name of the new job to be created.
   * @param code - the SAS code for the new job.
   */
  public async createJobDefinition(
    jobName: string,
    code: string,
    parentFolderPath?: string,
    parentFolderUri?: string,
    accessToken?: string
  ) {
    if (!parentFolderPath && !parentFolderUri) {
      throw new Error('Either parentFolderPath or parentFolderUri must be provided');
    }

    if (!parentFolderUri && parentFolderPath) {
      parentFolderUri = await this.getFolderUri(parentFolderPath, accessToken);
    }

    const createJobDefinitionRequest: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.sas.job.definition+json",
        Accept: "application/vnd.sas.job.definition+json",
      },
      body: JSON.stringify({
        name: jobName,
        parameters:[
          {
            "name":"_addjesbeginendmacros",
            "type":"CHARACTER",
            "defaultValue":"false"
          }
        ],
        type: "Compute",
        code,
      }),
    };

    if (accessToken) {
      createJobDefinitionRequest!.headers = {
        ...createJobDefinitionRequest.headers,
        Authorization: `Bearer ${accessToken}`,
      };
    }

    return await this.request<Job>(
      `${this.serverUrl}/jobDefinitions/definitions?parentFolderUri=${parentFolderUri}`,
      createJobDefinitionRequest
    );
  }

  /**
   * Performs a login redirect and returns an auth code for the given client
   * @param clientId - the client ID to authenticate with.
   */
  public async getAuthCode(clientId: string) {
    const authUrl = `${this.serverUrl}/SASLogon/oauth/authorize?client_id=${clientId}&response_type=code`;

    const authCode = await fetch(authUrl, {
      referrerPolicy: "same-origin",
      credentials: "include",
    })
      .then((response) => response.text())
      .then(async (response) => {
        let code = "";
        if (isAuthorizeFormRequired(response)) {
          const formResponse: any = await parseAndSubmitAuthorizeForm(
            response,
            this.serverUrl
          );

          const responseBody = formResponse
            .split("<body>")[1]
            .split("</body>")[0];
          const bodyElement: any = document.createElement("div");
          bodyElement.innerHTML = responseBody;

          code = bodyElement.querySelector(".infobox h4").innerText;

          return code;
        } else {
          const responseBody = response.split("<body>")[1].split("</body>")[0];
          const bodyElement: any = document.createElement("div");
          bodyElement.innerHTML = responseBody;

          if (bodyElement) {
            code = bodyElement.querySelector(".infobox h4").innerText;
          }

          return code;
        }
      })
      .catch(() => null);

    return authCode;
  }

  /**
   * Exchanges the auth code for an access token for the given client.
   * @param clientId - the client ID to authenticate with.
   * @param clientSecret - the client secret to authenticate with.
   * @param authCode - the auth code received from the server.
   */
  public async getAccessToken(
    clientId: string,
    clientSecret: string,
    authCode: string
  ) {
    const url = this.serverUrl + "/SASLogon/oauth/token";
    let token;
    if (typeof Buffer === "undefined") {
      token = btoa(clientId + ":" + clientSecret);
    } else {
      token = Buffer.from(clientId + ":" + clientSecret).toString("base64");
    }
    const headers = {
      Authorization: "Basic " + token,
    };

    let formData;
    if (typeof FormData === "undefined") {
      formData = new NodeFormData();
      formData.append("grant_type", "authorization_code");
      formData.append("code", authCode);
    } else {
      formData = new FormData();
      formData.append("grant_type", "authorization_code");
      formData.append("code", authCode);
    }

    const authResponse = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers,
      body: formData as any,
      referrerPolicy: "same-origin",
    }).then((res) => res.json());

    return authResponse;
  }

  /**
   * Exchanges the refresh token for an access token for the given client.
   * @param clientId - the client ID to authenticate with.
   * @param clientSecret - the client secret to authenticate with.
   * @param authCode - the refresh token received from the server.
   */
  public async refreshTokens(
    clientId: string,
    clientSecret: string,
    refreshToken: string
  ) {
    const url = this.serverUrl + "/SASLogon/oauth/token";
    let token;
    if (typeof Buffer === "undefined") {
      token = btoa(clientId + ":" + clientSecret);
    } else {
      token = Buffer.from(clientId + ":" + clientSecret).toString("base64");
    }
    const headers = {
      Authorization: "Basic " + token,
    };

    let formData;
    if (typeof FormData === "undefined") {
      formData = new NodeFormData();
      formData.append("grant_type", "refresh_token");
      formData.append("refresh_token", refreshToken);
    } else {
      formData = new FormData();
      formData.append("grant_type", "refresh_token");
      formData.append("refresh_token", refreshToken);
    }

    const authResponse = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers,
      body: formData as any,
      referrerPolicy: "same-origin",
    }).then((res) => res.json());

    return authResponse;
  }

  /**
   * Deletes the client representing the supplied ID.
   * @param clientId - the client ID to authenticate with.
   * @param accessToken - an access token for an authorized user.
   */
  public async deleteClient(clientId: string, accessToken?: string) {
    const url = this.serverUrl + `/oauth/clients/${clientId}`;
    const headers: any = {};
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    const deleteResponse = await this.request(url, {
      method: "DELETE",
      credentials: "include",
      headers,
    });

    return deleteResponse;
  }

  /**
   * Executes a job via the SAS Viya Job Execution API
   * @param sasJob - the relative path to the job.
   * @param contextName - the name of the context where the job is to be executed.
   * @param debug - sets the _debug flag in the job arguments.
   * @param data - any data to be passed in as input to the job.
   * @param accessToken - an optional access token for an authorized user.
   */
  public async executeJob(
    sasJob: string,
    contextName: string,
    debug: boolean,
    data?: any,
    accessToken?: string
  ) {
    if (!this.rootFolder) {
      await this.populateRootFolder(accessToken);
    }

    if (!this.rootFolder) {
      throw new Error("Root folder was not found");
    }
    if (!this.rootFolderMap.size) {
      await this.populateRootFolderMap(accessToken);
    }
    if (!this.rootFolderMap.size) {
      throw new Error(
        `The job ${sasJob} was not found in ${this.rootFolderName}`
      );
    }

    let files: any[] = [];
    if (data && Object.keys(data).length) {
      files = await this.uploadTables(data, accessToken);
    }
    const jobName = path.basename(sasJob);
    const jobFolder = sasJob.replace(`/${jobName}`, "");
    const allJobsInFolder = this.rootFolderMap.get(jobFolder.replace("/", ""));
    if (allJobsInFolder) {
      const jobSpec = allJobsInFolder.find((j: Job) => j.name === jobName);
      const jobDefinitionLink = jobSpec?.links.find(
        (l) => l.rel === "getResource"
      )?.href;
      const requestInfo: any = {
        method: "GET",
      };
      const headers: any = { "Content-Type": "application/json" };
      if (!!accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      requestInfo.headers = headers;
      const jobDefinition = await this.request<Job>(
        `${this.serverUrl}${jobDefinitionLink}`,
        requestInfo
      );

      const jobArguments: { [key: string]: any } = {
        _contextName: contextName,
        _program: `${this.rootFolderName}/${sasJob}`,
        _webin_file_count: files.length,
        _OMITJSONLISTING: true,
        _OMITJSONLOG: true,
        _OMITSESSIONRESULTS: true,
        _OMITTEXTLISTING: true,
        _OMITTEXTLOG: true,
      };

      if (debug) {
        jobArguments["_omittextlog"] = "false";
        jobArguments["_omitsessionresults"] = "false";
        jobArguments["_debug"] = 131;
      }

      files.forEach((fileInfo, index) => {
        jobArguments[
          `_webin_fileuri${index + 1}`
        ] = `/files/files/${fileInfo.id}`;
        jobArguments[`_webin_name${index + 1}`] = fileInfo.tableName;
      });

      const postJobRequest = {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: `exec-${jobName}`,
          description: "Powered by SASjs",
          jobDefinition,
          arguments: jobArguments,
        }),
      };
      const postedJob = await this.request<Job>(
        `${this.serverUrl}/jobExecution/jobs?_action=wait`,
        postJobRequest
      );
      const jobStatus = await this.pollJobState(postedJob, accessToken, true);
      const currentJob = await this.request<Job>(
        `${this.serverUrl}/jobExecution/jobs/${postedJob.id}`,
        { headers }
      );
      const resultLink = currentJob.results["_webout.json"];
      if (resultLink) {
        const result = await this.request<any>(
          `${this.serverUrl}${resultLink}/content`,
          { headers }
        );
        return result;
      }

      return postedJob;
    } else {
      throw new Error(
        `The job ${sasJob} was not found at the location ${this.rootFolderName}`
      );
    }
  }

  private async populateRootFolderMap(accessToken?: string) {
    const allItems = new Map<string, Job[]>();
    const url = "/folders/folders/@item?path=" + this.rootFolderName;
    const requestInfo: any = {
      method: "GET",
    };
    if (accessToken) {
      requestInfo.headers = { Authorization: `Bearer ${accessToken}` };
    }
    const folder = await this.request<Folder>(
      `${this.serverUrl}${url}`,
      requestInfo
    );
    if (!folder){
      throw new Error("Cannot populate RootFolderMap unless rootFolder exists");
    }
    const members = await this.request<{ items: any[] }>(
      `${this.serverUrl}/folders/folders/${folder.id}/members`,
      requestInfo
    );

    const itemsAtRoot = members.items;
    allItems.set("", itemsAtRoot);
    const subfolderRequests = members.items
      .filter((i: any) => i.contentType === "folder")
      .map(async (member: any) => {
        const subFolderUrl =
          "/folders/folders/@item?path=" +
          this.rootFolderName +
          "/" +
          member.name;
        const memberDetail = await this.request<Folder>(
          `${this.serverUrl}${subFolderUrl}`,
          requestInfo
        );

        const membersLink = memberDetail.links.find(
          (l: any) => l.rel === "members"
        );

        const memberContents = await this.request<{ items: any[] }>(
          `${this.serverUrl}${membersLink!.href}`,
          requestInfo
        );
        const itemsInFolder = memberContents.items as any[];
        allItems.set(member.name, itemsInFolder);
        return itemsInFolder;
      });
    await Promise.all(subfolderRequests);

    this.rootFolderMap = allItems;
  }

  private async populateRootFolder(accessToken?: string) {
    const url = "/folders/folders/@item?path=" + this.rootFolderName;
    const requestInfo: RequestInit = {
      method: "GET",
    };
    if (accessToken) {
      requestInfo.headers = { Authorization: `Bearer ${accessToken}` };
    }
    const rootFolder = await this.request<Folder>(
      `${this.serverUrl}${url}`,
      requestInfo
    ).catch(() => null);

    this.rootFolder = rootFolder;
  }

  private async pollJobState(
    postedJob: any,
    accessToken?: string,
    silent = false
  ) {
    let postedJobState = "";
    let pollCount = 0;
    const headers: any = {
      "Content-Type": "application/json",
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    const stateLink = postedJob.links.find((l: any) => l.rel === "state");
    return new Promise((resolve, _) => {
      const interval = setInterval(async () => {
        if (
          postedJobState === "running" ||
          postedJobState === "" ||
          postedJobState === "pending"
        ) {
          if (stateLink) {
            if (!silent) {
              console.log("Polling job status... \n");
            }
            const jobState = await this.request<string>(
              `${this.serverUrl}${stateLink.href}?wait=30`,
              {
                headers,
              },
              "text"
            );

            postedJobState = jobState.trim();
            if (!silent) {
              console.log(`Current state: ${postedJobState}\n`);
            }
            pollCount++;
            if (pollCount >= 100) {
              resolve(postedJobState);
            }
          }
        } else {
          clearInterval(interval);
          resolve(postedJobState);
        }
      }, 100);
    });
  }

  private async uploadTables(data: any, accessToken?: string) {
    const uploadedFiles = [];
    const headers: any = {
      "Content-Type": "application/json",
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    for (const tableName in data) {
      const csv = convertToCSV(data[tableName]);
      if (csv === "ERROR: LARGE STRING LENGTH") {
        throw new Error(
          "The max length of a string value in SASjs is 32765 characters."
        );
      }

      const createFileRequest = {
        method: "POST",
        body: csv,
        headers,
      };

      const file = await this.request<any>(
        `${this.serverUrl}/files/files#rawUpload`,
        createFileRequest
      );

      uploadedFiles.push({ tableName, file });
    }
    return uploadedFiles;
  }

  private async getFolderUri(folderPath: string, accessToken?: string) {
    const url = "/folders/folders/@item?path=" + folderPath;
      const requestInfo: any = {
        method: "GET",
      };
      if (accessToken) {
        requestInfo.headers = { Authorization: `Bearer ${accessToken}` };
      }
      const folder = await this.request<Folder>(
        `${this.serverUrl}${url}`,
        requestInfo
      );
      if (!folder)
        return undefined;
      return `/folders/folders/${folder.id}`;
  }

  private async request<T>(
    url: string,
    options: RequestInit,
    contentType: "text" | "json" = "json"
  ) {
    if (this.csrfToken) {
      options.headers = {
        ...options.headers,
        [this.csrfToken.headerName]: this.csrfToken.value,
      };
    }
    return await makeRequest<T>(
      url,
      options,
      (csrfToken) => (this.csrfToken = csrfToken),
      contentType
    );
  }
}
