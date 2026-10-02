import { getValidJson } from './getValidJson'
import { parseWeboutResponse } from './parseWeboutResponse'

// Matches the script-constructed Blob that the JES web app uses to inline the
// webout: `new Blob([`{...}`], {type: 'application/json'})`. The type is
// text/plain on abort and error paths, where the JSON is wrapped in
// weboutBEGIN/END markers. Quote style and whitespace vary between Viya
// releases, so both are tolerated here rather than in a second pattern.
const blobPattern =
  /new Blob\(\[`([\s\S]*?)`\],\s*\{\s*type:\s*['"](?:application\/json|text\/plain)['"]\s*\}/

/**
 * True when the response inlines the webout in a script-constructed Blob,
 * which is the shape the compute task debug path returns. The iframe file URL
 * path does not, so callers use this to pick the matching parser.
 */
export const hasWeboutBlob = (response: string): boolean =>
  blobPattern.test(response)

/**
 * Extracts and parses the webout JSON from a JES web app debug response that
 * inlines it via a script-constructed Blob - see blobPattern for the shapes
 * handled. Returns null (rather than throwing) if no such blob is present, so
 * callers can fall back to another extraction strategy first.
 */
export const extractWeboutBlob = (response: string): object | null => {
  const blobMatch = response.match(blobPattern)
  if (!blobMatch) return null

  const blobContent = blobMatch[1]
  const stripped = blobContent.includes('>>weboutBEGIN<<')
    ? parseWeboutResponse(blobContent)
    : blobContent

  return getValidJson(stripped)
}
