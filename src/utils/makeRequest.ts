import { CsrfToken } from '../types'
import { needsRetry } from './needsRetry'

let retryCount: number = 0
const retryLimit: number = 5

export async function makeRequest<T>(
  url: string,
  request: RequestInit,
  callback: (value: CsrfToken) => any,
  contentType: 'text' | 'json' = 'json'
): Promise<{ result: T; etag: string | null }> {
  let retryRequest: any = null

  const responseTransform =
    contentType === 'json'
      ? (res: Response) => res.json()
      : (res: Response) => res.text()
  let etag = null

  const result = await fetch(url, request)
    .then(async (response) => {
      if (response.redirected && response.url.includes('SASLogon/login')) {
        return Promise.reject({ status: 401 })
      }

      if (!response.ok) {
        if (response.status === 403) {
          const tokenHeader = response.headers.get('X-CSRF-HEADER')

          if (tokenHeader) {
            const token = response.headers.get(tokenHeader)
            callback({
              headerName: tokenHeader,
              value: token || ''
            })

            retryRequest = {
              ...request,
              headers: { ...request.headers, [tokenHeader]: token }
            }

            return await fetch(url, retryRequest).then((res) => {
              etag = res.headers.get('ETag')
              return responseTransform(res)
            })
          } else {
            let body: any = await response.text().catch((err) => {
              throw err
            })

            try {
              body = JSON.parse(body)

              body.message = `Forbidden. Check your permissions and user groups, and also the scopes granted when registering your CLIENT_ID. ${
                body.message || ''
              }`

              body = JSON.stringify(body)
            } catch (_) {}

            return Promise.reject({ status: response.status, body })
          }
        } else {
          let body: any = await response.text().catch((err) => {
            throw err
          })

          if (needsRetry(body)) {
            if (retryCount < retryLimit) {
              retryCount++
              let retryResponse = await makeRequest(
                url,
                retryRequest || request,
                callback,
                contentType
              ).catch((err) => {
                throw err
              })
              retryCount = 0

              etag = retryResponse.etag
              return retryResponse.result
            } else {
              retryCount = 0

              throw new Error('Request retry limit exceeded')
            }
          }

          if (response.status === 401) {
            try {
              body = JSON.parse(body)

              body.message = `Unauthorized request. Check your credentials(client, secret, access token). ${
                body.message || ''
              }`

              body = JSON.stringify(body)
            } catch (_) {}
          }

          return Promise.reject({ status: response.status, body })
        }
      } else {
        if (response.status === 204) {
          return Promise.resolve()
        }
        const responseTransformed = await responseTransform(response).catch(
          (err) => {
            throw err
          }
        )
        let responseText = ''

        if (typeof responseTransformed === 'string') {
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
            ).catch((err) => {
              throw err
            })
            retryCount = 0

            etag = retryResponse.etag
            return retryResponse.result
          } else {
            retryCount = 0

            throw new Error('Request retry limit exceeded')
          }
        }

        etag = response.headers.get('ETag')

        return responseTransformed
      }
    })
    .catch((err) => {
      throw err
    })

  return { result, etag }
}
