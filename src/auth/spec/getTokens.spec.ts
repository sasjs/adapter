import { AuthConfig, ServerType } from '@sasjs/utils/types'
import * as refreshTokensModule from '../refreshTokensForViya'
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

    expect(refreshTokensModule.refreshTokensForViya).toHaveBeenCalledWith(
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

    expect(refreshTokensModule.refreshTokensForViya).toHaveBeenCalledWith(
      requestClient,
      authConfig.client,
      authConfig.secret,
      authConfig.refresh_token
    )
  })

  it('should fall back to the sas.cli public client when no client is configured', async () => {
    setupMocks()
    const access_token = generateToken(30)
    const refresh_token = generateToken(86400000)
    const authConfig = {
      access_token,
      refresh_token
    } as unknown as AuthConfig

    const result = await getTokens(requestClient, authConfig)

    expect(refreshTokensModule.refreshTokensForViya).toHaveBeenCalledWith(
      requestClient,
      'sas.cli',
      '',
      authConfig.refresh_token
    )
    expect(result.client).toEqual('sas.cli')
    expect(result.secret).toEqual('')
  })

  it('should not attempt to refresh when the access token is fresh and no client is configured', async () => {
    setupMocks()
    const access_token = generateToken(86400000)
    const refresh_token = generateToken(86400000)
    const authConfig = {
      access_token,
      refresh_token
    } as unknown as AuthConfig

    const result = await getTokens(requestClient, authConfig)

    expect(refreshTokensModule.refreshTokensForViya).not.toHaveBeenCalled()
    expect(result.access_token).toEqual(access_token)
  })

  it('should attempt to refresh with an opaque refresh token and an expiring access token', async () => {
    setupMocks()
    const access_token = generateToken(30)
    const refresh_token = 'opaque-refresh-token'
    const authConfig: AuthConfig = {
      access_token,
      refresh_token,
      client: 'cl13nt',
      secret: 's3cr3t'
    }

    await getTokens(requestClient, authConfig)

    expect(refreshTokensModule.refreshTokensForViya).toHaveBeenCalledWith(
      requestClient,
      authConfig.client,
      authConfig.secret,
      refresh_token
    )
  })

  it('should invoke onTokensRefreshed with the rotated pair after a refresh', async () => {
    setupMocks()
    const access_token = generateToken(30)
    const refresh_token = generateToken(86400000)
    const authConfig: AuthConfig = {
      access_token,
      refresh_token,
      client: 'cl13nt',
      secret: 's3cr3t'
    }
    const onTokensRefreshed = jest.fn()

    await getTokens(
      requestClient,
      authConfig,
      ServerType.SasViya,
      onTokensRefreshed
    )

    expect(onTokensRefreshed).toHaveBeenCalledWith({
      access_token: mockAuthResponse.access_token,
      refresh_token: mockAuthResponse.refresh_token
    })
  })

  it('should not invoke onTokensRefreshed when no refresh occurred', async () => {
    setupMocks()
    const access_token = generateToken(86400000)
    const refresh_token = generateToken(86400000)
    const authConfig: AuthConfig = {
      access_token,
      refresh_token,
      client: 'cl13nt',
      secret: 's3cr3t'
    }
    const onTokensRefreshed = jest.fn()

    await getTokens(
      requestClient,
      authConfig,
      ServerType.SasViya,
      onTokensRefreshed
    )

    expect(onTokensRefreshed).not.toHaveBeenCalled()
  })

  it('should surface a useful error when refresh fails with an opaque refresh token', async () => {
    setupMocks()
    jest
      .spyOn(refreshTokensModule, 'refreshTokensForViya')
      .mockRejectedValue(new Error('Invalid refresh token'))
    const access_token = generateToken(30)
    const refresh_token = 'opaque-refresh-token'
    const authConfig: AuthConfig = {
      access_token,
      refresh_token,
      client: 'cl13nt',
      secret: 's3cr3t'
    }

    const error = await getTokens(requestClient, authConfig).catch(
      (e: any) => e
    )

    expect(error.message).toEqual('Invalid refresh token')
    expect(refreshTokensModule.refreshTokensForViya).toHaveBeenCalledWith(
      requestClient,
      authConfig.client,
      authConfig.secret,
      refresh_token
    )
  })

  it('should not fail the refresh when the onTokensRefreshed handler throws', async () => {
    setupMocks()
    const access_token = generateToken(30)
    const refresh_token = generateToken(86400000)
    const authConfig: AuthConfig = {
      access_token,
      refresh_token,
      client: 'cl13nt',
      secret: 's3cr3t'
    }
    const onTokensRefreshed = jest
      .fn()
      .mockRejectedValue(new Error('disk write failed'))

    const result = await getTokens(
      requestClient,
      authConfig,
      ServerType.SasViya,
      onTokensRefreshed
    )

    expect(result.access_token).toEqual(mockAuthResponse.access_token)
    expect(result.refresh_token).toEqual(mockAuthResponse.refresh_token)
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

    const error = await getTokens(requestClient, authConfig).catch(
      (e: any) => e
    )

    expect(error.message).toEqual(expectedError)
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('../../request/RequestClient')
  jest.mock('../refreshTokensForViya')

  jest
    .spyOn(refreshTokensModule, 'refreshTokensForViya')
    .mockImplementation(() => Promise.resolve(mockAuthResponse))
}
