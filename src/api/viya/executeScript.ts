import { timestampToYYYYMMDDHHMMSS } from '@sasjs/utils/time'
import { AuthConfig, MacroVar } from '@sasjs/utils/types'
import { prefixMessage } from '@sasjs/utils/error'
import {
  PollOptions,
  Job,
  ComputeJobExecutionError,
  NotFoundError
} from '../..'
import { getTokens } from '../../auth/getTokens'
import { RequestClient } from '../../request/RequestClient'
import { SessionManager } from '../../SessionManager'
import { isRelativePath, fetchLogByChunks } from '../../utils'
import { formatDataForRequest } from '../../utils/formatDataForRequest'
import { pollJobState } from './pollJobState'
import { uploadTables } from './uploadTables'

/**
 * Executes code on the current SAS Viya server.
 * @param jobPath - the path to the file being submitted for execution.
 * @param linesOfCode - an array of code lines to execute.
 * @param contextName - the context to execute the code in.
 * @param authConfig - an object containing an access token, refresh token, client ID and secret.
 * @param data - execution data.
 * @param debug - when set to true, the log will be returned.
 * @param expectWebout - when set to true, the automatic _webout fileref will be checked for content, and that content returned. This fileref is used when the Job contains a SASjs web request (as opposed to executing arbitrary SAS code).
 * @param waitForResult - when set to true, function will return the session
 * @param pollOptions - an object that represents poll interval(milliseconds) and maximum amount of attempts. Object example: { MAX_POLL_COUNT: 24 * 60 * 60, POLL_INTERVAL: 1000 }.
 * @param printPid - a boolean that indicates whether the function should print (PID) of the started job.
 * @param variables - an object that represents macro variables.
 */
export async function executeScript(
  requestClient: RequestClient,
  sessionManager: SessionManager,
  rootFolderName: string,
  jobPath: string,
  linesOfCode: string[],
  contextName: string,
  authConfig?: AuthConfig,
  data: any = null,
  debug: boolean = false,
  expectWebout = false,
  waitForResult = true,
  pollOptions?: PollOptions,
  printPid = false,
  variables?: MacroVar
): Promise<any> {
  let access_token = (authConfig || {}).access_token
  if (authConfig) {
    ;({ access_token } = await getTokens(requestClient, authConfig))
  }

  const logger = process.logger || console

  try {
    let executionSessionId: string

    const session = await sessionManager
      .getSession(access_token)
      .catch((err) => {
        throw prefixMessage(err, 'Error while getting session. ')
      })

    executionSessionId = session!.id

    if (printPid) {
      const { result: jobIdVariable } = await sessionManager
        .getVariable(executionSessionId, 'SYSJOBID', access_token)
        .catch((err) => {
          throw prefixMessage(err, 'Error while getting session variable. ')
        })

      if (jobIdVariable && jobIdVariable.value) {
        const relativeJobPath = rootFolderName
          ? jobPath.split(rootFolderName).join('').replace(/^\//, '')
          : jobPath

        const logger = process.logger || console

        logger.info(
          `Triggered '${relativeJobPath}' with PID ${
            jobIdVariable.value
          } at ${timestampToYYYYMMDDHHMMSS()}`
        )
      }
    }

    const jobArguments: { [key: string]: any } = {
      _contextName: contextName,
      _OMITJSONLISTING: true,
      _OMITJSONLOG: true,
      _OMITSESSIONRESULTS: true,
      _OMITTEXTLISTING: true,
      _OMITTEXTLOG: true
    }

    if (debug) {
      jobArguments['_OMITTEXTLOG'] = false
      jobArguments['_OMITSESSIONRESULTS'] = false
    }

    let fileName

    if (isRelativePath(jobPath)) {
      fileName = `exec-${
        jobPath.includes('/') ? jobPath.split('/')[1] : jobPath
      }`
    } else {
      const jobPathParts = jobPath.split('/')
      fileName = jobPathParts.pop()
    }

    let jobVariables: any = {
      SYS_JES_JOB_URI: '',
      _program: isRelativePath(jobPath)
        ? rootFolderName + '/' + jobPath
        : jobPath
    }

    if (variables) jobVariables = { ...jobVariables, ...variables }

    if (debug) jobVariables = { ...jobVariables, _DEBUG: 131 }

    let files: any[] = []

    if (data) {
      if (JSON.stringify(data).includes(';')) {
        files = await uploadTables(requestClient, data, access_token).catch(
          (err) => {
            throw prefixMessage(err, 'Error while uploading tables. ')
          }
        )

        jobVariables['_webin_file_count'] = files.length

        files.forEach((fileInfo, index) => {
          jobVariables[
            `_webin_fileuri${index + 1}`
          ] = `/files/files/${fileInfo.file.id}`
          jobVariables[`_webin_name${index + 1}`] = fileInfo.tableName
        })
      } else {
        jobVariables = { ...jobVariables, ...formatDataForRequest(data) }
      }
    }

    // Execute job in session
    const jobRequestBody = {
      name: fileName,
      description: 'Powered by SASjs',
      code: linesOfCode,
      variables: jobVariables,
      arguments: jobArguments
    }

    const { result: postedJob, etag } = await requestClient
      .post<Job>(
        `/compute/sessions/${executionSessionId}/jobs`,
        jobRequestBody,
        access_token
      )
      .catch((err) => {
        throw prefixMessage(err, 'Error while posting job. ')
      })

    if (!waitForResult) return session

    if (debug) {
      logger.info(`Job has been submitted for '${fileName}'.`)
      logger.info(
        `You can monitor the job progress at '${requestClient.getBaseUrl()}${
          postedJob.links.find((l: any) => l.rel === 'state')!.href
        }'.`
      )
    }

    const jobStatus = await pollJobState(
      requestClient,
      postedJob,
      debug,
      authConfig,
      pollOptions
    ).catch(async (err) => {
      const error = err?.response?.data
      const result = /err=[0-9]*,/.exec(error)

      const errorCode = '5113'
      if (result?.[0]?.slice(4, -1) === errorCode) {
        const sessionLogUrl =
          postedJob.links.find((l: any) => l.rel === 'up')!.href + '/log'
        const logCount = 1000000
        err.log = await fetchLogByChunks(
          requestClient,
          access_token!,
          sessionLogUrl,
          logCount
        )
      }
      throw prefixMessage(err, 'Error while polling job status. ')
    })

    if (authConfig) {
      ;({ access_token } = await getTokens(requestClient, authConfig))
    }

    const { result: currentJob } = await requestClient
      .get<Job>(
        `/compute/sessions/${executionSessionId}/jobs/${postedJob.id}`,
        access_token
      )
      .catch((err) => {
        throw prefixMessage(err, 'Error while getting job. ')
      })

    let jobResult
    let log = ''

    const logLink = currentJob.links.find((l) => l.rel === 'log')

    if (debug && logLink) {
      const logUrl = `${logLink.href}/content`
      const logCount = currentJob.logStatistics?.lineCount ?? 1000000
      log = await fetchLogByChunks(
        requestClient,
        access_token!,
        logUrl,
        logCount
      )
    }

    if (jobStatus === 'failed' || jobStatus === 'error') {
      throw new ComputeJobExecutionError(currentJob, log)
    }

    if (!expectWebout) {
      return { job: currentJob, log }
    }

    const resultLink = `/compute/sessions/${executionSessionId}/filerefs/_webout/content`

    jobResult = await requestClient
      .get<any>(resultLink, access_token, 'text/plain')
      .catch(async (e) => {
        if (e instanceof NotFoundError) {
          if (logLink) {
            const logUrl = `${logLink.href}/content`
            const logCount = currentJob.logStatistics?.lineCount ?? 1000000
            log = await fetchLogByChunks(
              requestClient,
              access_token!,
              logUrl,
              logCount
            )

            return Promise.reject({
              status: 500,
              log
            })
          }
        }

        return {
          result: JSON.stringify(e)
        }
      })

    await sessionManager
      .clearSession(executionSessionId, access_token)
      .catch((err) => {
        throw prefixMessage(err, 'Error while clearing session. ')
      })

    return { result: jobResult?.result, log }
  } catch (e) {
    interface HttpError {
      status: number
    }

    const error = e as HttpError

    if (error.status === 404) {
      return executeScript(
        requestClient,
        sessionManager,
        rootFolderName,
        jobPath,
        linesOfCode,
        contextName,
        authConfig,
        data,
        debug,
        false,
        true
      )
    } else {
      throw prefixMessage(e as Error, 'Error while executing script. ')
    }
  }
}
