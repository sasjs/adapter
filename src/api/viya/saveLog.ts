import { Job } from '../..'
import { RequestClient } from '../../request/RequestClient'
import { fetchLog } from '../../utils'
import { WriteStream } from 'fs'
import { writeStream } from './writeStream'

export async function saveLog(
  job: Job,
  requestClient: RequestClient,
  shouldSaveLog: boolean,
  startLine: number,
  endLine: number,
  logFileStream?: WriteStream,
  accessToken?: string
) {
  console.log('startLine: ', startLine, ' endLine: ', endLine)
  if (!shouldSaveLog) {
    return
  }

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
  ).catch((e) => console.log(e))

  logger.info(`Writing logs to ${logFileStream.path}`)
  await writeStream(logFileStream, log || '').catch((e) => console.log(e))
}
