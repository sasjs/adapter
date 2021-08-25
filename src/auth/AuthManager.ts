import { ServerType } from '@sasjs/utils/types'
import { RequestClient } from '../request/RequestClient'
import { serialize } from '../utils'
import { openWebPage } from './openWebPage'
import { verifyingPopUpLoginSAS9 } from './verifyingPopUpLoginSAS9'
import { verifyingPopUpLoginSASVIYA } from './verifyingPopUpLoginSASVIYA'

export class AuthManager {
  public userName = ''
  private loginUrl: string
  private logoutUrl: string
  private loginPreventRedirectUrl = `/SASLogon/home`
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

  public async redirectedLogIn() {
    const loginPopup = openWebPage(this.loginPreventRedirectUrl, 'SASLogon', {
      width: 500,
      height: 600
    })

    if (!loginPopup) {
      alert('Unable to open popup for login. Please try with other browser.')
      return { isLoggedIn: false }
    }

    const { isLoggedIn } =
      this.serverType === ServerType.SasViya
        ? await verifyingPopUpLoginSASVIYA(loginPopup)
        : await verifyingPopUpLoginSAS9(loginPopup)

    loginPopup.close()

    if (isLoggedIn) {
      if (this.serverType === ServerType.Sas9) {
        const casAuthenticationUrl = `${this.serverUrl}/SASStoredProcess/j_spring_cas_security_check`

        await this.requestClient.get<string>(
          `/SASLogon/login?service=${casAuthenticationUrl}`,
          undefined
        )
      }

      await this.loginCallback()
    }

    return { isLoggedIn }
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

    let loginResponse = await this.sendLoginRequest(loginForm, loginParams)

    let loggedIn = isLogInSuccess(loginResponse)

    if (!loggedIn) {
      if (isCredentialsVerifyError(loginResponse)) {
        const newLoginForm = await this.getLoginForm(loginResponse)

        loginResponse = await this.sendLoginRequest(newLoginForm, loginParams)
      }

      const currentSession = await this.checkSession()
      loggedIn = currentSession.isLoggedIn
    }

    if (loggedIn) {
      if (this.serverType === ServerType.Sas9) {
        const casAuthenticationUrl = `${this.serverUrl}/SASStoredProcess/j_spring_cas_security_check`

        await this.requestClient.get<string>(
          `/SASLogon/login?service=${casAuthenticationUrl}`,
          undefined
        )
      }

      this.loginCallback()
    }

    return {
      isLoggedIn: !!loggedIn,
      userName: this.userName
    }
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
   * @returns - a promise which resolves with an object containing two values - a boolean `isLoggedIn`, and a string `userName`.
   */
  public async checkSession() {
    //For VIYA we will send request on API endpoint. Which is faster then pinging SASJobExecution.
    //For SAS9 we will send request on SASStoredProcess
    const url =
      this.serverType === 'SASVIYA'
        ? `${this.serverUrl}/identities`
        : `${this.serverUrl}/SASStoredProcess`

    const { result: loginResponse } = await this.requestClient
      .get<string>(url, undefined, 'text/plain')
      .catch((err: any) => {
        return { result: 'authErr' }
      })

    const isLoggedIn = loginResponse !== 'authErr'
    let loginForm = null

    if (!isLoggedIn) {
      //We will logout to make sure cookies are removed and login form is presented
      //Residue can happen in case of session expiration
      await this.logOut()

      const { result: formResponse } = await this.requestClient.get<string>(
        this.loginUrl.replace('.do', ''),
        undefined,
        'text/plain'
      )

      loginForm = await this.getLoginForm(formResponse)
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

const isCredentialsVerifyError = (response: string): boolean =>
  /An error occurred while the system was verifying your credentials. Please enter your credentials again./gm.test(
    response
  )

const isLogInSuccess = (response: string): boolean =>
  /You have signed in/gm.test(response)
