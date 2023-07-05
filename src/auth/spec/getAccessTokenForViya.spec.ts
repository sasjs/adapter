import { AuthConfig } from '@sasjs/utils/types'
import * as NodeFormData from 'form-data'
import { generateToken, mockAuthResponse } from './mockResponses'
import { RequestClient } from '../../request/RequestClient'
import { getAccessTokenForViya } from '../getAccessTokenForViya'

const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()

describe('getAccessTokenForViya', () => {
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
        Promise.resolve({ result: mockAuthResponse, etag: '' })
      )
    const token = Buffer.from(
      authConfig.client + ':' + authConfig.secret
    ).toString('base64')

    await getAccessTokenForViya(
      requestClient,
      authConfig.client,
      authConfig.secret,
      authConfig.refresh_token
    )

    expect(requestClient.post).toHaveBeenCalledWith(
      '/SASLogon/oauth/token',
      expect.any(URLSearchParams),
      undefined,
      'application/x-www-form-urlencoded',
      {
        Authorization: 'Basic ' + token,
        Accept: 'application/json'
      }
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

    const error = await getAccessTokenForViya(
      requestClient,
      authConfig.client,
      authConfig.secret,
      authConfig.refresh_token
    ).catch((e: any) => e)

    expect(error).toContain('Error while fetching access token')
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('../../request/RequestClient')
}
