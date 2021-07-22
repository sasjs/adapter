import { Job } from '../..'
import { RequestClient } from '../../request/RequestClient'
import { fetchLog } from '../../utils'
import { WriteStream } from 'fs'
import { writeStream } from './writeStream'

/**
 * Appends logs to a supplied write stream.
 * This is useful for getting quick feedback on longer running jobs.
 * @param job - the job to fetch logs for
 * @param requestClient - the pre-configured HTTP request client
 * @param startLine - the line at which to start fetching the log
 * @param endLine - the line at which to stop fetching the log
 * @param logFileStream - the write stream to which the log is appended
 * @accessToken - an optional access token for authentication/authorization
 * The access token is not required when fetching logs from the browser.
 */
export async function saveLog(
  job: Job,
  requestClient: RequestClient,
  startLine: number,
  endLine: number,
  logFileStream?: WriteStream,
  accessToken?: string
) {
  if (!accessToken) {
    throw new Error(
      `Logs for job ${job.id} cannot be fetched without a valid access token.`
    )
  }

  if (!logFileStream) {
    throw new Error(
      `Logs for job ${job.id} cannot be written without a valid write stream.`
    )
  }

  const logger = process.logger || console
  const jobLogUrl = job.links.find((l) => l.rel === 'log')

  if (!jobLogUrl) {
    throw new Error(`Log URL for job ${job.id} was not found.`)
  }

  const log = await fetchLog(
    requestClient,
    accessToken,
    `${jobLogUrl.href}/content`,
    startLine,
    endLine
  )

  logger.info(`Writing logs to ${logFileStream.path}`)
  await writeStream(logFileStream, log || '')
}
