import { AuthConfig } from '@sasjs/utils/types'
import { Job, PollOptions } from '../..'
import { getTokens } from '../../auth/getTokens'
import { RequestClient } from '../../request/RequestClient'
import { JobStatePollError } from '../../types/errors'
import { generateTimestamp } from '@sasjs/utils/time'
import { saveLog } from './saveLog'
import { createWriteStream } from '@sasjs/utils/file'
import { WriteStream } from 'fs'
import { Link } from '../../types'
import { prefixMessage } from '@sasjs/utils/error'

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

  if (pollOptions) {
    pollInterval = pollOptions.pollInterval || pollInterval
    maxPollCount = pollOptions.maxPollCount || maxPollCount
  }

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
  ).catch((err) => {
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
  if (pollOptions?.streamLog) {
    const logFileName = `${postedJob.name || 'job'}-${generateTimestamp()}.log`
    const logFilePath = `${
      pollOptions?.logFolderPath || process.cwd()
    }/${logFileName}`

    logFileStream = await createWriteStream(logFilePath)
  }

  let result = await doPoll(
    requestClient,
    postedJob,
    currentState,
    debug,
    pollCount,
    authConfig,
    pollOptions,
    logFileStream
  )

  currentState = result.state
  pollCount = result.pollCount

  if (!needsRetry(currentState) || pollCount >= maxPollCount) {
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
      .catch((err) => {
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

  while (needsRetry(state) && pollCount <= 100 && pollCount <= maxPollCount) {
    state = await getJobState(
      requestClient,
      postedJob,
      state,
      debug,
      authConfig
    ).catch((err) => {
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

    const jobUrl = postedJob.links.find((l: Link) => l.rel === 'self')
    const { result: job } = await requestClient.get<Job>(
      jobUrl!.href,
      authConfig?.access_token
    )

    const endLogLine = job.logStatistics?.lineCount ?? 1000000

    await saveLog(
      postedJob,
      requestClient,
      pollOptions?.streamLog || false,
      startLogLine,
      endLogLine,
      logStream,
      authConfig?.access_token
    )

    startLogLine += job.logStatistics.lineCount

    if (debug && printedState !== state) {
      logger.info('Polling job status...')
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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
