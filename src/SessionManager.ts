import { Session, Context, SessionVariable } from './types'
import { NoSessionStateError } from './types/errors'
import { asyncForEach, isUrl } from './utils'
import { prefixMessage } from '@sasjs/utils/error'
import { RequestClient } from './request/RequestClient'

const MAX_SESSION_COUNT = 1

export class SessionManager {
  private loggedErrors: NoSessionStateError[] = []

  constructor(
    private serverUrl: string,
    private contextName: string,
    private requestClient: RequestClient
  ) {
    if (serverUrl) isUrl(serverUrl)
  }

  private sessions: Session[] = []
  private currentContext: Context | null = null
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

  async getSession(accessToken?: string) {
    await this.createSessions(accessToken)
    await this.createAndWaitForSession(accessToken)
    const session = this.sessions.pop()
    const secondsSinceSessionCreation =
      (new Date().getTime() - new Date(session!.creationTimeStamp).getTime()) /
      1000

    if (
      !session!.attributes ||
      secondsSinceSessionCreation >= session!.attributes.sessionInactiveTimeout
    ) {
      await this.createSessions(accessToken)
      const freshSession = this.sessions.pop()

      return freshSession
    }

    return session
  }

  async clearSession(id: string, accessToken?: string) {
    return await this.requestClient
      .delete<Session>(`/compute/sessions/${id}`, accessToken)
      .then(() => {
        this.sessions = this.sessions.filter(s => s.id !== id)
      })
      .catch(err => {
        throw prefixMessage(err, 'Error while deleting session. ')
      })
  }

  private async createSessions(accessToken?: string) {
    if (!this.sessions.length) {
      if (!this.currentContext) {
        await this.setCurrentContext(accessToken).catch(err => {
          throw err
        })
      }

      await asyncForEach(new Array(MAX_SESSION_COUNT), async () => {
        const createdSession = await this.createAndWaitForSession(
          accessToken
        ).catch(err => {
          throw err
        })

        this.sessions.push(createdSession)
      }).catch(err => {
        throw err
      })
    }
  }

  private async createAndWaitForSession(accessToken?: string) {
    const { result: createdSession, etag } = await this.requestClient
      .post<Session>(
        `${this.serverUrl}/compute/contexts/${
          this.currentContext!.id
        }/sessions`,
        {},
        accessToken
      )
      .catch(err => {
        throw err
      })

    await this.waitForSession(createdSession, etag, accessToken)

    this.sessions.push(createdSession)

    return createdSession
  }

  private async setCurrentContext(accessToken?: string) {
    if (!this.currentContext) {
      const { result: contexts } = await this.requestClient
        .get<{
          items: Context[]
        }>(`${this.serverUrl}/compute/contexts?limit=10000`, accessToken)
        .catch(err => {
          throw err
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

  private getHeaders(accessToken?: string) {
    const headers: any = {
      'Content-Type': 'application/json'
    }

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    return headers
  }

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

        const {
          result: state,
          responseStatus: responseStatus
        } = await this.getSessionState(
          `${this.serverUrl}${stateLink.href}?wait=30`,
          etag!,
          accessToken
        ).catch(err => {
          throw prefixMessage(err, 'Error while getting session state.')
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
        throw 'Error while getting session state link.'
      }
    } else {
      this.loggedErrors = []

      return sessionState
    }
  }

  private async getSessionState(
    url: string,
    etag: string,
    accessToken?: string
  ) {
    return await this.requestClient
      .get(url, accessToken, 'text/plain', { 'If-None-Match': etag })
      .then(res => ({
        result: res.result as string,
        responseStatus: res.status
      }))
      .catch(err => {
        throw err
      })
  }

  async getVariable(sessionId: string, variable: string, accessToken?: string) {
    return await this.requestClient
      .get<SessionVariable>(
        `${this.serverUrl}/compute/sessions/${sessionId}/variables/${variable}`,
        accessToken
      )
      .catch(err => {
        throw prefixMessage(
          err,
          `Error while fetching session variable '${variable}'.`
        )
      })
  }
}
