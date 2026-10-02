import { extractWeboutBlob } from './extractWeboutBlob'

/**
 * When querying a Viya job using the Web approach with _DEBUG=128 (used when
 * runAsTask is true), the webout JSON is inlined into the response via a
 * script-constructed Blob - see extractWeboutBlob for the exact shapes
 * handled. No follow-up request is needed — extract and parse the JSON
 * directly.
 */
export const parseSasViyaLogDebugResponse = async (response: any) => {
  // If upstream already parsed the response as JSON (object), pass through.
  if (typeof response !== 'string') {
    return response
  }

  const result = extractWeboutBlob(response)
  if (result === null) {
    throw new Error('Unable to find webout blob in debug log response.')
  }

  return result
}
