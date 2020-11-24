import dotenv from 'dotenv'
import { SessionManager } from '../SessionManager'
import { CsrfToken } from '../types'

describe('SessionManager', () => {
  const setCsrfToken = jest
    .fn()
    .mockImplementation((csrfToken: CsrfToken) => console.log(csrfToken))

  beforeAll(() => {
      dotenv.config()
  })

  it('should instantiate', () => {
    const sessionManager = new SessionManager(
      'http://test-server.com',
      'test context',
      setCsrfToken
    )

    expect(sessionManager).toBeInstanceOf(SessionManager)
    expect(sessionManager.debug).toBeFalsy()
    expect((sessionManager as any).serverUrl).toEqual('http://test-server.com')
    expect((sessionManager as any).contextName).toEqual('test context')
  })

  it('should set the debug flag', () => {
    const sessionManager = new SessionManager(
      'http://test-server.com',
      'test context',
      setCsrfToken
    )

    sessionManager.debug = true

    expect(sessionManager.debug).toBeTruthy()
  })
})
