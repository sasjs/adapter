import { RequestClient } from '../request/RequestClient'
import { getValidJson } from '../utils'

/**
 * When querying a Viya job using the Web approach (as opposed to using the APIs) with _DEBUG enabled,
 * the first response contains the log with the content in an iframe. Therefore when debug is enabled,
 * and the serverType is VIYA, and useComputeApi is null (WEB), we call this function to extract the
 * (_webout) content from the iframe.
 * @param response - first response from viya job
 * @param requestClient
 * @param serverUrl
 * @returns
 */
export const parseSasViyaDebugResponse = async (
  response: string,
  requestClient: RequestClient,
  serverUrl: string
) => {
  const iframeStart = response.split(
    '<iframe style="width: 99%; height: 500px" src="'
  )[1]
  const jsonUrl = iframeStart ? iframeStart.split('"></iframe>')[0] : null
  if (!jsonUrl) {
    throw new Error('Unable to find webout file URL.')
  }

  return requestClient
    .get(serverUrl + jsonUrl, undefined, 'text/plain')
    .then((res: any) => getValidJson(res.result))
}
