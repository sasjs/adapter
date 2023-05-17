import { AuthConfig } from '@sasjs/utils/types'
import { Job, PollOptions, PollStrategy } from '../..'
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

/**
 * Polls job status using default or provided poll options.
 * @param requestClient - the pre-configured HTTP request client.
 * @param postedJob - the relative or absolute path to the job.
 * @param debug - sets the _debug flag in the job arguments.
 * @param authConfig - an access token, refresh token, client and secret for an authorized user.
 * @param pollOptions - an object containing maxPollCount, pollInterval, streamLog and logFolderPath. It will override the first default poll options in poll strategy if provided.
 * Example pollOptions:
 * {
 *    maxPollCount: 200,
 *    pollInterval: 300,
 *    streamLog: true, // optional, equals to false by default.
 *    pollStrategy?: // optional array of poll options that should be applied after 'maxPollCount' of the provided poll options is reached. If not provided the default (see example below) poll strategy will be used.
 * }
 * Example pollStrategy (values used from default poll strategy):
 * [
 *    { maxPollCount: 200, pollInterval: 300 }, // approximately ~2 mins (including time to get response (~300ms))
 *    { maxPollCount: 300, pollInterval: 3000 }, // approximately ~5.5 mins (including time to get response (~300ms))
 *    { maxPollCount: 500, pollInterval: 30000 }, // approximately ~50.5 mins (including time to get response (~300ms))
 *    { maxPollCount: 3400, pollInterval: 60000 } // approximately ~3015 mins (~125 hours) (including time to get response (~300ms))
 * ]
 * @returns - a promise which resolves with a job state
 */
export async function pollJobState(
  requestClient: RequestClient,
  postedJob: Job,
  debug: boolean,
  authConfig?: AuthConfig,
  pollOptions?: PollOptions
): Promise<JobState> {
  const logger = process.logger || console

  const streamLog = pollOptions?.streamLog || false

  const defaultPollStrategy: PollStrategy = [
    { maxPollCount: 200, pollInterval: 300 },
    { maxPollCount: 300, pollInterval: 3000 },
    { maxPollCount: 500, pollInterval: 30000 },
    { maxPollCount: 3400, pollInterval: 60000 }
  ]

  let pollStrategy: PollStrategy

  if (pollOptions !== undefined) {
    pollStrategy = [pollOptions]

    let { pollStrategy: providedPollStrategy } = pollOptions

    if (providedPollStrategy !== undefined) {
      validatePollStrategies(providedPollStrategy)

      // INFO: sort by 'maxPollCount'
      providedPollStrategy = providedPollStrategy.sort(
        (strategyA: PollOptions, strategyB: PollOptions) =>
          strategyA.maxPollCount - strategyB.maxPollCount
      )

      pollStrategy = [...pollStrategy, ...providedPollStrategy]
    } else {
      pollStrategy = [...pollStrategy, ...defaultPollStrategy]
    }
  } else {
    pollStrategy = defaultPollStrategy
  }

  let defaultPollOptions: PollOptions = pollStrategy.splice(0, 1)[0]

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
  if (streamLog && isNode()) {
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
    streamLog,
    logFileStream
  )

  currentState = result.state
  pollCount = result.pollCount

  if (
    !needsRetry(currentState) ||
    (pollCount >= pollOptions.maxPollCount && !pollStrategy.length)
  ) {
    return currentState
  }

  // INFO: If we get to this point, this is a long-running job that needs longer polling.
  // We will resume polling with a bigger interval according to the next polling strategy
  while (pollStrategy.length && needsRetry(currentState)) {
    defaultPollOptions = pollStrategy.splice(0, 1)[0]

    if (pollOptions) {
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
      streamLog,
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
  streamLog?: boolean,
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

    if (streamLog) {
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

const validatePollStrategies = (strategy: PollStrategy) => {
  const throwError = (message?: string, pollOptions?: PollOptions) => {
    throw new Error(
      `Poll strategies are not valid.${message ? ` ${message}` : ''}${
        pollOptions
          ? ` Invalid poll strategy: \n${JSON.stringify(pollOptions, null, 2)}`
          : ''
      }`
    )
  }

  strategy.forEach((pollOptions: PollOptions, i: number) => {
    const { maxPollCount, pollInterval } = pollOptions

    if (maxPollCount < 1) {
      throwError(`'maxPollCount' has to be greater than 0.`, pollOptions)
    } else if (i !== 0) {
      const previousPollOptions = strategy[i - 1]

      if (maxPollCount <= previousPollOptions.maxPollCount) {
        throwError(
          `'maxPollCount' has to be greater than 'maxPollCount' in previous poll strategy.`,
          pollOptions
        )
      }
    } else if (pollInterval < 1) {
      throwError(`'pollInterval' has to be greater than 0.`, pollOptions)
    }
  })
}
