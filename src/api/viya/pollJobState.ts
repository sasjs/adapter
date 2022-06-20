import { AuthConfig } from '@sasjs/utils/types'
import { Job, PollOptions } from '../..'
import { getTokens } from '../../auth/getTokens'
import { RequestClient } from '../../request/RequestClient'
import { JobStatePollError } from '../../types/errors'
import { Link, WriteStream } from '../../types'
import { delay, isNode } from '../../utils'

export async function pollJobState(
  requestClient: RequestClient,
  postedJob: Job,
  debug: boolean,
  authConfig?: AuthConfig,
  pollOptions?: PollOptions
) {
  const logger = process.logger || console

  let pollInterval = 300
  let maxPollCount = 1000

  const defaultPollOptions: PollOptions = {
    maxPollCount,
    pollInterval,
    streamLog: false
  }

  pollOptions = { ...defaultPollOptions, ...(pollOptions || {}) }

  const stateLink = postedJob.links.find((l: any) => l.rel === 'state')
  if (!stateLink) {
    throw new Error(`Job state link was not found.`)
  }

  let currentState = await getJobState(
    requestClient,
    postedJob,
    '',
    debug,
    authConfig
  ).catch(err => {
    logger.error(
      `Error fetching job state from ${stateLink.href}. Starting poll, assuming job to be running.`,
      err
    )
    return 'unavailable'
  })

  let pollCount = 0

  if (currentState === 'completed') {
    return Promise.resolve(currentState)
  }

  let logFileStream
  if (pollOptions.streamLog && isNode()) {
    const { getFileStream } = require('./getFileStream')
    logFileStream = await getFileStream(postedJob, pollOptions.logFolderPath)
  }

  // Poll up to the first 100 times with the specified poll interval
  let result = await doPoll(
    requestClient,
    postedJob,
    currentState,
    debug,
    pollCount,
    authConfig,
    {
      ...pollOptions,
      maxPollCount:
        pollOptions.maxPollCount <= 100 ? pollOptions.maxPollCount : 100
    },
    logFileStream
  )

  currentState = result.state
  pollCount = result.pollCount

  if (!needsRetry(currentState) || pollCount >= pollOptions.maxPollCount) {
    return currentState
  }

  // If we get to this point, this is a long-running job that needs longer polling.
  // We will resume polling with a bigger interval of 1 minute
  let longJobPollOptions: PollOptions = {
    maxPollCount: 24 * 60,
    pollInterval: 60000,
    streamLog: false
  }
  if (pollOptions) {
    longJobPollOptions.streamLog = pollOptions.streamLog
    longJobPollOptions.logFolderPath = pollOptions.logFolderPath
  }

  result = await doPoll(
    requestClient,
    postedJob,
    currentState,
    debug,
    pollCount,
    authConfig,
    longJobPollOptions,
    logFileStream
  )

  currentState = result.state
  pollCount = result.pollCount

  if (logFileStream) {
    logFileStream.end()
  }

  return currentState
}

const getJobState = async (
  requestClient: RequestClient,
  job: Job,
  currentState: string,
  debug: boolean,
  authConfig?: AuthConfig
) => {
  const stateLink = job.links.find((l: any) => l.rel === 'state')
  if (!stateLink) {
    throw new Error(`Job state link was not found.`)
  }

  if (needsRetry(currentState)) {
    let tokens
    if (authConfig) {
      tokens = await getTokens(requestClient, authConfig)
    }

    const { result: jobState } = await requestClient
      .get<string>(
        `${stateLink.href}?_action=wait&wait=300`,
        tokens?.access_token,
        'text/plain',
        {},
        debug
      )
      .catch(err => {
        throw new JobStatePollError(job.id, err)
      })

    return jobState.trim()
  } else {
    return currentState
  }
}

const needsRetry = (state: string) =>
  state === 'running' ||
  state === '' ||
  state === 'pending' ||
  state === 'unavailable'

const doPoll = async (
  requestClient: RequestClient,
  postedJob: Job,
  currentState: string,
  debug: boolean,
  pollCount: number,
  authConfig?: AuthConfig,
  pollOptions?: PollOptions,
  logStream?: WriteStream
): Promise<{ state: string; pollCount: number }> => {
  let pollInterval = 300
  let maxPollCount = 1000
  let maxErrorCount = 5
  let errorCount = 0
  let state = currentState
  let printedState = ''
  let startLogLine = 0

  const logger = process.logger || console

  if (pollOptions) {
    pollInterval = pollOptions.pollInterval || pollInterval
    maxPollCount = pollOptions.maxPollCount || maxPollCount
  }

  const stateLink = postedJob.links.find((l: Link) => l.rel === 'state')
  if (!stateLink) {
    throw new Error(`Job state link was not found.`)
  }

  while (needsRetry(state) && pollCount <= maxPollCount) {
    state = await getJobState(
      requestClient,
      postedJob,
      state,
      debug,
      authConfig
    ).catch(err => {
      errorCount++
      if (pollCount >= maxPollCount || errorCount >= maxErrorCount) {
        throw err
      }
      logger.error(
        `Error fetching job state from ${stateLink.href}. Resuming poll, assuming job to be running.`,
        err
      )
      return 'unavailable'
    })

    pollCount++

    const jobHref = postedJob.links.find((l: Link) => l.rel === 'self')!.href

    if (pollOptions?.streamLog) {
      const { result: job } = await requestClient.get<Job>(
        jobHref,
        authConfig?.access_token
      )

      const endLogLine = job.logStatistics?.lineCount ?? 1000000

      const { saveLog } = isNode() ? require('./saveLog') : { saveLog: null }
      if (saveLog) {
        await saveLog(
          postedJob,
          requestClient,
          startLogLine,
          endLogLine,
          logStream,
          authConfig?.access_token
        )
      }

      startLogLine += endLogLine
    }

    if (debug && printedState !== state) {
      logger.info(`Polling: ${requestClient.getBaseUrl() + jobHref}/state`)
      logger.info(`Current job state: ${state}`)

      printedState = state
    }

    if (state != 'unavailable' && errorCount > 0) {
      errorCount = 0
    }

    await delay(pollInterval)
  }

  return { state, pollCount }
}
