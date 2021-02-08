import { ServerType } from '@sasjs/utils/types'
import { isAuthorizeFormRequired } from '.'
import { RequestClient } from '../request/RequestClient'
import { serialize } from '../utils'

export class AuthManager {
  public userName = ''
  private loginUrl: string
  private logoutUrl: string
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
        : '/SASLogon/logout.do?'
  }

  /**
   * Logs into the SAS server with the supplied credentials.
   * @param username - a string representing the username.
   * @param password - a string representing the password.
   */
  public async logIn(username: string, password: string) {
    const loginParams: any = {
      _service: 'default',
      username,
      password
    }

    this.userName = loginParams.username

    const { isLoggedIn, loginForm } = await this.checkSession()
    if (isLoggedIn) {
      await this.loginCallback()

      return {
        isLoggedIn,
        userName: this.userName
      }
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

    let loggedIn

    if (isAuthorizeFormRequired(loginResponse)) {
      await this.requestClient.authorize(loginResponse)
    } else {
      loggedIn = isLogInSuccess(loginResponse)
    }

    if (!loggedIn) {
      const currentSession = await this.checkSession()
      loggedIn = currentSession.isLoggedIn
    }

    if (loggedIn) {
      this.loginCallback()
    }

    return {
      isLoggedIn: !!loggedIn,
      userName: this.userName
    }
  }

  /**
   * Checks whether a session is active, or login is required.
   * @returns - a promise which resolves with an object containing two values - a boolean `isLoggedIn`, and a string `userName`.
   */
  public async checkSession() {
    const { result: loginResponse } = await this.requestClient.get<string>(
      this.loginUrl.replace('.do', ''),
      undefined,
      'text/plain'
    )
    const responseText = loginResponse
    const isLoggedIn = /<button.+onClick.+logout/gm.test(responseText)
    let loginForm: any = null

    if (!isLoggedIn) {
      loginForm = await this.getLoginForm(responseText)
    } else {
      //Send request to /folders/folders to trigger Assumable Gropups form
      const foldersResponse = await fetch(`${this.serverUrl}/folders/folders`)
      const foldersResponseText = await foldersResponse.text()

      if (isAuthorizeFormRequired(foldersResponseText)) {
        await this.requestClient.authorize(foldersResponseText)
      }
    }

    return Promise.resolve({
      isLoggedIn,
      userName: this.userName,
      loginForm
    })
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
   */
  public logOut() {
    this.requestClient.clearCsrfTokens()
    return this.requestClient.get(this.logoutUrl, undefined).then(() => true)
  }
}

const isLogInSuccess = (response: string): boolean =>
  /You have signed in/gm.test(response)
