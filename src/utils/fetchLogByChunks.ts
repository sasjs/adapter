import { RequestClient } from '../request/RequestClient'
import { prefixMessage } from '@sasjs/utils/error'

/**
 * Fetches content of the log file
 * @param {object} requestClient - client object of Request Client.
 * @param {string} accessToken - an access token for an authorized user.
 * @param {string} logUrl - url of the log file.
 * @param {number} logCount- total number of log lines in file.
 * @returns an string containing log lines.
 */
export const fetchLogByChunks = async (
  requestClient: RequestClient,
  accessToken: string,
  logUrl: string,
  logCount: number
): Promise<string> => {
  return await fetchLog(requestClient, accessToken, logUrl, 0, logCount)
}

/**
 * Fetches a section of the log file delineated by start and end lines
 * @param {object} requestClient - client object of Request Client.
 * @param {string} accessToken - an access token for an authorized user.
 * @param {string} logUrl - url of the log file.
 * @param {number} start - the line at which to start fetching the log.
 * @param {number} end - the line at which to stop fetching the log.
 * @returns an string containing log lines.
 */
export const fetchLog = async (
  requestClient: RequestClient,
  accessToken: string,
  logUrl: string,
  start: number,
  end: number
): Promise<string> => {
  const logger = process.logger || console

  let log: string = ''

  const loglimit = end < 10000 ? end : 10000
  do {
    logger.info(
      `Fetching logs from line no: ${start + 1} to ${start +
        loglimit} of ${end}.`
    )
    const logChunkJson = await requestClient!
      .get<any>(`${logUrl}?start=${start}&limit=${loglimit}`, accessToken)
      .then((res: any) => res.result)
      .catch(err => {
        throw prefixMessage(err, 'Error while getting log. ')
      })

    if (logChunkJson.items.length === 0) break

    const logChunk = logChunkJson.items.map((i: any) => i.line).join('\n')
    log += logChunk

    start += loglimit
  } while (start < end)
  return log
}
