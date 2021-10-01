import * as pem from 'pem'
import * as http from 'http'
import * as https from 'https'
import { app, mockedAuthResponse } from './SAS_server_app'
import { ServerType } from '@sasjs/utils'
import SASjs from '../SASjs'
import * as axiosModules from '../utils/createAxiosInstance'

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
    await expect(
      adapter.getAccessToken('clientId', 'clientSecret', 'incorrect')
    ).rejects.toEqual(
      new Error(
        'Error while getting access tokenRequest failed with status code 401'
      )
    )
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
      httpsAgentConfiguration: {
        selfSigned: { ca: [sslConfig.certificate] }
      }
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

    await expect(
      adapterWithoutCertificate.getAccessToken(
        'clientId',
        'clientSecret',
        'authCode'
      )
    ).rejects.toEqual(
      expect.objectContaining({
        message: 'Error while getting access tokenself signed certificate'
      })
    )
  })

  it('should response the POST method using insecure flag', async () => {
    const adapterAllowInsecure = new SASjs({
      serverUrl: SERVER_URL,
      serverType: ServerType.SasViya,
      httpsAgentConfiguration: {
        allowInsecure: true
      }
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
    await expect(
      adapter.getAccessToken('clientId', 'clientSecret', 'incorrect')
    ).rejects.toEqual(
      new Error(
        'Error while getting access tokenRequest failed with status code 401'
      )
    )
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
