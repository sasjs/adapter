import { Link } from './Link'
import { SessionManager } from '../SessionManager'

export enum SessionState {
  Completed = 'completed',
  Running = 'running',
  Pending = 'pending',
  Idle = 'idle',
  Unavailable = 'unavailable',
  NoState = '',
  Failed = 'failed',
  Error = 'error'
}

export interface Session {
  id: string
  state: SessionState
  stateUrl: string
  links: Link[]
  attributes: {
    sessionInactiveTimeout: number
  }
  creationTimeStamp: string
  etag: string
}

export interface SessionVariable {
  value: string
}

export interface JobSessionManager {
  session: Session
  sessionManager: SessionManager
}
