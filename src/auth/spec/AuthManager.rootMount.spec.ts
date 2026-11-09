import { ServerType } from '@sasjs/utils/types'
import { AuthManager } from '../AuthManager'

/**
 * A root mount is a documented shape - the API at the origin, which is what a
 * proxy produces. The session probe is the one place AuthManager composes a URL
 * by hand, and a doubled slash there never resolves a user: the request misses,
 * isLoggedIn is false, and the app shows a login form that cannot work.
 */
describe('AuthManager at a root mount', () => {
  it('asks for the session at /session, not //session', async () => {
    const get = jest.fn().mockResolvedValue({ result: 'someuser' })
    const authManager = new AuthManager(
      'https://host.example.com',
      ServerType.Sasjs,
      { get, post: jest.fn() } as any,
      async () => {},
      '/'
    )

    await (authManager as any).fetchUserName()

    expect(get.mock.calls[0][0]).toBe('https://host.example.com/session')
  })
})
