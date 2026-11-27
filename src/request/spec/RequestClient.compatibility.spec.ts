import { RequestClient } from '../RequestClient'

// Existing consumers can subclass the public client without returning HTTP status.
class LegacyRequestClient extends RequestClient {
  public async put<T>(
    _url: string,
    _data: any,
    _accessToken: string | undefined,
    _overrideHeaders: { [key: string]: string | number } = {}
  ): Promise<{ result: T; etag: string }> {
    return { result: undefined as T, etag: '' }
  }
}

it('refuses to copy CSRF state to a different deployment server', () => {
  const client = new RequestClient('https://source.example')
  expect(() =>
    client.forDeployment(
      'https://other.example',
      undefined,
      undefined,
      undefined,
      true
    )
  ).toThrow()
})

it('accepts a legacy RequestClient put override', () => {
  const client: RequestClient = new LegacyRequestClient('http://localhost')
  expect(client).toBeInstanceOf(RequestClient)
})
