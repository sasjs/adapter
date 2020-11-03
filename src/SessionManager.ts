import { Session, Context, CsrfToken } from './types'
import { asyncForEach, makeRequest, isUrl } from './utils'

const MAX_SESSION_COUNT = 1
const RETRY_LIMIT: number = 3
let RETRY_COUNT: number = 0
const INTERNAL_SAS_ERROR = {
  status: 304,
  message: 'Not Modified'
}

export class SessionManager {
  constructor(
    private serverUrl: string,
    private contextName: string,
    private setCsrfToken: (csrfToken: CsrfToken) => void
  ) {
    if (serverUrl) isUrl(serverUrl)
  }

  private sessions: Session[] = []
  private currentContext: Context | null = null
  private csrfToken: CsrfToken | null = null
  private _debug: boolean = false

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
    const deleteSessionRequest = {
      method: 'DELETE',
      headers: this.getHeaders(accessToken)
    }

    return await this.request<Session>(
      `${this.serverUrl}/compute/sessions/${id}`,
      deleteSessionRequest
    )
      .then(() => {
        this.sessions = this.sessions.filter((s) => s.id !== id)
      })
      .catch((err) => {
        throw err
      })
  }

  private async createSessions(accessToken?: string) {
    if (!this.sessions.length) {
      if (!this.currentContext) {
        await this.setCurrentContext(accessToken).catch((err) => {
          throw err
        })
      }

      await asyncForEach(new Array(MAX_SESSION_COUNT), async () => {
        const createdSession = await this.createAndWaitForSession(
          accessToken
        ).catch((err) => {
          throw err
        })

        this.sessions.push(createdSession)
      }).catch((err) => {
        throw err
      })
    }
  }

  private async createAndWaitForSession(accessToken?: string) {
    const createSessionRequest = {
      method: 'POST',
      headers: this.getHeaders(accessToken)
    }

    const { result: createdSession, etag } = await this.request<Session>(
      `${this.serverUrl}/compute/contexts/${this.currentContext!.id}/sessions`,
      createSessionRequest
    ).catch((err) => {
      throw err
    })

    await this.waitForSession(createdSession, etag, accessToken)

    this.sessions.push(createdSession)

    return createdSession
  }

  private async setCurrentContext(accessToken?: string) {
    if (!this.currentContext) {
      const { result: contexts } = await this.request<{
        items: Context[]
      }>(`${this.serverUrl}/compute/contexts?limit=10000`, {
        headers: this.getHeaders(accessToken)
      }).catch((err) => {
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
  ) {
    let sessionState = session.state
    const headers: any = {
      ...this.getHeaders(accessToken),
      'If-None-Match': etag
    }
    const stateLink = session.links.find((l: any) => l.rel === 'state')

    return new Promise(async (resolve, _) => {
      if (sessionState === 'pending') {
        if (stateLink) {
          if (this.debug) {
            console.log('Polling session status... \n') // ?
          }

          const { result: state } = await this.requestSessionStatus<string>(
            `${this.serverUrl}${stateLink.href}?wait=30`,
            {
              headers
            },
            'text'
          ).catch((err) => {
            throw err
          })

          sessionState = state.trim()

          if (this.debug) {
            console.log(`Current state is '${sessionState}'\n`)
          }

          // There is an internal error present in SAS Viya 3.5
          // Retry to wait for a session status in such case of SAS internal error
          if (
            sessionState === INTERNAL_SAS_ERROR.message &&
            RETRY_COUNT < RETRY_LIMIT
          ) {
            RETRY_COUNT++

            resolve(this.waitForSession(session, etag, accessToken))
          }

          resolve(sessionState)
        }
      } else {
        resolve(sessionState)
      }
    })
  }

  private async request<T>(
    url: string,
    options: RequestInit,
    contentType: 'text' | 'json' = 'json'
  ) {
    if (this.csrfToken) {
      options.headers = {
        ...options.headers,
        [this.csrfToken.headerName]: this.csrfToken.value
      }
    }

    return await makeRequest<T>(
      url,
      options,
      (token) => {
        this.csrfToken = token
        this.setCsrfToken(token)
      },
      contentType
    ).catch((err) => {
      throw err
    })
  }

  private async requestSessionStatus<T>(
    url: string,
    options: RequestInit,
    contentType: 'text' | 'json' = 'json'
  ) {
    if (this.csrfToken) {
      options.headers = {
        ...options.headers,
        [this.csrfToken.headerName]: this.csrfToken.value
      }
    }

    return await makeRequest<T>(
      url,
      options,
      (token) => {
        this.csrfToken = token
        this.setCsrfToken(token)
      },
      contentType
    ).catch((err) => {
      if (err.status === INTERNAL_SAS_ERROR.status)
        return { result: INTERNAL_SAS_ERROR.message }

      throw err
    })
  }
}
