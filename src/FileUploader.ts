import { isLogInRequired, needsRetry } from "./utils";
import { CsrfToken } from "./types/CsrfToken";

const requestRetryLimit = 5;

export class FileUploader {
  constructor(
    private appLoc: string,
    private serverUrl: string,
    private jobsPath: string,
    private csrfToken: CsrfToken | null = null
  ) {}
  private retryCount = 0;

  public uploadFile(sasJob: string, file: File, fileName: string, params: any) {
    if (!file) throw new Error("File must be provided");
    if (!fileName) throw new Error("File name must be provided");

    let paramsString = "";

    for (let param in params) {
      if (params.hasOwnProperty(param)) {
        paramsString += `&${param}=${params[param]}`;
      }
    }

    const program = this.appLoc
      ? this.appLoc.replace(/\/?$/, "/") + sasJob.replace(/^\//, "")
      : sasJob;
    const uploadUrl = `${this.serverUrl}${this.jobsPath}/?${
      "_program=" + program
    }${paramsString}`;

    const headers = {
      "cache-control": "no-cache",
    };

    return new Promise((resolve, reject) => {
      const formData = new FormData();

      formData.append("file", file);
      formData.append("filename", fileName);
      if (this.csrfToken) formData.append("_csrf", this.csrfToken.value);

      fetch(uploadUrl, {
        method: "POST",
        body: formData,
        referrerPolicy: "same-origin",
        headers,
      })
        .then(async (response) => {
          if (!response.ok) {
            if (response.status === 403) {
              const tokenHeader = response.headers.get("X-CSRF-HEADER");

              if (tokenHeader) {
                const token = response.headers.get(tokenHeader);
                this.csrfToken = {
                  headerName: tokenHeader,
                  value: token || "",
                };
              }
            }
          }

          return response.text();
        })
        .then((responseText) => {
          if (isLogInRequired(responseText))
            reject("You must be logged in to upload a fle");

          if (needsRetry(responseText)) {
            if (this.retryCount < requestRetryLimit) {
              this.retryCount++;
              this.uploadFile(sasJob, file, fileName, params).then(
                (res: any) => resolve(res),
                (err: any) => reject(err)
              );
            } else {
              this.retryCount = 0;
              reject(responseText);
            }
          } else {
            this.retryCount = 0;

            try {
              resolve(JSON.parse(responseText));
            } catch (e) {
              reject(e);
            }
          }
        });
    });
  }
}
