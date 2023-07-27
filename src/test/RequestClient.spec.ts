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
import { AxiosResponse } from 'axios'
import { Logger, LogLevel } from '@sasjs/utils/logger'

const axiosActual = jest.requireActual('axios')

jest
  .spyOn(axiosModules, 'createAxiosInstance')
  .mockImplementation((baseURL: string, httpsAgent?: https.Agent) =>
    axiosActual.create({ baseURL, httpsAgent })
  )

const PORT = 8000
const SERVER_URL = `https://localhost:${PORT}/`

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

  describe('defaultInterceptionCallBack', () => {
    beforeAll(() => {
      ;(process as any).logger = new Logger(LogLevel.Off)
    })

    it('should log parsed response', () => {
      jest.spyOn((process as any).logger, 'info')

      const status = 200
      const reqData = `{
        name: 'test_job',
        description: 'Powered by SASjs',
        code: ['test_code'],
        variables: {
          SYS_JES_JOB_URI: '',
          _program: '/Public/sasjs/jobs/jobs/test_job'
        },
        arguments: {
          _contextName: 'SAS Job Execution compute context',
          _OMITJSONLISTING: true,
          _OMITJSONLOG: true,
          _OMITSESSIONRESULTS: true,
          _OMITTEXTLISTING: true,
          _OMITTEXTLOG: true
        }
      }`
      const resData = {
        id: 'id_string',
        name: 'name_string',
        uri: 'uri_string',
        createdBy: 'createdBy_string',
        code: 'TEST CODE',
        links: [
          {
            method: 'method_string',
            rel: 'state',
            href: 'state_href_string',
            uri: 'uri_string',
            type: 'type_string'
          },
          {
            method: 'method_string',
            rel: 'state',
            href: 'state_href_string',
            uri: 'uri_string',
            type: 'type_string'
          },
          {
            method: 'method_string',
            rel: 'state',
            href: 'state_href_string',
            uri: 'uri_string',
            type: 'type_string'
          },
          {
            method: 'method_string',
            rel: 'state',
            href: 'state_href_string',
            uri: 'uri_string',
            type: 'type_string'
          },
          {
            method: 'method_string',
            rel: 'state',
            href: 'state_href_string',
            uri: 'uri_string',
            type: 'type_string'
          },
          {
            method: 'method_string',
            rel: 'self',
            href: 'self_href_string',
            uri: 'uri_string',
            type: 'type_string'
          }
        ],
        results: { '_webout.json': '_webout.json_string' },
        logStatistics: {
          lineCount: 1,
          modifiedTimeStamp: 'modifiedTimeStamp_string'
        }
      }
      const reqHeaders = `POST https://sas.server.com/compute/sessions/session_id/jobs HTTP/1.1
Accept: application/json
Content-Type: application/json
User-Agent: axios/0.27.2
Content-Length: 334
host: sas.server.io
Connection: close
`
      const resHeaders = ['content-type', 'application/json']
      const mockedResponse: AxiosResponse = {
        data: resData,
        status,
        statusText: '',
        headers: {},
        config: { data: reqData },
        request: { _header: reqHeaders, res: { rawHeaders: resHeaders } }
      }

      const requestClient = new RequestClient('')
      requestClient['defaultInterceptionCallBack'](mockedResponse)

      const expectedLog = `HTTP Request (first 50 lines):
${reqHeaders}${requestClient['parseInterceptedBody'](reqData)}

HTTP Response Code: ${requestClient['prettifyString'](status)}

HTTP Response (first 50 lines):
${resHeaders[0]}: ${resHeaders[1]}${
        requestClient['parseInterceptedBody'](resData)
          ? `\n\n${requestClient['parseInterceptedBody'](resData)}`
          : ''
      }
`

      expect((process as any).logger.info).toHaveBeenCalledWith(expectedLog)
    })
  })

  describe('enableVerboseMode', () => {
    it('should add defaultInterceptionCallBack functions to response interceptors', () => {
      const requestClient = new RequestClient('')
      const interceptorSpy = jest.spyOn(
        requestClient['httpClient'].interceptors.response,
        'use'
      )

      requestClient.enableVerboseMode()

      expect(interceptorSpy).toHaveBeenCalledWith(
        requestClient['defaultInterceptionCallBack'],
        requestClient['defaultInterceptionCallBack']
      )
    })

    it('should add callback functions to response interceptors', () => {
      const requestClient = new RequestClient('')
      const interceptorSpy = jest.spyOn(
        requestClient['httpClient'].interceptors.response,
        'use'
      )

      const successCallback = (response: AxiosResponse) => {
        console.log('success')

        return response
      }
      const failureCallback = (response: AxiosResponse) => {
        console.log('failure')

        return response
      }

      requestClient.enableVerboseMode(successCallback, failureCallback)

      expect(interceptorSpy).toHaveBeenCalledWith(
        successCallback,
        failureCallback
      )
    })
  })

  describe('disableVerboseMode', () => {
    it('should eject interceptor', () => {
      const requestClient = new RequestClient('')

      const interceptorSpy = jest.spyOn(
        requestClient['httpClient'].interceptors.response,
        'eject'
      )

      const interceptorId = 100

      requestClient['httpInterceptor'] = interceptorId
      requestClient.disableVerboseMode()

      expect(interceptorSpy).toHaveBeenCalledWith(interceptorId)
    })
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
