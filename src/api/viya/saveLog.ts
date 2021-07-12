import { createFile } from '@sasjs/utils/file'
import { Job } from '../..'
import { RequestClient } from '../../request/RequestClient'
import { fetchLogByChunks } from '../../utils'

export async function saveLog(
  job: Job,
  requestClient: RequestClient,
  shouldSaveLog: boolean,
  logFilePath: string,
  accessToken?: string
) {
  if (!shouldSaveLog) {
    return
  }

  if (!accessToken) {
    throw new Error(
      `Logs for job ${job.id} cannot be fetched without a valid access token.`
    )
  }

  const logger = process.logger || console
  const jobLogUrl = job.links.find((l) => l.rel === 'log')

  if (!jobLogUrl) {
    throw new Error(`Log URL for job ${job.id} was not found.`)
  }

  const logCount = job.logStatistics?.lineCount ?? 1000000
  const log = await fetchLogByChunks(
    requestClient,
    accessToken,
    `${jobLogUrl.href}/content`,
    logCount
  )

  logger.info(`Writing logs to ${logFilePath}`)
  await createFile(logFilePath, log)
}
