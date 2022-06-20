import { AuthConfig } from '@sasjs/utils'
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
      authConfig.client,
      authConfig.refresh_token
    )

    expect(requestClient.post).toHaveBeenCalledWith(
      '/SASjsApi/auth/token',
      { clientId: authConfig.client, code: authConfig.refresh_token },
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
      authConfig.client,
      authConfig.refresh_token
    ).catch((e: any) => e)

    expect(error).toContain('Error while getting access token')
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('../../request/RequestClient')
}
