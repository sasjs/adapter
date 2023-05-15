import { AuthConfig } from '@sasjs/utils/types'
import { Job, PollOptions } from '../..'
import { getTokens } from '../../auth/getTokens'
import { RequestClient } from '../../request/RequestClient'
import { JobStatePollError } from '../../types/errors'
import { Link, WriteStream } from '../../types'
import { delay, isNode } from '../../utils'

export enum JobState {
  Completed = 'completed',
  Running = 'running',
  Pending = 'pending',
  Unavailable = 'unavailable',
  NoState = '',
  Failed = 'failed',
  Error = 'error'
}

type PollStrategies = PollOptions[]

export async function pollJobState(
  requestClient: RequestClient,
  postedJob: Job,
  debug: boolean,
  authConfig?: AuthConfig,
  pollOptions?: PollOptions,
  pollStrategies?: PollStrategies
) {
  const logger = process.logger || console

  const defaultPollStrategies: PollStrategies = [
    { maxPollCount: 200, pollInterval: 300, streamLog: false }, // INFO: approximately ~2 mins (including time to get response (~300ms))
    { maxPollCount: 300, pollInterval: 3000, streamLog: false }, // INFO: approximately ~5.5 mins (including time to get response (~300ms))
    { maxPollCount: 400, pollInterval: 30000, streamLog: false }, // INFO: approximately ~50.5 mins (including time to get response (~300ms))
    { maxPollCount: 3400, pollInterval: 60000, streamLog: false } // INFO: approximately ~3015 mins (~125 hours) (including time to get response (~300ms))
  ]

  if (pollStrategies === undefined) pollStrategies = defaultPollStrategies
  else validatePollStrategies(pollStrategies)

  let defaultPollOptions: PollOptions = pollStrategies.splice(0, 1)[0]

  pollOptions = { ...defaultPollOptions, ...(pollOptions || {}) }

  const stateLink = postedJob.links.find((l: any) => l.rel === 'state')
  if (!stateLink) {
    throw new Error(`Job state link was not found.`)
  }

  let currentState: JobState = await getJobState(
    requestClient,
    postedJob,
    JobState.NoState,
    debug,
    authConfig
  ).catch((err) => {
    logger.error(
      `Error fetching job state from ${stateLink.href}. Starting poll, assuming job to be running.`,
      err
    )

    return JobState.Unavailable
  })

  let pollCount = 0

  if (currentState === JobState.Completed) {
    return Promise.resolve(currentState)
  }

  let logFileStream
  if (pollOptions.streamLog && isNode()) {
    const { getFileStream } = require('./getFileStream')
    logFileStream = await getFileStream(postedJob, pollOptions.logFolderPath)
  }

  let result = await doPoll(
    requestClient,
    postedJob,
    currentState,
    debug,
    pollCount,
    pollOptions,
    authConfig,
    logFileStream
  )

  currentState = result.state
  pollCount = result.pollCount

  if (
    !needsRetry(currentState) ||
    (pollCount >= pollOptions.maxPollCount && !pollStrategies.length)
  ) {
    return currentState
  }

  // INFO: If we get to this point, this is a long-running job that needs longer polling.
  // We will resume polling with a bigger interval according to the next polling strategy
  while (pollStrategies.length && needsRetry(currentState)) {
    defaultPollOptions = pollStrategies.splice(0, 1)[0]

    if (pollOptions) {
      defaultPollOptions.streamLog = pollOptions.streamLog
      defaultPollOptions.logFolderPath = pollOptions.logFolderPath
    }

    result = await doPoll(
      requestClient,
      postedJob,
      currentState,
      debug,
      pollCount,
      defaultPollOptions,
      authConfig,
      logFileStream
    )

    currentState = result.state
    pollCount = result.pollCount
  }

  if (logFileStream) logFileStream.end()

  return currentState
}

const getJobState = async (
  requestClient: RequestClient,
  job: Job,
  currentState: string,
  debug: boolean,
  authConfig?: AuthConfig
): Promise<JobState> => {
  const stateLink = job.links.find((l: any) => l.rel === 'state')!

  if (needsRetry(currentState)) {
    let tokens

    if (authConfig) tokens = await getTokens(requestClient, authConfig)

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

    return jobState.trim() as JobState
  } else {
    return currentState as JobState
  }
}

const needsRetry = (state: string) =>
  state === JobState.Running ||
  state === JobState.NoState ||
  state === JobState.Pending ||
  state === JobState.Unavailable

const doPoll = async (
  requestClient: RequestClient,
  postedJob: Job,
  currentState: JobState,
  debug: boolean,
  pollCount: number,
  pollOptions: PollOptions,
  authConfig?: AuthConfig,
  logStream?: WriteStream
): Promise<{ state: JobState; pollCount: number }> => {
  const { maxPollCount, pollInterval } = pollOptions
  const logger = process.logger || console
  const stateLink = postedJob.links.find((l: Link) => l.rel === 'state')!
  let maxErrorCount = 5
  let errorCount = 0
  let state = currentState
  let printedState = JobState.NoState
  let startLogLine = 0

  while (needsRetry(state) && pollCount <= maxPollCount) {
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

      return JobState.Unavailable
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

    if (state !== JobState.Unavailable && errorCount > 0) {
      errorCount = 0
    }

    if (state !== JobState.Completed) {
      await delay(pollInterval)
    }
  }

  return { state, pollCount }
}

const validatePollStrategies = (strategies: PollStrategies) => {
  const throwError = (message?: string, strategy?: PollOptions) => {
    throw new Error(
      `Poll strategies are not valid.${message ? ` ${message}` : ''}${
        strategy
          ? ` Invalid poll strategy: \n${JSON.stringify(strategy, null, 2)}`
          : ''
      }`
    )
  }

  if (!strategies.length) throwError('No strategies provided.')

  strategies.forEach((strategy: PollOptions, i: number) => {
    const { maxPollCount, pollInterval } = strategy

    if (maxPollCount < 1) {
      throwError(`'maxPollCount' has to be greater than 0.`, strategy)
    } else if (i !== 0) {
      const previousStrategy = strategies[i - 1]

      if (maxPollCount <= previousStrategy.maxPollCount) {
        throwError(
          `'maxPollCount' has to be greater than 'maxPollCount' in previous poll strategy.`,
          strategy
        )
      }
    } else if (pollInterval < 1) {
      throwError(`'pollInterval' has to be greater than 0.`, strategy)
    }
  })
}
