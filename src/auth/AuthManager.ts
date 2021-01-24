import axios, { AxiosInstance } from 'axios'
import { isAuthorizeFormRequired, parseAndSubmitAuthorizeForm } from '.'
import { ServerType } from '../types'
import { serialize } from '../utils'

export class AuthManager {
  public userName = ''
  private loginUrl: string
  private logoutUrl: string
  private httpClient: AxiosInstance
  constructor(
    private serverUrl: string,
    private serverType: ServerType,
    private loginCallback: () => Promise<void>
  ) {
    this.httpClient = axios.create({ baseURL: this.serverUrl })
    this.loginUrl = `/SASLogon/login`
    this.logoutUrl =
      this.serverType === ServerType.SAS9
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

    const loginResponse = await this.httpClient
      .post<string>(this.loginUrl, loginParamsStr, {
        withCredentials: true,
        responseType: 'text',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: '*/*'
        }
      })
      .then((response) => response.data)

    let loggedIn

    if (isAuthorizeFormRequired(loginResponse)) {
      await parseAndSubmitAuthorizeForm(loginResponse, this.serverUrl)
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
    const loginResponse = await axios.get(this.loginUrl.replace('.do', ''), {
      responseType: 'text',
      headers: {
        Accept: '*/*'
      }
    })
    const responseText = await loginResponse.data
    const isLoggedIn = /<button.+onClick.+logout/gm.test(responseText)
    let loginForm: any = null

    if (!isLoggedIn) {
      loginForm = await this.getLoginForm(responseText)
    }

    return Promise.resolve({
      isLoggedIn,
      userName: this.userName,
      loginForm
    })
  }

  private async getLoginForm(response: any) {
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
        this.serverType === ServerType.SASViya
          ? tempLoginLink
          : loginUrl.replace('.do', '')
    }
  }

  /**
   * Logs out of the configured SAS server.
   */
  public logOut() {
    return this.httpClient.get(this.logoutUrl).then(() => true)
  }
}

const isLogInSuccess = (response: string): boolean =>
  /You have signed in/gm.test(response)
