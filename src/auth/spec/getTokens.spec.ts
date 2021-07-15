import { AuthConfig } from '@sasjs/utils'
import * as refreshTokensModule from '../refreshTokens'
import { generateToken, mockAuthResponse } from './mockResponses'
import { getTokens } from '../getTokens'
import { RequestClient } from '../../request/RequestClient'

const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()

describe('getTokens', () => {
  it('should attempt to refresh tokens if the access token is expiring', async () => {
    setupMocks()
    const access_token = generateToken(30)
    const refresh_token = generateToken(86400000)
    const authConfig: AuthConfig = {
      access_token,
      refresh_token,
      client: 'cl13nt',
      secret: 's3cr3t'
    }

    await getTokens(requestClient, authConfig)

    expect(refreshTokensModule.refreshTokens).toHaveBeenCalledWith(
      requestClient,
      authConfig.client,
      authConfig.secret,
      authConfig.refresh_token
    )
  })

  it('should attempt to refresh tokens if the refresh token is expiring', async () => {
    setupMocks()
    const access_token = generateToken(86400000)
    const refresh_token = generateToken(30)
    const authConfig: AuthConfig = {
      access_token,
      refresh_token,
      client: 'cl13nt',
      secret: 's3cr3t'
    }

    await getTokens(requestClient, authConfig)

    expect(refreshTokensModule.refreshTokens).toHaveBeenCalledWith(
      requestClient,
      authConfig.client,
      authConfig.secret,
      authConfig.refresh_token
    )
  })

  it('should throw an error if the refresh token has already expired', async () => {
    setupMocks()
    const access_token = generateToken(86400000)
    const refresh_token = generateToken(-36000)
    const authConfig: AuthConfig = {
      access_token,
      refresh_token,
      client: 'cl13nt',
      secret: 's3cr3t'
    }
    const expectedError =
      'Unable to obtain new access token. Your refresh token has expired.'

    const error = await getTokens(requestClient, authConfig).catch((e) => e)

    expect(error.message).toEqual(expectedError)
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('../../request/RequestClient')
  jest.mock('../refreshTokens')

  jest
    .spyOn(refreshTokensModule, 'refreshTokens')
    .mockImplementation(() => Promise.resolve(mockAuthResponse))
}
