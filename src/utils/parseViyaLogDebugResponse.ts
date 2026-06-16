import { getValidJson } from './getValidJson'
import { parseWeboutResponse } from './parseWeboutResponse'

/**
 * When querying a Viya job using the Web approach with _DEBUG=128 (used when
 * runAsTask is true), the webout JSON is inlined into the response via:
 *   var blob = new Blob([`{...}`], {type: 'application/json'});
 * On abort/error paths the same shape is used but with text/plain and
 * weboutBEGIN/END markers around the JSON:
 *   var blob = new Blob([`>>weboutBEGIN<<\n{...}\n>>weboutEND<<\n`], {type: 'text/plain'});
 * No follow-up request is needed — extract and parse the JSON directly.
 */
export const parseSasViyaLogDebugResponse = async (response: any) => {
  // If upstream already parsed the response as JSON (object), pass through.
  if (typeof response !== 'string') {
    return response
  }

  const blobMatch = response.match(
    /new Blob\(\[`([\s\S]*?)`\],\s*\{type:\s*'(?:application\/json|text\/plain)'\}\)/
  )
  if (!blobMatch) {
    throw new Error('Unable to find webout blob in debug log response.')
  }

  const blobContent = blobMatch[1]
  const stripped = blobContent.includes('>>weboutBEGIN<<')
    ? parseWeboutResponse(blobContent)
    : blobContent

  return getValidJson(stripped)
}
