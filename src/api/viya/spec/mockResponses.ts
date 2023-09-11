import { AuthConfig } from '@sasjs/utils/types'
import { Job, Session, SessionState } from '../../../types'

export const mockSession: Session = {
  id: 's35510n',
  state: SessionState.Idle,
  stateUrl: '',
  links: [],
  attributes: {
    sessionInactiveTimeout: 1
  },
  creationTimeStamp: new Date().valueOf().toString(),
  etag: 'etag-string'
}

export const mockJob: Job = {
  id: 'j0b',
  name: 'test job',
  uri: '/j0b',
  createdBy: 'test user',
  results: {
    '_webout.json': 'test'
  },
  logStatistics: {
    lineCount: 100,
    modifiedTimeStamp: new Date().valueOf().toString()
  },
  links: [
    {
      rel: 'log',
      href: '/log',
      method: 'GET',
      type: 'log',
      uri: 'log'
    },
    {
      rel: 'self',
      href: '/job',
      method: 'GET',
      type: 'job',
      uri: 'job'
    },
    {
      rel: 'state',
      href: '/state',
      method: 'GET',
      type: 'state',
      uri: 'state'
    },
    {
      rel: 'up',
      href: '/job',
      method: 'GET',
      type: 'up',
      uri: 'job'
    }
  ]
}

export const mockAuthConfig: AuthConfig = {
  client: 'cl13nt',
  secret: '53cr3t',
  access_token: 'acc355',
  refresh_token: 'r3fr35h'
}

export class MockStream {
  _write(chunk: string, _: any, next: Function) {
    next()
  }

  reset() {}

  destroy() {}
}
