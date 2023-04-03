import { ServerType } from '@sasjs/utils/types'
import { RequestClient } from '../request/RequestClient'
import { NotFoundError } from '../types/errors'
import { LoginOptions, LoginResult, LoginResultInternal } from '../types/Login'
import { serialize } from '../utils'
import { extractUserLongNameSas9 } from '../utils/sas9/extractUserLongNameSas9'
import { openWebPage } from './openWebPage'
import { verifySas9Login } from './verifySas9Login'
import { verifySasViyaLogin } from './verifySasViyaLogin'

export class AuthManager {
  public userName = ''
  public userLongName = ''
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
        : '/SASLogon/logout'
  }

  /**
   * Opens Pop up window to SAS Login screen.
   * And checks if user has finished login process.
   */
  public async redirectedLogIn({
    onLoggedOut
  }: LoginOptions): Promise<LoginResult> {
    const {
      isLoggedIn: isLoggedInAlready,
      userName: currentSessionUserName,
      userLongName: currentSessionUserLongName
    } = await this.fetchUserName()

    if (isLoggedInAlready) {
      const logger = process.logger || console
      logger.log('login was not attempted as a valid session already exists')

      await this.loginCallback()

      return {
        isLoggedIn: true,
        userName: currentSessionUserName,
        userLongName: currentSessionUserLongName
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
      return { isLoggedIn: false, userName: '', userLongName: '' }
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

      const { userName, userLongName } = await this.fetchUserName()

      await this.loginCallback()

      return { isLoggedIn: true, userName, userLongName }
    }

    return { isLoggedIn: false, userName: '', userLongName: '' }
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
    this.userName = ''
    this.userLongName = ''

    let {
      isLoggedIn: isLoggedInAlready,
      loginForm,
      userLongName: currentSessionUserLongName
    } = await this.checkSession()

    if (isLoggedInAlready) {
      const logger = process.logger || console
      logger.log('login was not attempted as a valid session already exists')

      await this.loginCallback()

      this.userName = loginParams.username
      this.userLongName = currentSessionUserLongName
      return {
        isLoggedIn: true,
        userName: this.userName,
        userLongName: this.userLongName
      }
    }

    let loginResponse = await this.sendLoginRequest(loginForm, loginParams)

    let isLoggedIn = isLogInSuccess(this.serverType, loginResponse)

    if (!isLoggedIn) {
      if (isCredentialsVerifyError(loginResponse)) {
        const newLoginForm = await this.getLoginForm(loginResponse)

        loginResponse = await this.sendLoginRequest(newLoginForm, loginParams)
      }

      // Sometimes due to redirection on SAS9 and SASViya we don't get the login response that says
      // You have signed in. Therefore, we have to make an extra request for checking session to
      // ensure either user is logged in or not.

      const res = await this.checkSession()
      isLoggedIn = res.isLoggedIn
      this.userLongName = res.userLongName
    }

    if (isLoggedIn) {
      if (this.serverType === ServerType.Sas9) {
        await this.performCASSecurityCheck()
      }

      this.loginCallback()
      this.userName = loginParams.username
    }

    return {
      isLoggedIn,
      userName: this.userName,
      userLongName: this.userLongName
    }
  }

  private async performCASSecurityCheck() {
    const casAuthenticationUrl = `${this.serverUrl}/SASStoredProcess/j_spring_cas_security_check`

    await this.requestClient
      .get<string>(`/SASLogon/login?service=${casAuthenticationUrl}`, undefined)
      .catch((err) => {
        // ignore if resource not found error
        if (!(err instanceof NotFoundError)) throw err
      })
  }

  private async sendLoginRequest(
    loginForm: { [key: string]: any },
    loginParams: { [key: string]: any }
  ) {
    if (this.serverType === ServerType.Sasjs) {
      const { username, password } = loginParams
      const { result: loginResponse } = await this.requestClient.post<string>(
        this.loginUrl,
        { username, password },
        undefined
      )

      return loginResponse
    }

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
   * @returns - a promise which resolves with an object containing three values
   *  - a boolean `isLoggedIn`
   *  - a string `userName`,
   *  - a string `userFullName` and
   *  - a form `loginForm` if not loggedin.
   */
  public async checkSession(): Promise<LoginResultInternal> {
    const { isLoggedIn, userName, userLongName } = await this.fetchUserName()
    let loginForm = null

    if (!isLoggedIn) {
      //We will logout to make sure cookies are removed and login form is presented
      //Residue can happen in case of session expiration
      await this.logOut()

      loginForm = await this.getNewLoginForm()
    }

    return Promise.resolve({
      isLoggedIn,
      userName,
      userLongName,
      loginForm
    })
  }

  private async getNewLoginForm() {
    if (this.serverType === ServerType.Sasjs) {
      // server will be sending CSRF token in response,
      // need to save in cookie so that,
      // http client will use it automatically
      return this.requestClient.get('/', undefined).then(({ result }) => {
        const cookie =
          /<script>document.cookie = '(XSRF-TOKEN=.*; Max-Age=86400; SameSite=Strict; Path=\/;)'<\/script>/.exec(
            result as string
          )?.[1]

        if (cookie) document.cookie = cookie
      })
    }

    const { result: formResponse } = await this.requestClient.get<string>(
      this.loginUrl.replace('/SASLogon/login.do', '/SASLogon/login'),
      undefined,
      'text/plain'
    )

    return await this.getLoginForm(formResponse)
  }

  private async fetchUserName(): Promise<LoginResult> {
    const url =
      this.serverType === ServerType.SasViya
        ? `${this.serverUrl}/identities/users/@currentUser`
        : this.serverType === ServerType.Sas9
        ? `${this.serverUrl}/SASStoredProcess`
        : `${this.serverUrl}/SASjsApi/session`

    const { result: loginResponse } = await this.requestClient
      .get<string>(url, undefined, 'text/plain')
      .catch((err: any) => {
        return { result: 'authErr' }
      })

    const isLoggedIn = loginResponse !== 'authErr'

    if (!isLoggedIn) {
      //We will logout to make sure cookies are removed and login form is presented
      //Residue can happen in case of session expiration
      await this.logOut()
      return { isLoggedIn, userName: '', userLongName: '' }
    }

    return {
      isLoggedIn,
      userName: this.extractUserName(loginResponse),
      userLongName: this.extractUserLongName(loginResponse)
    }
  }

  private extractUserName = (response: any): string => {
    switch (this.serverType) {
      case ServerType.SasViya:
        return response?.id

      case ServerType.Sas9:
        return ''

      case ServerType.Sasjs:
        return response?.username

      default:
        console.error('Server Type not found in extractUserName function')
        return ''
    }
  }

  private extractUserLongName = (response: any): string => {
    switch (this.serverType) {
      case ServerType.SasViya:
        return response?.name

      case ServerType.Sas9:
        return extractUserLongNameSas9(response)

      case ServerType.Sasjs:
        return response?.displayName

      default:
        console.error('Server Type not found in extractUserName function')
        return ''
    }
  }

  private getLoginForm(response: any) {
    const pattern: RegExp = /<form.+action="(.*(Logon|login)[^"]*).*>/
    const matches = pattern.exec(response)
    const formInputs: any = {}

    if (matches && matches.length) {
      this.setLoginUrl(matches)
      response = response.replace(/<input/g, '\n<input')
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
          : loginUrl.replace('/SASLogon/login.do', '/SASLogon/login')
    }
  }

  /**
   * Logs out of the configured SAS server.
   *
   */
  public async logOut() {
    this.requestClient.clearCsrfTokens()

    return this.requestClient.get(this.logoutUrl, undefined).then(() => true)
  }
}

const isCredentialsVerifyError = (response: string): boolean =>
  /An error occurred while the system was verifying your credentials. Please enter your credentials again./gm.test(
    response
  )

const isLogInSuccess = (serverType: ServerType, response: any): boolean => {
  if (serverType === ServerType.Sasjs) return response?.loggedin

  return /You have signed in/gm.test(response)
}
