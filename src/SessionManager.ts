import { Session, Context, SessionVariable } from './types'
import { NoSessionStateError } from './types/errors'
import { asyncForEach, isUrl } from './utils'
import { prefixMessage } from '@sasjs/utils/error'
import { RequestClient } from './request/RequestClient'

const MAX_SESSION_COUNT = 1

interface ApiErrorResponse {
  response: { status: number | string; data: { message: string } }
}

export class SessionManager {
  private loggedErrors: NoSessionStateError[] = []

  constructor(
    private serverUrl: string,
    private contextName: string,
    private requestClient: RequestClient
  ) {
    if (serverUrl) isUrl(serverUrl)
  }

  // INFO: session pool
  private sessions: Session[] = []
  private currentContext: Context | null = null
  private settingContext: boolean = false
  private _debug: boolean = false
  private printedSessionState = {
    printed: false,
    state: ''
  }

  public get debug() {
    return this._debug
  }

  public set debug(value: boolean) {
    this._debug = value
  }

  /**
   * Checks if session is valid. Session is considered valid if time since it's creation is less than 'sessionInactiveTimeout' attribute.
   * @param session - session object.
   * @returns - boolean indicating if session is valid.
   */
  private isSessionValid(session: Session): boolean {
    if (!session) return false

    const secondsSinceSessionCreation =
      (new Date().getTime() - new Date(session.creationTimeStamp).getTime()) /
      1000

    if (
      !session!.attributes ||
      secondsSinceSessionCreation >= session!.attributes.sessionInactiveTimeout
    ) {
      return false
    } else {
      return true
    }
  }

  /**
   * Removes session from pool of hot sessions.
   * @param session - session object.
   * @returns - void.
   */
  private removeSessionFromPool(session: Session): void {
    this.sessions = this.sessions.filter((ses) => ses.id !== session.id)
  }

  /**
   * Filters session pool to keep only valid sessions.
   * @param session - session object.
   * @returns - void.
   */
  private removeExpiredSessions(): void {
    this.sessions = this.sessions.filter((session) =>
      this.isSessionValid(session)
    )
  }

  /**
   * Throws set of errors as a single error.
   * @param errors - array of errors or string.
   * @param prefix - an optional final error prefix.
   * @returns - never.
   */
  private throwErrors(errors: (Error | string)[], prefix?: string): never {
    throw prefix
      ? prefixMessage(new Error(errors.join('. ')), prefix)
      : new Error(
          errors
            .map((err) =>
              (err as Error).message ? (err as Error).message : err
            )
            .join('. ')
        )
  }

  /**
   * Returns session.
   * If there is a hot session available, it will be returned immediately and an asynchronous request to create new hot session will be submitted.
   * If there is no available session, 2 session creation requests will be submitted. The session is returned once it is created and ready.
   * @param accessToken - an optional access token.
   * @returns - a promise which resolves with a session.
   */
  async getSession(accessToken?: string) {
    const errors: (Error | string)[] = []
    let isErrorThrown = false

    const throwIfError = () => {
      if (errors.length && !isErrorThrown) {
        isErrorThrown = true

        this.throwErrors(errors)
      }
    }

    this.removeExpiredSessions()

    if (this.sessions.length) {
      const session = this.sessions[0]

      this.removeSessionFromPool(session)

      this.createSessions(accessToken).catch((err) => {
        errors.push(err)
      })

      this.createAndWaitForSession(accessToken).catch((err) => {
        errors.push(err)
      })

      throwIfError()

      return session
    } else {
      this.createSessions(accessToken).catch((err) => {
        errors.push(err)
      })

      await this.createAndWaitForSession(accessToken).catch((err) => {
        errors.push(err)
      })

      this.removeExpiredSessions()

      const session = this.sessions.pop()!

      this.removeSessionFromPool(session)

      throwIfError()

      return session
    }
  }

  /**
   * Returns error message based on the response from SAS API.
   * @param err - an optional access token.
   * @param accessToken - an optional access token.
   * @returns - an error message.
   */
  private getErrorMessage(
    err: ApiErrorResponse,
    url: string,
    method: 'GET' | 'POST' | 'DELETE'
  ) {
    return (
      `${method} request to ${url} failed with status code ${
        err.response.status || 'unknown'
      }. ` + err.response.data.message || ''
    )
  }

  /**
   * Deletes session.
   * @param id - a session id.
   * @param accessToken - an optional access token.
   * @returns - a promise which resolves when session is deleted.
   */
  async clearSession(id: string, accessToken?: string): Promise<void> {
    const url = `/compute/sessions/${id}`

    return await this.requestClient
      .delete<Session>(url, accessToken)
      .then(() => {
        this.sessions = this.sessions.filter((s) => s.id !== id)
      })
      .catch((err: ApiErrorResponse) => {
        throw prefixMessage(
          this.getErrorMessage(err, url, 'DELETE'),
          'Error while deleting session. '
        )
      })
  }

  /**
   * Creates sessions in amount equal to MAX_SESSION_COUNT.
   * @param accessToken - an optional access token.
   * @returns - a promise which resolves when required amount of sessions is created.
   */
  private async createSessions(accessToken?: string): Promise<void> {
    const errors: (Error | string)[] = []

    if (!this.sessions.length) {
      await asyncForEach(new Array(MAX_SESSION_COUNT), async () => {
        await this.createAndWaitForSession(accessToken).catch((err) => {
          errors.push(err)
        })
      })
    }

    if (errors.length) {
      this.throwErrors(errors, 'Error while creating session. ')
    }
  }

  /**
   * Waits for the current context to be set.
   * @returns - a promise which resolves when current context is set.
   */
  private async waitForCurrentContext(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (this.currentContext) {
          this.settingContext = false

          clearInterval(timer)

          resolve()
        }
      }, 100)
    })
  }

  /**
   * Creates and waits for session to be ready.
   * @param accessToken - an optional access token.
   * @returns - a promise which resolves with a session.
   */
  private async createAndWaitForSession(
    accessToken?: string
  ): Promise<Session> {
    if (!this.currentContext) {
      if (!this.settingContext) {
        await this.setCurrentContext(accessToken)
      } else {
        await this.waitForCurrentContext()
      }
    }

    const url = `${this.serverUrl}/compute/contexts/${
      this.currentContext!.id
    }/sessions`

    const { result: createdSession, etag } = await this.requestClient
      .post<Session>(url, {}, accessToken)
      .catch((err: ApiErrorResponse) => {
        throw prefixMessage(
          this.getErrorMessage(err, url, 'POST'),
          `Error while creating session. `
        )
      })

    await this.waitForSession(createdSession, etag, accessToken)

    this.sessions.push(createdSession)

    return createdSession
  }

  /**
   * Sets current context.
   * @param accessToken - an optional access token.
   * @returns - a promise which resolves when current context is set.
   */
  private async setCurrentContext(accessToken?: string): Promise<void> {
    if (!this.currentContext) {
      const url = `${this.serverUrl}/compute/contexts?limit=10000`

      this.settingContext = true

      const { result: contexts } = await this.requestClient
        .get<{
          items: Context[]
        }>(url, accessToken)
        .catch((err: ApiErrorResponse) => {
          throw prefixMessage(
            this.getErrorMessage(err, url, 'GET'),
            `Error while getting list of contexts. `
          )
        })

      const contextsList =
        contexts && contexts.items && contexts.items.length
          ? contexts.items
          : []

      const currentContext = contextsList.find(
        (c: any) => c.name === this.contextName
      )

      if (!currentContext) {
        throw new Error(
          `The context '${this.contextName}' was not found on the server ${this.serverUrl}.`
        )
      }

      this.currentContext = currentContext

      Promise.resolve()
    }
  }

  /**
   * Waits for session to be ready.
   * @param session - a session object.
   * @param etag - an etag that can be a string or null.
   * @param accessToken - an optional access token.
   * @returns - a promise which resolves with a session state.
   */
  private async waitForSession(
    session: Session,
    etag: string | null,
    accessToken?: string
  ): Promise<string> {
    const logger = process.logger || console

    let sessionState = session.state

    const stateLink = session.links.find((l: any) => l.rel === 'state')

    if (
      sessionState === 'pending' ||
      sessionState === 'running' ||
      sessionState === ''
    ) {
      if (stateLink) {
        if (this.debug && !this.printedSessionState.printed) {
          logger.info(`Polling: ${this.serverUrl + stateLink.href}`)

          this.printedSessionState.printed = true
        }

        const url = `${this.serverUrl}${stateLink.href}?wait=30`

        const { result: state, responseStatus: responseStatus } =
          await this.getSessionState(url, etag!, accessToken).catch((err) => {
            throw prefixMessage(err, 'Error while waiting for session. ')
          })

        sessionState = state.trim()

        if (this.debug && this.printedSessionState.state !== sessionState) {
          logger.info(`Current session state is '${sessionState}'`)

          this.printedSessionState.state = sessionState
          this.printedSessionState.printed = false
        }

        if (!sessionState) {
          const stateError = new NoSessionStateError(
            responseStatus,
            this.serverUrl + stateLink.href,
            session.links.find((l: any) => l.rel === 'log')?.href as string
          )

          if (
            !this.loggedErrors.find(
              (err: NoSessionStateError) =>
                err.serverResponseStatus === stateError.serverResponseStatus
            )
          ) {
            this.loggedErrors.push(stateError)

            logger.info(stateError.message)
          }

          return await this.waitForSession(session, etag, accessToken)
        }

        this.loggedErrors = []

        return sessionState
      } else {
        throw 'Error while getting session state link. '
      }
    } else {
      this.loggedErrors = []

      return sessionState
    }
  }

  /**
   * Gets session state.
   * @param url - a URL to get session state.
   * @param etag - an etag string.
   * @param accessToken - an optional access token.
   * @returns - a promise which resolves with a result string and response status.
   */
  private async getSessionState(
    url: string,
    etag: string,
    accessToken?: string
  ): Promise<{
    result: string
    responseStatus: number
  }> {
    return await this.requestClient
      .get(url, accessToken, 'text/plain', { 'If-None-Match': etag })
      .then((res) => ({
        result: res.result as string,
        responseStatus: res.status
      }))
      .catch((err) => {
        throw prefixMessage(
          this.getErrorMessage(err, url, 'GET'),
          'Error while getting session state. '
        )
      })
  }

  /**
   * Gets variable.
   * @param sessionId - a session id.
   * @param variable - a variable string.
   * @param accessToken - an optional access token.
   * @returns - a promise which resolves with a result that confirms to SessionVariable interface, etag string and status code.
   */
  async getVariable(
    sessionId: string,
    variable: string,
    accessToken?: string
  ): Promise<{
    result: SessionVariable
    etag: string
    status: number
  }> {
    const url = `${this.serverUrl}/compute/sessions/${sessionId}/variables/${variable}`

    return await this.requestClient
      .get<SessionVariable>(url, accessToken)
      .catch((err) => {
        throw prefixMessage(
          this.getErrorMessage(err, url, 'GET'),
          `Error while fetching session variable '${variable}'. `
        )
      })
  }
}
