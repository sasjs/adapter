import { AuthConfig } from '@sasjs/utils/types'
import { prefixMessage } from '@sasjs/utils/error'
import { generateTimestamp } from '@sasjs/utils/time'
import { Job, PollOptions } from '../..'
import { getTokens } from '../../auth/getTokens'
import { RequestClient } from '../../request/RequestClient'
import { saveLog } from './saveLog'

export async function pollJobState(
  requestClient: RequestClient,
  postedJob: Job,
  debug: boolean,
  etag: string | null,
  authConfig?: AuthConfig,
  pollOptions?: PollOptions
) {
  const logger = process.logger || console

  let pollInterval = 300
  let maxPollCount = 1000
  let maxErrorCount = 5
  let access_token = (authConfig || {}).access_token

  const logFileName = `${postedJob.name || 'job'}-${generateTimestamp()}.log`
  const logFilePath = `${
    pollOptions?.logFilePath || process.cwd()
  }/${logFileName}`

  if (authConfig) {
    ;({ access_token } = await getTokens(requestClient, authConfig))
  }

  if (pollOptions) {
    pollInterval = pollOptions.pollInterval || pollInterval
    maxPollCount = pollOptions.maxPollCount || maxPollCount
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
    throw new Error(`Job state link was not found.`)
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

  return new Promise(async (resolve, reject) => {
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
              if (pollCount >= maxPollCount || errorCount >= maxErrorCount) {
                clearInterval(interval)
                reject(
                  prefixMessage(
                    err,
                    'Error while getting job state after interval. '
                  )
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
            logFilePath,
            access_token
          )

          if (pollCount >= maxPollCount) {
            resolve(postedJobState)
          }
        }
      } else {
        clearInterval(interval)
        resolve(postedJobState)
      }
    }, pollInterval)
  })
}
