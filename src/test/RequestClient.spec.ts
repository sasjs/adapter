import * as pem from 'pem'
import * as http from 'http'
import * as https from 'https'
import { app, mockedAuthResponse } from './SAS_server_app'
import { ServerType } from '@sasjs/utils/types'
import SASjs from '../SASjs'
import * as axiosModules from '../utils/createAxiosInstance'
import axios, { AxiosRequestHeaders } from 'axios'
import {
  LoginRequiredError,
  AuthorizeError,
  NotFoundError,
  InternalServerError,
  VerboseMode
} from '../types'
import { RequestClient } from '../request/RequestClient'
import { getTokenRequestErrorPrefixResponse } from '../auth/getTokenRequestErrorPrefix'
import { AxiosResponse, AxiosError } from 'axios'
import { Logger, LogLevel } from '@sasjs/utils/logger'
import * as UtilsModule from 'util'

const axiosActual = jest.requireActual('axios')

jest
  .spyOn(axiosModules, 'createAxiosInstance')
  .mockImplementation((baseURL: string, httpsAgent?: https.Agent) =>
    axiosActual.create({ baseURL, httpsAgent, withCredentials: true })
  )

jest.mock('util', () => {
  const actualUtil = jest.requireActual('util')
  return {
    ...actualUtil,
    inspect: jest.fn(actualUtil.inspect)
  }
})

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

  describe('defaultInterceptionCallBacks for successful requests and failed requests', () => {
    const reqHeaders = `POST https://sas.server.com/compute/sessions/session_id/jobs HTTP/1.1
Accept: application/json
Content-Type: application/json
User-Agent: axios/0.27.2
Content-Length: 334
host: sas.server.io
Connection: close
`
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

    const resHeaders = ['content-type', 'application/json']
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
    beforeAll(() => {
      ;(process as any).logger = new Logger(LogLevel.Off)
      jest.spyOn((process as any).logger, 'info')
    })

    it('should log parsed response with status 1**', () => {
      const mockedAxiosError = {
        config: {
          data: reqData
        },
        request: {
          _currentRequest: {
            _header: reqHeaders
          }
        }
      } as AxiosError

      const requestClient = new RequestClient('')
      requestClient['handleAxiosError'](mockedAxiosError)

      const noValueMessage = 'Not provided'
      const expectedLog = `HTTP Request (first 50 lines):
${reqHeaders}${requestClient['parseInterceptedBody'](reqData)}

HTTP Response Code: ${requestClient['prettifyString'](noValueMessage)}

HTTP Response (first 50 lines):
${noValueMessage}
\n${requestClient['parseInterceptedBody'](noValueMessage)}
`

      expect((process as any).logger.info).toHaveBeenCalledWith(expectedLog)
    })

    it('should log parsed response with status 2**', () => {
      const status = getRandomStatus([
        200, 201, 202, 203, 204, 205, 206, 207, 208, 226
      ])

      const mockedResponse: AxiosResponse = {
        data: resData,
        status,
        statusText: '',
        headers: {},
        config: {
          data: reqData,
          headers: {} as AxiosRequestHeaders
        },
        request: { _header: reqHeaders, res: { rawHeaders: resHeaders } }
      }

      const requestClient = new RequestClient('')
      requestClient['handleAxiosResponse'](mockedResponse)

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

    it('should log parsed response with status 3**', () => {
      const status = getRandomStatus([300, 301, 302, 303, 304, 307, 308])

      const mockedAxiosError = {
        config: {
          data: reqData
        },
        request: {
          _currentRequest: {
            _header: reqHeaders
          }
        }
      } as AxiosError

      const requestClient = new RequestClient('')
      requestClient['handleAxiosError'](mockedAxiosError)

      const noValueMessage = 'Not provided'
      const expectedLog = `HTTP Request (first 50 lines):
${reqHeaders}${requestClient['parseInterceptedBody'](reqData)}

HTTP Response Code: ${requestClient['prettifyString'](noValueMessage)}

HTTP Response (first 50 lines):
${noValueMessage}
\n${requestClient['parseInterceptedBody'](noValueMessage)}
`

      expect((process as any).logger.info).toHaveBeenCalledWith(expectedLog)
    })

    it('should log parsed response with status 4**', () => {
      const spyIsAxiosError = jest
        .spyOn(axios, 'isAxiosError')
        .mockImplementation(() => true)

      const status = getRandomStatus([
        400, 401, 402, 403, 404, 407, 408, 409, 410, 411, 412, 413, 414, 415,
        416, 417, 418, 421, 422, 423, 424, 425, 426, 428, 429, 431, 451
      ])

      const mockedResponse: AxiosResponse = {
        data: resData,
        status,
        statusText: '',
        headers: {},
        config: {
          data: reqData,
          headers: {} as AxiosRequestHeaders
        },
        request: { _header: reqHeaders, res: { rawHeaders: resHeaders } }
      }
      const mockedAxiosError = {
        config: {
          data: reqData
        },
        request: {
          _currentRequest: {
            _header: reqHeaders
          }
        },
        response: mockedResponse
      } as AxiosError

      const requestClient = new RequestClient('')
      requestClient['handleAxiosError'](mockedAxiosError)

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

      spyIsAxiosError.mockReset()
    })

    it('should log parsed response with status 5**', () => {
      const spyIsAxiosError = jest
        .spyOn(axios, 'isAxiosError')
        .mockImplementation(() => true)

      const status = getRandomStatus([
        500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511
      ])

      const mockedResponse: AxiosResponse = {
        data: resData,
        status,
        statusText: '',
        headers: {},
        config: {
          data: reqData,
          headers: {} as AxiosRequestHeaders
        },
        request: { _header: reqHeaders, res: { rawHeaders: resHeaders } }
      }
      const mockedAxiosError = {
        config: {
          data: reqData
        },
        request: {
          _currentRequest: {
            _header: reqHeaders
          }
        },
        response: mockedResponse
      } as AxiosError

      const requestClient = new RequestClient('')
      requestClient['handleAxiosError'](mockedAxiosError)

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

      spyIsAxiosError.mockReset()
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
        requestClient['handleAxiosResponse'],
        requestClient['handleAxiosError']
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
      const failureCallback = (response: AxiosError) => {
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

  describe('setVerboseMode', () => {
    it(`should set verbose mode`, () => {
      const requestClient = new RequestClient('')
      let verbose: VerboseMode = false
      requestClient.setVerboseMode(verbose)

      expect(requestClient['verboseMode']).toEqual(verbose)

      verbose = true
      requestClient.setVerboseMode(verbose)

      expect(requestClient['verboseMode']).toEqual(verbose)

      verbose = 'bleached'
      requestClient.setVerboseMode(verbose)

      expect(requestClient['verboseMode']).toEqual(verbose)
    })
  })

  describe('prettifyString', () => {
    const inspectMock = UtilsModule.inspect as unknown as jest.Mock

    beforeEach(() => {
      // Reset the mock before each test to ensure a clean slate
      inspectMock.mockClear()
    })

    it(`should call inspect without colors when verbose mode is set to 'bleached'`, () => {
      const requestClient = new RequestClient('')
      requestClient.setVerboseMode('bleached')

      const testStr = JSON.stringify({ test: 'test' })
      requestClient['prettifyString'](testStr)

      expect(UtilsModule.inspect).toHaveBeenCalledWith(testStr, {
        colors: false
      })
    })

    it(`should call inspect with colors when verbose mode is set to true`, () => {
      const requestClient = new RequestClient('')
      requestClient.setVerboseMode(true)

      const testStr = JSON.stringify({ test: 'test' })
      requestClient['prettifyString'](testStr)

      expect(UtilsModule.inspect).toHaveBeenCalledWith(testStr, {
        colors: true
      })
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

/**
 * Returns a random status code.
 * @param statuses - an array of available statuses.
 * @returns - random item from an array of statuses.
 */
const getRandomStatus = (statuses: number[]) =>
  statuses[Math.floor(Math.random() * statuses.length)]
