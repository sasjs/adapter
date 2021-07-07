import { AuthConfig, createFile, generateTimestamp } from '@sasjs/utils'
import { prefixMessage } from '@sasjs/utils/error'
import { Job, PollOptions } from '../..'
import { getTokens } from '../../auth/tokens'
import { RequestClient } from '../../request/RequestClient'
import { fetchLogByChunks } from '../../utils'

export async function pollJobState(
  requestClient: RequestClient,
  postedJob: Job,
  debug: boolean,
  etag: string | null,
  authConfig?: AuthConfig,
  pollOptions?: PollOptions
) {
  const logger = process.logger || console

  let POLL_INTERVAL = 300
  let MAX_POLL_COUNT = 1000
  let MAX_ERROR_COUNT = 5
  let access_token = (authConfig || {}).access_token
  if (authConfig) {
    ;({ access_token } = await getTokens(requestClient, authConfig))
  }

  if (pollOptions) {
    POLL_INTERVAL = pollOptions.pollInterval || POLL_INTERVAL
    MAX_POLL_COUNT = pollOptions.maxPollCount || MAX_POLL_COUNT
  }

  let postedJobState = ''
  let pollCount = 0
  let errorCount = 0
  const headers: any = {
    'Content-Type': 'application/json',
    'If-None-Match': etag
  }
  if (access_token) {
    headers.Authorization = `Bearer ${access_token}`
  }
  const stateLink = postedJob.links.find((l: any) => l.rel === 'state')
  if (!stateLink) {
    return Promise.reject(`Job state link was not found.`)
  }

  const { result: state } = await requestClient
    .get<string>(
      `${stateLink.href}?_action=wait&wait=300`,
      access_token,
      'text/plain',
      {},
      debug
    )
    .catch((err) => {
      logger.error(
        `Error fetching job state from ${stateLink.href}. Starting poll, assuming job to be running.`,
        err
      )
      return { result: 'unavailable' }
    })

  const currentState = state.trim()
  if (currentState === 'completed') {
    return Promise.resolve(currentState)
  }

  return new Promise(async (resolve, _) => {
    let printedState = ''

    const interval = setInterval(async () => {
      if (
        postedJobState === 'running' ||
        postedJobState === '' ||
        postedJobState === 'pending' ||
        postedJobState === 'unavailable'
      ) {
        if (authConfig) {
          ;({ access_token } = await getTokens(requestClient, authConfig))
        }

        if (stateLink) {
          const { result: jobState } = await requestClient
            .get<string>(
              `${stateLink.href}?_action=wait&wait=300`,
              access_token,
              'text/plain',
              {},
              debug
            )
            .catch((err) => {
              errorCount++
              if (
                pollCount >= MAX_POLL_COUNT ||
                errorCount >= MAX_ERROR_COUNT
              ) {
                throw prefixMessage(
                  err,
                  'Error while getting job state after interval. '
                )
              }
              logger.error(
                `Error fetching job state from ${stateLink.href}. Resuming poll, assuming job to be running.`,
                err
              )
              return { result: 'unavailable' }
            })

          postedJobState = jobState.trim()
          if (postedJobState != 'unavailable' && errorCount > 0) {
            errorCount = 0
          }

          if (debug && printedState !== postedJobState) {
            logger.info('Polling job status...')
            logger.info(`Current job state: ${postedJobState}`)

            printedState = postedJobState
          }

          pollCount++

          await saveLog(
            postedJob,
            requestClient,
            pollOptions?.streamLog || false,
            pollOptions?.logFilePath,
            access_token
          )

          if (pollCount >= MAX_POLL_COUNT) {
            resolve(postedJobState)
          }
        }
      } else {
        clearInterval(interval)
        resolve(postedJobState)
      }
    }, POLL_INTERVAL)
  })
}

async function saveLog(
  job: Job,
  requestClient: RequestClient,
  shouldSaveLog: boolean,
  logFilePath?: string,
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
  const logFileName = `${job.name || 'job'}-${generateTimestamp()}.log`
  const logPath = `${logFilePath || process.cwd()}/${logFileName}`
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

  logger.info(`Writing logs to ${logPath}`)
  await createFile(logPath, log)
}
