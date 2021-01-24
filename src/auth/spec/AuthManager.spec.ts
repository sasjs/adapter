import { AuthManager } from '../AuthManager'
import * as dotenv from 'dotenv'
import * as authModule from '..'
import { ServerType } from '@sasjs/utils/types'
import axios from 'axios'
import {
  mockLoginAuthoriseRequiredResponse,
  mockLoginSuccessResponse
} from './mockResponses'
import { serialize } from '../../utils'
jest.mock('axios')
jest.mock('../parseAndSubmitAuthorizeForm')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('AuthManager', () => {
  const authCallback = jest.fn().mockImplementation(() => Promise.resolve())
  const serverUrl = 'http://test-server.com'
  const serverType = ServerType.SasViya
  const userName = 'test-username'
  const password = 'test-password'

  beforeAll(() => {
    dotenv.config()
    jest.restoreAllMocks()
  })

  it('should instantiate and set the correct URLs for a Viya server', () => {
    const authManager = new AuthManager(serverUrl, serverType, authCallback)

    expect(authManager).toBeTruthy()
    expect((authManager as any).serverUrl).toEqual(serverUrl)
    expect((authManager as any).serverType).toEqual(serverType)
    expect((authManager as any).httpClient).toBeTruthy()
    expect((authManager as any).loginUrl).toEqual(`/SASLogon/login`)
    expect((authManager as any).logoutUrl).toEqual('/SASLogon/logout.do?')
  })

  it('should instantiate and set the correct URLs for a SAS9 server', () => {
    const authCallback = () => Promise.resolve()
    const serverType = ServerType.Sas9

    const authManager = new AuthManager(serverUrl, serverType, authCallback)

    expect(authManager).toBeTruthy()
    expect((authManager as any).serverUrl).toEqual(serverUrl)
    expect((authManager as any).serverType).toEqual(serverType)
    expect((authManager as any).httpClient).toBeTruthy()
    expect((authManager as any).loginUrl).toEqual(`/SASLogon/login`)
    expect((authManager as any).logoutUrl).toEqual('/SASLogon/logout?')
  })

  it('should call the auth callback and return when already logged in', async (done) => {
    const authManager = new AuthManager(serverUrl, serverType, authCallback)
    jest.spyOn(authManager, 'checkSession').mockImplementation(() =>
      Promise.resolve({
        isLoggedIn: true,
        userName: 'test',
        loginForm: 'test'
      })
    )

    const loginResponse = await authManager.logIn(userName, password)

    expect(loginResponse.isLoggedIn).toBeTruthy()
    expect(loginResponse.userName).toEqual(userName)
    expect(authCallback).toHaveBeenCalledTimes(1)
    done()
  })

  it('should post a login request to the server if not logged in', async (done) => {
    const authManager = new AuthManager(serverUrl, serverType, authCallback)
    jest.spyOn(authManager, 'checkSession').mockImplementation(() =>
      Promise.resolve({
        isLoggedIn: false,
        userName: 'test',
        loginForm: { name: 'test' }
      })
    )
    mockedAxios.post.mockImplementation(() =>
      Promise.resolve({ data: mockLoginSuccessResponse })
    )

    const loginResponse = await authManager.logIn(userName, password)

    expect(loginResponse.isLoggedIn).toBeTruthy()
    expect(loginResponse.userName).toEqual(userName)

    const loginParams = serialize({
      _service: 'default',
      username: userName,
      password,
      name: 'test'
    })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `/SASLogon/login`,
      loginParams,
      {
        withCredentials: true,
        responseType: 'text',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: '*/*'
        }
      }
    )
    expect(authCallback).toHaveBeenCalledTimes(1)
    done()
  })

  it('should parse and submit the authorisation form when necessary', async (done) => {
    const authManager = new AuthManager(serverUrl, serverType, authCallback)
    jest
      .spyOn(authModule, 'parseAndSubmitAuthorizeForm')
      .mockImplementation(() => Promise.resolve())
    jest.spyOn(authManager, 'checkSession').mockImplementation(() =>
      Promise.resolve({
        isLoggedIn: false,
        userName: 'test',
        loginForm: { name: 'test' }
      })
    )
    mockedAxios.post.mockImplementation(() =>
      Promise.resolve({ data: mockLoginAuthoriseRequiredResponse })
    )

    await authManager.logIn(userName, password)

    expect(authModule.parseAndSubmitAuthorizeForm).toHaveBeenCalledWith(
      mockLoginAuthoriseRequiredResponse,
      serverUrl
    )
    done()
  })

  it('should check and return session information if logged in', async (done) => {
    const authManager = new AuthManager(serverUrl, serverType, authCallback)
    mockedAxios.get.mockImplementation(() =>
      Promise.resolve({ data: '<button onClick="logout">' })
    )

    const response = await authManager.checkSession()
    expect(response.isLoggedIn).toBeTruthy()
    expect(mockedAxios.get).toHaveBeenNthCalledWith(1, `/SASLogon/login`, {
      responseType: 'text',
      headers: {
        Accept: '*/*'
      }
    })

    done()
  })

  it('should check and return session information if logged in', async (done) => {
    const authManager = new AuthManager(serverUrl, serverType, authCallback)
    mockedAxios.get.mockImplementation(() =>
      Promise.resolve({ data: '<button onClick="logout">' })
    )

    const response = await authManager.checkSession()
    expect(response.isLoggedIn).toBeTruthy()
    expect(mockedAxios.get).toHaveBeenNthCalledWith(1, `/SASLogon/login`, {
      responseType: 'text',
      headers: {
        Accept: '*/*'
      }
    })

    done()
  })
})
