import { AuthManager } from '../AuthManager'
import * as dotenv from 'dotenv'
import { ServerType } from '@sasjs/utils/types'
import axios from 'axios'
import {
  mockedCurrentUserApi,
  mockLoginAuthoriseRequiredResponse,
  mockLoginSuccessResponse
} from './mockResponses'
import { serialize } from '../../utils'
import * as openWebPageModule from '../openWebPage'
import * as verifySasViyaLoginModule from '../verifySasViyaLogin'
import * as verifySas9LoginModule from '../verifySas9Login'
import { RequestClient } from '../../request/RequestClient'
jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('AuthManager', () => {
  const authCallback = jest.fn().mockImplementation(() => Promise.resolve())
  const serverUrl = 'http://test-server.com'
  const serverType = ServerType.SasViya
  const userName = 'test-username'
  const userLongName = 'test-user long name'
  const password = 'test-password'
  const requestClient = new RequestClient(serverUrl)

  beforeAll(() => {
    dotenv.config()
    jest.restoreAllMocks()
  })

  it('should instantiate and set the correct URLs for a Viya server', () => {
    const authManager = new AuthManager(
      serverUrl,
      serverType,
      requestClient,
      authCallback
    )

    expect(authManager).toBeTruthy()
    expect((authManager as any).serverUrl).toEqual(serverUrl)
    expect((authManager as any).serverType).toEqual(serverType)
    expect((authManager as any).loginUrl).toEqual(`/SASLogon/login`)
    expect((authManager as any).logoutUrl).toEqual('/SASLogon/logout.do?')
  })

  it('should instantiate and set the correct URLs for a SAS9 server', () => {
    const authCallback = () => Promise.resolve()
    const serverType = ServerType.Sas9

    const authManager = new AuthManager(
      serverUrl,
      serverType,
      requestClient,
      authCallback
    )

    expect(authManager).toBeTruthy()
    expect((authManager as any).serverUrl).toEqual(serverUrl)
    expect((authManager as any).serverType).toEqual(serverType)
    expect((authManager as any).loginUrl).toEqual(`/SASLogon/login`)
    expect((authManager as any).logoutUrl).toEqual('/SASLogon/logout?')
  })

  describe('login - default mechanism', () => {
    it('should call the auth callback and return when already logged in', async () => {
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      jest.spyOn(authManager, 'checkSession').mockImplementation(() =>
        Promise.resolve({
          isLoggedIn: true,
          userName,
          userLongName,
          loginForm: 'test'
        })
      )

      const loginResponse = await authManager.logIn(userName, password)

      expect(loginResponse.isLoggedIn).toBeTruthy()
      expect(loginResponse.userName).toEqual(userName)
      expect(authCallback).toHaveBeenCalledTimes(1)
    })

    it('should post a login request to the server when already logged in with other username', async () => {
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      jest.spyOn(authManager, 'checkSession').mockImplementation(() =>
        Promise.resolve({
          isLoggedIn: true,
          userName: 'someOtherUsername',
          userLongName: 'someOtherUser Long name',
          loginForm: null
        })
      )
      jest.spyOn(authManager, 'logOut')

      jest.spyOn<any, any>(authManager, 'getNewLoginForm')
      jest.spyOn<any, any>(authManager, 'sendLoginRequest')

      const loginResponse = await authManager.logIn(userName, password)

      expect(loginResponse.isLoggedIn).toBeTruthy()
      expect(loginResponse.userName).toEqual(userName)

      expect(authCallback).toHaveBeenCalledTimes(1)
      expect(authManager.logOut).toHaveBeenCalledTimes(0)
      expect(authManager['getNewLoginForm']).toHaveBeenCalledTimes(0)
      expect(authManager['sendLoginRequest']).toHaveBeenCalledTimes(0)
      expect(authCallback).toHaveBeenCalledTimes(1)
    })

    it('should post a login request to the server when not logged in', async () => {
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      jest.spyOn(authManager, 'checkSession').mockImplementation(() =>
        Promise.resolve({
          isLoggedIn: false,
          userName: '',
          userLongName: '',
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
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: '*/*'
          }
        }
      )
      expect(authCallback).toHaveBeenCalledTimes(1)
    })

    it('should post a login & a cas_security request to the SAS9 server when not logged in', async () => {
      const serverType = ServerType.Sas9
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      jest.spyOn(authManager, 'checkSession').mockImplementation(() =>
        Promise.resolve({
          isLoggedIn: false,
          userName: '',
          userLongName: '',
          loginForm: { name: 'test' }
        })
      )
      mockedAxios.post.mockImplementation(() =>
        Promise.resolve({ data: mockLoginSuccessResponse })
      )
      mockedAxios.get.mockImplementation(() => Promise.resolve({ status: 200 }))

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
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: '*/*'
          }
        }
      )
      const casAuthenticationUrl = `${serverUrl}/SASStoredProcess/j_spring_cas_security_check`
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `/SASLogon/login?service=${casAuthenticationUrl}`,
        getHeadersJson
      )
      expect(authCallback).toHaveBeenCalledTimes(1)
    })

    it('should return empty username if unable to logged in', async () => {
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      jest.spyOn(authManager, 'checkSession').mockImplementation(() =>
        Promise.resolve({
          isLoggedIn: false,
          userName: '',
          userLongName: '',
          loginForm: { name: 'test' }
        })
      )
      mockedAxios.post.mockImplementation(() =>
        Promise.resolve({ data: 'Not Signed in' })
      )

      const loginResponse = await authManager.logIn(userName, password)

      expect(loginResponse.isLoggedIn).toBeFalsy()
      expect(loginResponse.userName).toEqual('')

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
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: '*/*'
          }
        }
      )
    })

    it('should parse and submit the authorisation form when necessary', async () => {
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      jest
        .spyOn(requestClient, 'authorize')
        .mockImplementation(() => Promise.resolve())
      jest.spyOn(authManager, 'checkSession').mockImplementation(() =>
        Promise.resolve({
          isLoggedIn: false,
          userName: 'test',
          userLongName: 'test Long name',
          loginForm: { name: 'test' }
        })
      )
      mockedAxios.post.mockImplementationOnce(() =>
        Promise.resolve({
          data: mockLoginAuthoriseRequiredResponse,
          config: { url: 'https://test.com/SASLogon/login' },
          request: { responseURL: 'https://test.com/OAuth/authorize' }
        })
      )

      mockedAxios.get.mockImplementationOnce(() =>
        Promise.resolve({
          data: mockLoginAuthoriseRequiredResponse
        })
      )

      await authManager.logIn(userName, password)

      expect(requestClient.authorize).toHaveBeenCalledWith(
        mockLoginAuthoriseRequiredResponse
      )
    })
  })

  describe('login - redirect mechanism', () => {
    beforeAll(() => {
      jest.mock('../openWebPage')
      jest
        .spyOn(openWebPageModule, 'openWebPage')
        .mockImplementation(() =>
          Promise.resolve({ close: jest.fn() } as unknown as Window)
        )
      jest.mock('../verifySasViyaLogin')
      jest
        .spyOn(verifySasViyaLoginModule, 'verifySasViyaLogin')
        .mockImplementation(() => Promise.resolve({ isLoggedIn: true }))
      jest.mock('../verifySas9Login')
      jest
        .spyOn(verifySas9LoginModule, 'verifySas9Login')
        .mockImplementation(() => Promise.resolve({ isLoggedIn: true }))
    })

    it('should call the auth callback and return when already logged in', async () => {
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      jest
        .spyOn<any, any>(authManager, 'fetchUserName')
        .mockImplementation(() =>
          Promise.resolve({
            isLoggedIn: true,
            userName
          })
        )

      const loginResponse = await authManager.redirectedLogIn({})

      expect(loginResponse.isLoggedIn).toBeTruthy()
      expect(loginResponse.userName).toEqual(userName)
      expect(authCallback).toHaveBeenCalledTimes(1)
    })

    it('should perform login via pop up if not logged in', async () => {
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      jest
        .spyOn<any, any>(authManager, 'fetchUserName')
        .mockImplementationOnce(() =>
          Promise.resolve({
            isLoggedIn: false,
            userName: ''
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            isLoggedIn: true,
            userName
          })
        )

      const loginResponse = await authManager.redirectedLogIn({})

      expect(loginResponse.isLoggedIn).toBeTruthy()
      expect(loginResponse.userName).toEqual(userName)

      expect(openWebPageModule.openWebPage).toHaveBeenCalledWith(
        `/SASLogon/home`,
        'SASLogon',
        {
          width: 500,
          height: 600
        },
        undefined
      )
      expect(authManager['fetchUserName']).toHaveBeenCalledTimes(2)
      expect(verifySasViyaLoginModule.verifySasViyaLogin).toHaveBeenCalledTimes(
        1
      )
      expect(authCallback).toHaveBeenCalledTimes(1)
    })

    it('should perform login via pop up if not logged in with server sas9', async () => {
      const serverType = ServerType.Sas9
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      jest
        .spyOn<any, any>(authManager, 'fetchUserName')
        .mockImplementationOnce(() =>
          Promise.resolve({
            isLoggedIn: false,
            userName: ''
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            isLoggedIn: true,
            userName
          })
        )

      const loginResponse = await authManager.redirectedLogIn({})

      expect(loginResponse.isLoggedIn).toBeTruthy()
      expect(loginResponse.userName).toEqual(userName)

      expect(openWebPageModule.openWebPage).toHaveBeenCalledWith(
        `/SASLogon/home`,
        'SASLogon',
        {
          width: 500,
          height: 600
        },
        undefined
      )
      expect(authManager['fetchUserName']).toHaveBeenCalledTimes(2)
      expect(verifySas9LoginModule.verifySas9Login).toHaveBeenCalledTimes(1)
      expect(authCallback).toHaveBeenCalledTimes(1)
    })

    it('should return empty username if user unable to re-login via pop up', async () => {
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      jest
        .spyOn<any, any>(authManager, 'fetchUserName')
        .mockImplementationOnce(() =>
          Promise.resolve({
            isLoggedIn: false,
            userName: ''
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            isLoggedIn: true,
            userName
          })
        )
      jest
        .spyOn(verifySasViyaLoginModule, 'verifySasViyaLogin')
        .mockImplementation(() => Promise.resolve({ isLoggedIn: false }))

      const loginResponse = await authManager.redirectedLogIn({})

      expect(loginResponse.isLoggedIn).toBeFalsy()
      expect(loginResponse.userName).toEqual('')

      expect(openWebPageModule.openWebPage).toHaveBeenCalledWith(
        `/SASLogon/home`,
        'SASLogon',
        {
          width: 500,
          height: 600
        },
        undefined
      )
      expect(authManager['fetchUserName']).toHaveBeenCalledTimes(1)

      expect(authCallback).toHaveBeenCalledTimes(0)
    })

    it('should return empty username if user rejects to re-login', async () => {
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      jest
        .spyOn<any, any>(authManager, 'fetchUserName')
        .mockImplementationOnce(() =>
          Promise.resolve({
            isLoggedIn: false,
            userName: ''
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            isLoggedIn: true,
            userName
          })
        )
      jest
        .spyOn(openWebPageModule, 'openWebPage')
        .mockImplementation(() => Promise.resolve(null))

      const loginResponse = await authManager.redirectedLogIn({})

      expect(loginResponse.isLoggedIn).toBeFalsy()
      expect(loginResponse.userName).toEqual('')

      expect(openWebPageModule.openWebPage).toHaveBeenCalledWith(
        `/SASLogon/home`,
        'SASLogon',
        {
          width: 500,
          height: 600
        },
        undefined
      )
      expect(authManager['fetchUserName']).toHaveBeenCalledTimes(1)

      expect(authCallback).toHaveBeenCalledTimes(0)
    })
  })

  describe('checkSession', () => {
    it('return session information when logged in', async () => {
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({ data: mockedCurrentUserApi(userName) })
      )

      const response = await authManager.checkSession()
      expect(response.isLoggedIn).toBeTruthy()
      expect(response.userName).toEqual(userName)
      expect(mockedAxios.get).toHaveBeenNthCalledWith(
        1,
        `http://test-server.com/identities/users/@currentUser`,
        {
          withCredentials: true,
          responseType: 'text',
          transformResponse: undefined,
          headers: {
            Accept: '*/*',
            'Content-Type': 'text/plain'
          }
        }
      )
    })

    it('return session information when logged in - SAS9 - having full name in html', async () => {
      const fullname = 'FirstName LastName'
      const serverType = ServerType.Sas9
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      mockedAxios.get.mockImplementation(() =>
        Promise.resolve({
          data: `"title":"Log Off ${fullname}","url":"javascript: clearFrame(\"/SASStoredProcess/do?_action=logoff\")"' })`
        })
      )

      const response = await authManager.checkSession()
      expect(response.isLoggedIn).toBeTruthy()
      expect(response.userName).toEqual('')
      expect(response.userLongName).toEqual(fullname)
      expect(mockedAxios.get).toHaveBeenNthCalledWith(
        1,
        `http://test-server.com/SASStoredProcess`,
        {
          withCredentials: true,
          responseType: 'text',
          transformResponse: undefined,
          headers: {
            Accept: '*/*',
            'Content-Type': 'text/plain'
          }
        }
      )
    })

    it('perform logout when not logged in', async () => {
      const authManager = new AuthManager(
        serverUrl,
        serverType,
        requestClient,
        authCallback
      )
      mockedAxios.get
        .mockImplementationOnce(() => Promise.resolve({ status: 401 }))
        .mockImplementation(() => Promise.resolve({}))

      const response = await authManager.checkSession()
      expect(response.isLoggedIn).toBeFalsy()
      expect(response.userName).toEqual('')
      expect(mockedAxios.get).toHaveBeenNthCalledWith(
        1,
        `http://test-server.com/identities/users/@currentUser`,
        {
          withCredentials: true,
          responseType: 'text',
          transformResponse: undefined,
          headers: {
            Accept: '*/*',
            'Content-Type': 'text/plain'
          }
        }
      )
      expect(mockedAxios.get).toHaveBeenNthCalledWith(
        2,
        `/SASLogon/logout.do?`,
        getHeadersJson
      )
    })
  })
})

const getHeadersJson = {
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  },
  responseType: 'json'
}
