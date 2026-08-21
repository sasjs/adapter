import { getValidJson } from './getValidJson'
import { parseWeboutResponse } from './parseWeboutResponse'

/**
 * Extracts and parses the webout JSON from a JES web app debug response that
 * inlines it via a script-constructed Blob:
 *   var blob = new Blob([`{...}`], {type: 'application/json'});
 * or, on abort/error paths, the same shape with text/plain and
 * weboutBEGIN/END markers around the JSON:
 *   var blob = new Blob([`>>weboutBEGIN<<\n{...}\n>>weboutEND<<\n`], {type: 'text/plain'});
 * Returns null (rather than throwing) if no such blob is present, so callers
 * can fall back to another extraction strategy first.
 */
export const extractWeboutBlob = (response: string): object | null => {
  const blobMatch = response.match(
    /new Blob\(\[`([\s\S]*?)`\],\s*\{type:\s*'(?:application\/json|text\/plain)'\}\)/
  )
  if (!blobMatch) return null

  const blobContent = blobMatch[1]
  const stripped = blobContent.includes('>>weboutBEGIN<<')
    ? parseWeboutResponse(blobContent)
    : blobContent

  return getValidJson(stripped)
}
