import NodeFormData from 'form-data'
import {
  SASjsApiClient,
  SASjsAuthResponse,
  ScriptExecutionResult
} from '../SASjsApiClient'
import { AuthConfig, ServicePackSASjs } from '@sasjs/utils/types'
import { ExecutionQuery } from '../types'

// Create a mock request client with a post method.
const mockPost = jest.fn()
const mockRequestClient = {
  post: mockPost
}

// Instead of referencing external variables, inline the dummy values in the mock factories.
jest.mock('../auth/getTokens', () => ({
  getTokens: jest.fn().mockResolvedValue({ access_token: 'dummyAccessToken' })
}))

jest.mock('../auth/getAccessTokenForSasjs', () => ({
  getAccessTokenForSasjs: jest.fn().mockResolvedValue({
    access_token: 'newAccessToken',
    refresh_token: 'newRefreshToken'
  } as any)
}))

jest.mock('../auth/refreshTokensForSasjs', () => ({
  refreshTokensForSasjs: jest.fn().mockResolvedValue({
    access_token: 'newAccessToken',
    refresh_token: 'newRefreshToken'
  } as any)
}))

// For deployZipFile, mock the file reading function.
jest.mock('@sasjs/utils/file', () => ({
  createReadStream: jest.fn().mockResolvedValue('readStreamDummy')
}))

// Dummy result to compare against.
const dummyResult = {
  status: 'OK',
  message: 'Success',
  streamServiceName: 'service',
  example: {}
}

describe('SASjsApiClient', () => {
  let client: SASjsApiClient

  beforeEach(() => {
    client = new SASjsApiClient(mockRequestClient as any)
    mockPost.mockReset()
  })

  describe('deploy', () => {
    it('should deploy service pack using JSON', async () => {
      // Arrange: Simulate a successful response.
      mockPost.mockResolvedValue({ result: dummyResult })

      const dataJson: ServicePackSASjs = {
        appLoc: '',
        someOtherProp: 'value'
      } as any
      const appLoc = '/base/appLoc'
      const authConfig: AuthConfig = {
        client: 'clientId',
        secret: 'secret',
        access_token: 'token',
        refresh_token: 'refresh'
      }

      // Act
      const result = await client.deploy(dataJson, appLoc, authConfig)

      // Assert: Ensure that the JSON gets the appLoc set if not defined.
      expect(dataJson.appLoc).toBe(appLoc)
      expect(mockPost).toHaveBeenCalledWith(
        'SASjsApi/drive/deploy',
        dataJson,
        'dummyAccessToken',
        undefined,
        {},
        { maxContentLength: Infinity, maxBodyLength: Infinity }
      )
      expect(result).toEqual(dummyResult)
    })
  })

  describe('deployZipFile', () => {
    it('should deploy zip file and return the result', async () => {
      // Arrange: Simulate a successful response.
      mockPost.mockResolvedValue({ result: dummyResult })
      const zipFilePath = 'path/to/deploy.zip'
      const authConfig: AuthConfig = {
        client: 'clientId',
        secret: 'secret',
        access_token: 'token',
        refresh_token: 'refresh'
      }

      // Act
      const result = await client.deployZipFile(zipFilePath, authConfig)

      // Assert: Verify that POST is called with multipart form-data.
      expect(mockPost).toHaveBeenCalled()
      const callArgs = mockPost.mock.calls[0]
      expect(callArgs[0]).toBe('SASjsApi/drive/deploy/upload')
      expect(result).toEqual(dummyResult)
    })
  })

  describe('executeJob', () => {
    it('should execute a job with absolute program path', async () => {
      // Arrange
      const query: ExecutionQuery = { _program: '/absolute/path' } as any
      const appLoc = '/base/appLoc'
      const authConfig: AuthConfig = { access_token: 'anyToken' } as any
      mockPost.mockResolvedValue({
        result: { jobId: 123 },
        log: 'execution log'
      })

      // Act
      const { result, log } = await client.executeJob(query, appLoc, authConfig)

      // Assert: The program path should not be prefixed.
      expect(mockPost).toHaveBeenCalledWith(
        'SASjsApi/stp/execute',
        { _debug: 131, ...query, _program: '/absolute/path' },
        'anyToken'
      )
      expect(result).toEqual({ jobId: 123 })
      expect(log).toBe('execution log')
    })

    it('should execute a job with relative program path', async () => {
      // Arrange
      const query: ExecutionQuery = { _program: 'relative/path' } as any
      const appLoc = '/base/appLoc'
      mockPost.mockResolvedValue({ result: { jobId: 456 }, log: 'another log' })

      // Act
      const { result, log } = await client.executeJob(query, appLoc)

      // Assert: The program path should be prefixed with appLoc.
      expect(mockPost).toHaveBeenCalledWith(
        'SASjsApi/stp/execute',
        { _debug: 131, ...query, _program: '/base/appLoc/relative/path' },
        undefined
      )
      expect(result).toEqual({ jobId: 456 })
      expect(log).toBe('another log')
    })
  })

  describe('executeScript', () => {
    it('should execute a script and return the execution result', async () => {
      // Arrange
      const code = 'data _null_; run;'
      const runTime = 'sas'
      const authConfig: AuthConfig = {
        client: 'clientId',
        secret: 'secret',
        access_token: 'token',
        refresh_token: 'refresh'
      }
      const responsePayload = {
        log: 'log output',
        printOutput: 'print output',
        result: 'web output'
      }
      mockPost.mockResolvedValue(responsePayload)

      // Act
      const result: ScriptExecutionResult = await client.executeScript(
        code,
        runTime,
        authConfig
      )

      // Assert
      expect(mockPost).toHaveBeenCalledWith(
        'SASjsApi/code/execute',
        { code, runTime },
        'dummyAccessToken'
      )
      expect(result.log).toBe('log output')
      expect(result.printOutput).toBe('print output')
      expect(result.webout).toBe('web output')
    })

    it('should throw an error with a prefixed message when POST fails', async () => {
      // Arrange
      const code = 'data _null_; run;'
      const errorMessage = 'Network Error'
      mockPost.mockRejectedValue(new Error(errorMessage))

      // Act & Assert
      await expect(client.executeScript(code)).rejects.toThrow(
        /Error while sending POST request to execute code/
      )
    })
  })

  describe('getAccessToken', () => {
    it('should exchange auth code for access token', async () => {
      // Act
      const result = await client.getAccessToken('clientId', 'authCode123')

      // Assert: The result should match the dummy auth response.
      expect(result).toEqual({
        access_token: 'newAccessToken',
        refresh_token: 'newRefreshToken'
      })
    })
  })

  describe('refreshTokens', () => {
    it('should exchange refresh token for new tokens', async () => {
      // Act
      const result = await client.refreshTokens('refreshToken123')

      // Assert: The result should match the dummy auth response.
      expect(result).toEqual({
        access_token: 'newAccessToken',
        refresh_token: 'newRefreshToken'
      })
    })
  })
})
