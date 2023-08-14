import { SASjsRequest } from '../types'

/**
 * Comparator for SASjs request timestamps.
 *
 */
export const compareTimestamps = (a: SASjsRequest, b: SASjsRequest) => {
  return b.timestamp.getTime() - a.timestamp.getTime()
}
