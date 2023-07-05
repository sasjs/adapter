import * as pem from 'pem'
import * as http from 'http'
import * as https from 'https'
import { app, mockedAuthResponse } from './SAS_server_app'
import { ServerType } from '@sasjs/utils/types'
import SASjs from '../SASjs'
import * as axiosModules from '../utils/createAxiosInstance'
import {
  LoginRequiredError,
  AuthorizeError,
  NotFoundError,
  InternalServerError
} from '../types/errors'
import { RequestClient } from '../request/RequestClient'
import { getTokenRequestErrorPrefixResponse } from '../auth/getTokenRequestErrorPrefix'

const axiosActual = jest.requireActual('axios')

jest
  .spyOn(axiosModules, 'createAxiosInstance')
  .mockImplementation((baseURL: string, httpsAgent?: https.Agent) =>
    axiosActual.create({ baseURL, httpsAgent })
  )

const PORT = 8000
const SERVER_URL = `https://localhost:${PORT}/`

const ERROR_MESSAGES = {
  selfSigned: 'self signed certificate',
  CCA: 'unable to verify the first certificate'
}

const incorrectAuthCodeErr = {
  error: 'unauthorized',
  error_description: 'Bad credentials'
}

describe('RequestClient', () => {
  let server: http.Server

  const adapter = new SASjs({
    serverUrl: `http://localhost:${PORT}/`,
    serverType: ServerType.SasViya
  })

  beforeAll(async () => {
    await new Promise((resolve: any, reject: any) => {
      server = app
        .listen(PORT, () => resolve())
        .on('error', (err: any) => reject(err))
    })
  })

  afterAll(() => {
    server.close()
  })

  it('should response the POST method', async () => {
    const authResponse = await adapter.getAccessToken(
      'clientId',
      'clientSecret',
      'authCode'
    )

    expect(authResponse.access_token).toBe(mockedAuthResponse.access_token)
  })

  it('should response the POST method with Unauthorized', async () => {
    const expectedError = new LoginRequiredError({
      error: 'unauthorized',
      error_description: 'Bad credentials'
    })

    const rejectionErrorMessage = await adapter
      .getAccessToken('clientId', 'clientSecret', 'incorrect')
      .catch((err) =>
        getTokenRequestErrorPrefixResponse(err.message, ServerType.SasViya)
      )

    expect(rejectionErrorMessage).toEqual(expectedError.message)
  })

  describe('handleError', () => {
    const requestClient = new RequestClient('https://localhost:8009')
    const randomError = 'some error'

    it('should throw an error if could not get confirmUrl', async () => {
      const authError = new AuthorizeError('message', 'confirm_url')

      jest
        .spyOn(requestClient['httpClient'], 'get')
        .mockImplementation(() => Promise.reject(randomError))

      await expect(
        requestClient['handleError'](authError, () => {})
      ).rejects.toEqual(`Error while getting error confirmUrl. ${randomError}`)
    })

    it('should throw an error if authorize form is required', async () => {
      const authError = new AuthorizeError('message', 'confirm_url')

      jest
        .spyOn(requestClient['httpClient'], 'get')
        .mockImplementation(() =>
          Promise.resolve({ data: '<form action="(Logon/oauth/authorize")>' })
        )

      jest
        .spyOn(requestClient, 'authorize')
        .mockImplementation(() => Promise.reject(randomError))

      await expect(
        requestClient['handleError'](authError, () => {})
      ).rejects.toEqual(`Error while authorizing request. ${randomError}`)
    })

    it('should throw an error from callback function', async () => {
      const authError = new AuthorizeError('message', 'confirm_url')

      jest
        .spyOn(requestClient['httpClient'], 'get')
        .mockImplementation(() => Promise.resolve({ data: '' }))

      await expect(
        requestClient['handleError'](authError, () =>
          Promise.reject(randomError)
        )
      ).rejects.toEqual(
        `Error while executing callback in handleError. ${randomError}`
      )
    })

    it('should handle error with 403 response status', async () => {
      const error = {
        response: {
          status: 403,
          headers: { 'x-csrf-header': 'x-csrf-header' }
        }
      }

      await expect(
        requestClient['handleError'](error, () => Promise.reject(randomError))
      ).rejects.toEqual(
        `Error while executing callback in handleError. ${randomError}`
      )

      error.response.headers = {} as unknown as { 'x-csrf-header': string }
      requestClient['csrfToken'].headerName = ''

      await expect(
        requestClient['handleError'](error, () => Promise.reject(randomError))
      ).rejects.toEqual(error)
    })

    it('should handle error with 404 response status', async () => {
      const error = {
        response: {
          status: 404,
          config: { url: 'test url' }
        }
      }

      await expect(
        requestClient['handleError'](error, () => {})
      ).rejects.toEqual(new NotFoundError(error.response.config.url))
    })

    it('should handle error with 502 response status', async () => {
      const error = {
        response: {
          status: 502
        }
      }

      await expect(
        requestClient['handleError'](error, () => {}, true)
      ).rejects.toEqual(new InternalServerError())
      await expect(
        requestClient['handleError'](error, () => {}, false)
      ).resolves.toEqual(undefined)
    })
  })
})

describe('RequestClient - Self Signed Server', () => {
  let adapter: SASjs

  let httpsServer: https.Server
  let sslConfig: pem.CertificateCreationResult

  beforeAll(async () => {
    ;({ httpsServer, keys: sslConfig } = await setupSelfSignedServer())
    await new Promise((resolve: any, reject: any) => {
      httpsServer
        .listen(PORT, () => resolve())
        .on('error', (err: any) => reject(err))
    })

    adapter = new SASjs({
      serverUrl: SERVER_URL,
      serverType: ServerType.SasViya,
      httpsAgentOptions: { ca: [sslConfig.certificate] }
    })
  })

  afterAll(() => {
    httpsServer.close()
  })

  it('should throw error for not providing certificate', async () => {
    const adapterWithoutCertificate = new SASjs({
      serverUrl: SERVER_URL,
      serverType: ServerType.SasViya
    })

    const expectedError = 'self-signed certificate'

    const rejectionErrorMessage = await adapterWithoutCertificate
      .getAccessToken('clientId', 'clientSecret', 'authCode')
      .catch((err) =>
        getTokenRequestErrorPrefixResponse(err.message, ServerType.SasViya)
      )

    expect(rejectionErrorMessage).toEqual(expectedError)
  })

  it('should response the POST method using insecure flag', async () => {
    const adapterAllowInsecure = new SASjs({
      serverUrl: SERVER_URL,
      serverType: ServerType.SasViya,
      httpsAgentOptions: { rejectUnauthorized: false }
    })

    const authResponse = await adapterAllowInsecure.getAccessToken(
      'clientId',
      'clientSecret',
      'authCode'
    )

    expect(authResponse.access_token).toBe(mockedAuthResponse.access_token)
  })

  it('should response the POST method', async () => {
    const authResponse = await adapter.getAccessToken(
      'clientId',
      'clientSecret',
      'authCode'
    )

    expect(authResponse.access_token).toBe(mockedAuthResponse.access_token)
  })

  it('should response the POST method with Unauthorized', async () => {
    const expectedError = new LoginRequiredError({
      error: 'unauthorized',
      error_description: 'Bad credentials'
    })

    const rejectionErrorMessage = await adapter
      .getAccessToken('clientId', 'clientSecret', 'incorrect')
      .catch((err) =>
        getTokenRequestErrorPrefixResponse(err.message, ServerType.SasViya)
      )

    expect(rejectionErrorMessage).toEqual(expectedError.message)
  })
})

const setupSelfSignedServer = async (): Promise<{
  httpsServer: https.Server
  keys: pem.CertificateCreationResult
}> => {
  return await new Promise(async (resolve) => {
    const keys = await createCertificate()

    const httpsServer = https.createServer(
      { key: keys.clientKey, cert: keys.certificate },
      app
    )

    resolve({ httpsServer, keys })
  })
}

const createCertificate = async (): Promise<pem.CertificateCreationResult> => {
  return await new Promise((resolve, reject) => {
    pem.createCertificate(
      { days: 1, selfSigned: true },
      (error: any, keys: pem.CertificateCreationResult) => {
        if (error) reject(false)
        resolve(keys)
      }
    )
  })
}
