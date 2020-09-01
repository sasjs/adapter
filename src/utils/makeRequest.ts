import { CsrfToken } from "../types"
import { needsRetry } from "./needsRetry"

let retryCount: number = 0
let retryLimit: number = 5

export async function makeRequest<T>(
  url: string,
  request: RequestInit,
  callback: (value: CsrfToken) => any,
  contentType: "text" | "json" = "json"
): Promise<{ result: T; etag: string | null }> {
  let retryRequest: any = null

  const responseTransform =
    contentType === "json"
      ? (res: Response) => res.json()
      : (res: Response) => res.text()
  let etag = null
  const result = await fetch(url, request).then(async (response) => {
    if (response.redirected && response.url.includes("SASLogon/login")) {
      return Promise.reject({ status: 401 })
    }
    if (!response.ok) {
      if (response.status === 403) {
        const tokenHeader = response.headers.get("X-CSRF-HEADER")

        if (tokenHeader) {
          const token = response.headers.get(tokenHeader)
          callback({
            headerName: tokenHeader,
            value: token || ""
          })

          retryRequest = {
            ...request,
            headers: { ...request.headers, [tokenHeader]: token }
          }
          return fetch(url, retryRequest).then((res) => {
            etag = res.headers.get("ETag")
            return responseTransform(res)
          })
        }
      } else {
        const body = await response.text()

        if (needsRetry(body)) {
          if (retryCount < retryLimit) {
            retryCount++
            let retryResponse = await makeRequest(
              url,
              retryRequest || request,
              callback,
              contentType
            )
            retryCount = 0

            etag = retryResponse.etag
            return retryResponse.result
          } else {
            retryCount = 0

            throw new Error("Request retry limit exceeded")
          }
        }

        return Promise.reject({ status: response.status, body })
      }
    } else {
      if (response.status === 204) {
        return Promise.resolve()
      }
      const responseTransformed = await responseTransform(response)
      let responseText = ""

      if (typeof responseTransformed === "string") {
        responseText = responseTransformed
      } else {
        responseText = JSON.stringify(responseTransformed)
      }

      if (needsRetry(responseText)) {
        if (retryCount < retryLimit) {
          retryCount++
          const retryResponse = await makeRequest(
            url,
            retryRequest || request,
            callback,
            contentType
          )
          retryCount = 0

          etag = retryResponse.etag
          return retryResponse.result
        } else {
          retryCount = 0

          throw new Error("Request retry limit exceeded")
        }
      }

      etag = response.headers.get("ETag")
      return responseTransformed
    }
  })
  return { result, etag }
}
