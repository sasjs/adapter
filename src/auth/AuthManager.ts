import { ServerType } from '@sasjs/utils/types'
import { RequestClient } from '../request/RequestClient'
import { LoginOptions, LoginResult } from '../types/Login'
import { serialize } from '../utils'
import { openWebPage } from './openWebPage'
import { verifySas9Login } from './verifySas9Login'
import { verifySasViyaLogin } from './verifySasViyaLogin'

export class AuthManager {
  public userName = ''
  private loginUrl: string
  private logoutUrl: string
  private redirectedLoginUrl = `/SASLogon/home`
  constructor(
    private serverUrl: string,
    private serverType: ServerType,
    private requestClient: RequestClient,
    private loginCallback: () => Promise<void>
  ) {
    this.loginUrl = `/SASLogon/login`
    this.logoutUrl =
      this.serverType === ServerType.Sas9
        ? '/SASLogon/logout?'
        : this.serverType === ServerType.SasViya
        ? '/SASLogon/logout.do?'
        : '/SASjsApi/auth/logout'
  }

  /**
   * Opens Pop up window to SAS Login screen.
   * And checks if user has finished login process.
   */
  public async redirectedLogIn({
    onLoggedOut
  }: LoginOptions): Promise<LoginResult> {
    const { isLoggedIn: isLoggedInAlready, userName: currentSessionUsername } =
      await this.fetchUserName()

    if (isLoggedInAlready) {
      await this.loginCallback()

      return {
        isLoggedIn: true,
        userName: currentSessionUsername
      }
    }

    const loginPopup = await openWebPage(
      this.redirectedLoginUrl,
      'SASLogon',
      {
        width: 500,
        height: 600
      },
      onLoggedOut
    )

    if (!loginPopup) {
      return { isLoggedIn: false, userName: '' }
    }

    const { isLoggedIn } =
      this.serverType === ServerType.SasViya
        ? await verifySasViyaLogin(loginPopup)
        : await verifySas9Login(loginPopup)

    loginPopup.close()

    if (isLoggedIn) {
      if (this.serverType === ServerType.Sas9) {
        await this.performCASSecurityCheck()
      }

      const { userName } = await this.fetchUserName()

      await this.loginCallback()

      return { isLoggedIn: true, userName }
    }

    return { isLoggedIn: false, userName: '' }
  }

  /**
   * Logs into the SAS server with the supplied credentials.
   * @param username - a string representing the username.
   * @param password - a string representing the password.
   * @returns - a boolean `isLoggedin` and a string `username`
   */
  public async logIn(username: string, password: string): Promise<LoginResult> {
    const loginParams = {
      _service: 'default',
      username,
      password
    }

    let {
      isLoggedIn: isLoggedInAlready,
      loginForm,
      userName: currentSessionUsername
    } = await this.checkSession()

    if (isLoggedInAlready) {
      if (currentSessionUsername === loginParams.username) {
        await this.loginCallback()

        this.userName = currentSessionUsername!
        return {
          isLoggedIn: true,
          userName: this.userName
        }
      } else {
        await this.logOut()
        loginForm = await this.getNewLoginForm()
      }
    } else this.userName = ''

    let loginResponse = await this.sendLoginRequest(loginForm, loginParams)

    let isLoggedIn = isLogInSuccess(loginResponse)

    if (!isLoggedIn) {
      if (isCredentialsVerifyError(loginResponse)) {
        const newLoginForm = await this.getLoginForm(loginResponse)

        loginResponse = await this.sendLoginRequest(newLoginForm, loginParams)
      }

      const res = await this.checkSession()
      isLoggedIn = res.isLoggedIn

      if (isLoggedIn) this.userName = res.userName
    } else {
      this.userName = loginParams.username
    }

    if (isLoggedIn) {
      if (this.serverType === ServerType.Sas9) {
        await this.performCASSecurityCheck()
      }

      this.loginCallback()
    } else this.userName = ''

    return {
      isLoggedIn,
      userName: this.userName
    }
  }

  private async performCASSecurityCheck() {
    const casAuthenticationUrl = `${this.serverUrl}/SASStoredProcess/j_spring_cas_security_check`

    await this.requestClient.get<string>(
      `/SASLogon/login?service=${casAuthenticationUrl}`,
      undefined
    )
  }

  private async sendLoginRequest(
    loginForm: { [key: string]: any },
    loginParams: { [key: string]: any }
  ) {
    for (const key in loginForm) {
      loginParams[key] = loginForm[key]
    }
    const loginParamsStr = serialize(loginParams)

    const { result: loginResponse } = await this.requestClient.post<string>(
      this.loginUrl,
      loginParamsStr,
      undefined,
      'text/plain',
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: '*/*'
      }
    )

    return loginResponse
  }

  /**
   * Checks whether a session is active, or login is required.
   * @param accessToken - an optional access token is required for SASjs server type.
   * @returns - a promise which resolves with an object containing three values
   *  - a boolean `isLoggedIn`
   *  - a string `userName` and
   *  - a form `loginForm` if not loggedin.
   */
  public async checkSession(accessToken?: string): Promise<{
    isLoggedIn: boolean
    userName: string
    loginForm?: any
  }> {
    const { isLoggedIn, userName } = await this.fetchUserName(accessToken)
    let loginForm = null

    if (!isLoggedIn && this.serverType !== ServerType.Sasjs) {
      //We will logout to make sure cookies are removed and login form is presented
      //Residue can happen in case of session expiration
      await this.logOut()

      loginForm = await this.getNewLoginForm()
    }

    return Promise.resolve({
      isLoggedIn,
      userName: userName.toLowerCase(),
      loginForm
    })
  }

  private async getNewLoginForm() {
    const { result: formResponse } = await this.requestClient.get<string>(
      this.loginUrl.replace('.do', ''),
      undefined,
      'text/plain'
    )

    return await this.getLoginForm(formResponse)
  }

  private async fetchUserName(accessToken?: string): Promise<{
    isLoggedIn: boolean
    userName: string
  }> {
    const url =
      this.serverType === ServerType.SasViya
        ? `${this.serverUrl}/identities/users/@currentUser`
        : this.serverType === ServerType.Sas9
        ? `${this.serverUrl}/SASStoredProcess`
        : `${this.serverUrl}/SASjsApi/session`

    // Access token is required for server type `SASjs`
    const { result: loginResponse } = await this.requestClient
      .get<string>(url, accessToken, 'text/plain')
      .catch((err: any) => {
        return { result: 'authErr' }
      })

    const isLoggedIn = loginResponse !== 'authErr'
    const userName = isLoggedIn ? this.extractUserName(loginResponse) : ''

    return { isLoggedIn, userName }
  }

  private extractUserName = (response: any): string => {
    switch (this.serverType) {
      case ServerType.SasViya:
        return response?.id

      case ServerType.Sas9:
        const matched = response?.match(/"title":"Log Off [0-1a-zA-Z ]*"/)
        const username = matched?.[0].slice(17, -1)

        if (!username.includes(' ')) return username

        return username
          .split(' ')
          .map((name: string) => name.slice(0, 3).toLowerCase())
          .join('')

      case ServerType.Sasjs:
        return response?.username

      default:
        console.error('Server Type not found in extractUserName function')
        return ''
    }
  }

  private getLoginForm(response: any) {
    const pattern: RegExp = /<form.+action="(.*Logon[^"]*).*>/
    const matches = pattern.exec(response)
    const formInputs: any = {}

    if (matches && matches.length) {
      this.setLoginUrl(matches)
      const inputs = response.match(/<input.*"hidden"[^>]*>/g)

      if (inputs) {
        inputs.forEach((inputStr: string) => {
          const valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/)

          if (valueMatch && valueMatch.length) {
            formInputs[valueMatch[1]] = valueMatch[2]
          }
        })
      }
    }

    return Object.keys(formInputs).length ? formInputs : null
  }

  private setLoginUrl = (matches: RegExpExecArray) => {
    let parsedURL = matches[1].replace(/\?.*/, '')
    if (parsedURL[0] === '/') {
      parsedURL = parsedURL.substr(1)

      const tempLoginLink = this.serverUrl
        ? `${this.serverUrl}/${parsedURL}`
        : `${parsedURL}`

      const loginUrl = tempLoginLink

      this.loginUrl =
        this.serverType === ServerType.SasViya
          ? tempLoginLink
          : loginUrl.replace('.do', '')
    }
  }

  /**
   * Logs out of the configured SAS server.
   * @param accessToken - an optional access token is required for SASjs server type.
   */
  public logOut(accessToken?: string) {
    if (this.serverType === ServerType.Sasjs) {
      return this.requestClient.post(this.logoutUrl, undefined, accessToken)
    }
    this.requestClient.clearCsrfTokens()
    return this.requestClient.get(this.logoutUrl, undefined).then(() => true)
  }
}

const isCredentialsVerifyError = (response: string): boolean =>
  /An error occurred while the system was verifying your credentials. Please enter your credentials again./gm.test(
    response
  )

const isLogInSuccess = (response: string): boolean =>
  /You have signed in/gm.test(response)
