import { AuthConfig, ServerType } from '@sasjs/utils/types'
import NodeFormData from 'form-data'
import { generateToken, mockAuthResponse } from './mockResponses'
import { RequestClient } from '../../request/RequestClient'
import { refreshTokensForViya } from '../refreshTokensForViya'
import * as IsNodeModule from '../../utils/isNode'
import { getTokenRequestErrorPrefixResponse } from '../getTokenRequestErrorPrefix'

const requestClient = new (<jest.Mock<RequestClient>>RequestClient)()

describe('refreshTokensForViya', () => {
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

    await refreshTokensForViya(
      requestClient,
      authConfig.client,
      authConfig.secret,
      authConfig.refresh_token
    )

    expect(requestClient.post).toHaveBeenCalledWith(
      '/SASLogon/oauth/token',
      expect.any(NodeFormData),
      undefined,
      expect.stringContaining('multipart/form-data; boundary='),
      {
        Authorization: 'Basic ' + token
      }
    )
  })

  it('should handle errors while refreshing tokens', async () => {
    setupMocks()

    const access_token = generateToken(30)
    const refresh_token = generateToken(30)
    const tokenError = 'unable to verify the first certificate'
    const authConfig: AuthConfig = {
      access_token,
      refresh_token,
      client: 'cl13nt',
      secret: 's3cr3t'
    }

    jest
      .spyOn(requestClient, 'post')
      .mockImplementation(() => Promise.reject(tokenError))

    const error = await refreshTokensForViya(
      requestClient,
      authConfig.client,
      authConfig.secret,
      authConfig.refresh_token
    ).catch((e: any) =>
      getTokenRequestErrorPrefixResponse(e, ServerType.SasViya)
    )

    expect(error).toEqual(tokenError)
  })

  it('should throw an error if environment is not Node', async () => {
    jest.spyOn(IsNodeModule, 'isNode').mockImplementation(() => false)

    const expectedError = new Error(
      `Method 'refreshTokensForViya' can only be used by Node.`
    )

    expect(
      refreshTokensForViya(requestClient, 'client', 'secret', 'token')
    ).rejects.toEqual(expectedError)
  })
})

const setupMocks = () => {
  jest.restoreAllMocks()
  jest.mock('../../request/RequestClient')
}
