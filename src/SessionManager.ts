import { Session, Context, CsrfToken } from "./types";
import { asyncForEach, makeRequest } from "./utils";

const MAX_SESSION_COUNT = 1;

export class SessionManager {
  constructor(
    private serverUrl: string,
    private contextName: string,
    private setCsrfToken: (csrfToken: CsrfToken) => void
  ) {}
  private sessions: Session[] = [];
  private currentContext: Context | null = null;
  private csrfToken: CsrfToken | null = null;

  async getSession(accessToken?: string) {
    await this.createSessions(accessToken);
    this.createAndWaitForSession(accessToken);
    const session = this.sessions.pop();
    const secondsSinceSessionCreation =
      (new Date().getTime() - new Date(session!.creationTimeStamp).getTime()) /
      1000;
    if (
      secondsSinceSessionCreation >= session!.attributes.sessionInactiveTimeout
    ) {
      await this.createSessions(accessToken);
      const freshSession = this.sessions.pop();
      return freshSession;
    }
    return session;
  }

  async clearSession(id: string, accessToken?: string) {
    const deleteSessionRequest = {
      method: "DELETE",
      headers: this.getHeaders(accessToken)
    };
    return await this.request<Session>(
      `${this.serverUrl}/compute/sessions/${id}`,
      deleteSessionRequest
    ).then(() => {
      this.sessions = this.sessions.filter((s) => s.id !== id);
    });
  }

  private async createSessions(accessToken?: string) {
    if (!this.sessions.length) {
      if (!this.currentContext) {
        await this.setCurrentContext(accessToken);
      }
      await asyncForEach(new Array(MAX_SESSION_COUNT), async () => {
        const createdSession = await this.createAndWaitForSession(accessToken);
        this.sessions.push(createdSession);
      });
    }
  }

  private async createAndWaitForSession(accessToken?: string) {
    const createSessionRequest = {
      method: "POST",
      headers: this.getHeaders(accessToken)
    };
    const { result: createdSession, etag } = await this.request<Session>(
      `${this.serverUrl}/compute/contexts/${this.currentContext!.id}/sessions`,
      createSessionRequest
    );

    await this.waitForSession(createdSession, etag);
    this.sessions.push(createdSession);
    return createdSession;
  }

  private async setCurrentContext(accessToken?: string) {
    if (!this.currentContext) {
      const { result: contexts } = await this.request<{
        items: Context[];
      }>(`${this.serverUrl}/compute/contexts`, {
        headers: this.getHeaders(accessToken)
      });

      const contextsList =
        contexts && contexts.items && contexts.items.length
          ? contexts.items
          : [];

      const currentContext = contextsList.find(
        (c: any) => c.name === this.contextName
      );

      if (!currentContext) {
        throw new Error(
          `The context ${this.contextName} was not found on the server ${this.serverUrl}`
        );
      }

      this.currentContext = currentContext;
    }
  }

  private getHeaders(accessToken?: string) {
    const headers: any = {
      "Content-Type": "application/json"
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    return headers;
  }

  private async waitForSession(
    session: Session,
    etag: string | null,
    accessToken?: string,
    silent = false
  ) {
    let sessionState = session.state;
    const headers: any = {
      ...this.getHeaders(accessToken),
      "If-None-Match": etag
    };
    const stateLink = session.links.find((l: any) => l.rel === "state");
    return new Promise(async (resolve, _) => {
      if (sessionState === "pending") {
        if (stateLink) {
          if (!silent) {
            console.log("Polling session status... \n");
          }
          const { result: state } = await this.request<string>(
            `${this.serverUrl}${stateLink.href}?wait=30`,
            {
              headers
            },
            "text"
          );

          sessionState = state.trim();
          if (!silent) {
            console.log(`Current state: ${sessionState}\n`);
          }
          resolve(sessionState);
        }
      } else {
        resolve(sessionState);
      }
    });
  }

  private async request<T>(
    url: string,
    options: RequestInit,
    contentType: "text" | "json" = "json"
  ) {
    if (this.csrfToken) {
      options.headers = {
        ...options.headers,
        [this.csrfToken.headerName]: this.csrfToken.value
      };
    }
    return await makeRequest<T>(
      url,
      options,
      (token) => {
        this.csrfToken = token;
        this.setCsrfToken(token);
      },
      contentType
    );
  }
}
