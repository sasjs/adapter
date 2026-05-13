import { getValidJson } from './getValidJson'

/**
 * When querying a Viya job using the Web approach with _DEBUG=log (used when
 * runAsTask is true), the webout JSON is inlined into the response via:
 *   var blob = new Blob([`{...}`], {type: 'application/json'});
 * No follow-up request is needed — extract and parse the JSON directly.
 */
export const parseSasViyaLogDebugResponse = async (response: string) => {
  const blobMatch = response.match(
    /new Blob\(\[`([\s\S]*?)`\],\s*\{type:\s*'application\/json'\}\)/
  )
  if (!blobMatch) {
    throw new Error('Unable to find webout blob in debug log response.')
  }

  return getValidJson(blobMatch[1])
}
