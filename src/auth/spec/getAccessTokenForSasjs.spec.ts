import { AuthConfig } from '@sasjs/utils/types'
import { generateToken, mockSasjsAuthResponse } from './mockResponses'
import { RequestClient } from '../../request/RequestClient'
import { getAccessTokenForSasjs } from '../getAccessTokenForSasjs'

const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()

describe('getAccessTokenForSasjs', () => {
  it('should attempt to refresh tokens', async () => {
    setupMocks()
    const access_token = generateToken(30)
    const refresh_token = generateToken(30)
    const authConfig: AuthConfig = {
      access_token,
      refresh_token,
      client: 'cl13nt',
      secret: 's3cr3t'
    }
    jest
      .spyOn(requestClient, 'post')
      .mockImplementation(() =>
        Promise.resolve({ result: mockSasjsAuthResponse, etag: '' })
      )

    await getAccessTokenForSasjs(
      requestClient,
      authConfig.client!,
      authConfig.refresh_token
    )

    expect(requestClient.post).toHaveBeenCalledWith(
      '/SASjsApi/auth/token',
      { clientId: authConfig.client, code: authConfig.refresh_token },
      undefined
    )
  })

  it('should post to the configured mount, not the default one', async () => {
    setupMocks()
    jest
      .spyOn(requestClient, 'post')
      .mockImplementation(() =>
        Promise.resolve({ result: mockSasjsAuthResponse, etag: '' })
      )

    await getAccessTokenForSasjs(requestClient, 'cl13nt', 'c0de', '/api')

    expect(requestClient.post).toHaveBeenCalledWith(
      '/api/auth/token',
      { clientId: 'cl13nt', code: 'c0de' },
      undefined
    )
  })

  it('should normalise the mount it is given', async () => {
    setupMocks()
    jest
      .spyOn(requestClient, 'post')
      .mockImplementation(() =>
        Promise.resolve({ result: mockSasjsAuthResponse, etag: '' })
      )

    await getAccessTokenForSasjs(requestClient, 'cl13nt', 'c0de', 'api/')

    expect(requestClient.post).toHaveBeenCalledWith(
      '/api/auth/token',
      { clientId: 'cl13nt', code: 'c0de' },
      undefined
    )
  })

  it('should not compose a protocol-relative url at a root mount', async () => {
    // normalise() gives '/', so concatenating it produced '//auth/token', which
    // axios reads as protocol-relative: a request to a host called `auth`.
    setupMocks()
    jest
      .spyOn(requestClient, 'post')
      .mockImplementation(() =>
        Promise.resolve({ result: mockSasjsAuthResponse, etag: '' })
      )

    await getAccessTokenForSasjs(requestClient, 'cl13nt', 'c0de', '/')

    expect(requestClient.post).toHaveBeenCalledWith(
      '/auth/token',
      { clientId: 'cl13nt', code: 'c0de' },
      undefined
    )
  })

  it('should handle errors while refreshing tokens', async () => {
    setupMocks()
    const access_token = generateToken(30)
    const refresh_token = generateToken(30)
    const authConfig: AuthConfig = {
      access_token,
      refresh_token,
      client: 'cl13nt',
      secret: 's3cr3t'
    }
    jest
      .spyOn(requestClient, 'post')
      .mockImplementation(() => Promise.reject('Token Error'))

    const error = await getAccessTokenForSasjs(
      requestClient,
      authConfig.client!,
      authConfig.refresh_token
    ).catch((e: any) => e)

    expect(error).toContain('Error while fetching access token')
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('../../request/RequestClient')
}
