import { ServerType } from '@sasjs/utils/types'
import { RequestClient } from '../request/RequestClient'
import { NotFoundError } from '../types/errors'
import { LoginOptions, LoginResult, LoginResultInternal } from '../types/Login'
import { serialize, getUserLanguage } from '../utils'
import { extractUserLongNameSas9 } from '../utils/sas9/extractUserLongNameSas9'
import { openWebPage } from './openWebPage'
import { verifySas9Login } from './verifySas9Login'
import { verifySasViyaLogin } from './verifySasViyaLogin'

export class AuthManager {
  public userName = ''
  public userLongName = ''
  private loginUrl: string
  private logoutUrl: string
  private redirectedLoginUrl = `/SASLogon` //SAS 9 M8 no longer redirects from `/SASLogon/home` to the login page. `/SASLogon` seems to be stable enough across SAS versions
  private defaultSuccessHeaderKey = 'default'
  private successHeaders: { [key: string]: string } = {
    es: `Ya se ha iniciado la sesi\u00f3n.`,
    th: `\u0e04\u0e38\u0e13\u0e25\u0e07\u0e0a\u0e37\u0e48\u0e2d\u0e40\u0e02\u0e49\u0e32\u0e43\u0e0a\u0e49\u0e41\u0e25\u0e49\u0e27`,
    ja: `\u30b5\u30a4\u30f3\u30a4\u30f3\u3057\u307e\u3057\u305f\u3002`,
    nb: `Du har logget deg p\u00e5.`,
    sl: `Prijavili ste se.`,
    ar: `\u0644\u0642\u062f \u0642\u0645\u062a `,
    sk: `Prihl\u00e1sili ste sa.`,
    zh_HK: `\u60a8\u5df2\u767b\u5165\u3002`,
    zh_CN: `\u60a8\u5df2\u767b\u5f55\u3002`,
    it: `L'utente si \u00e8 connesso.`,
    sv: `Du har loggat in.`,
    he: `\u05e0\u05db\u05e0\u05e1\u05ea `,
    nl: `U hebt zich aangemeld.`,
    pl: `Zosta\u0142e\u015b zalogowany.`,
    ko: `\ub85c\uadf8\uc778\ud588\uc2b5\ub2c8\ub2e4.`,
    zh_TW: `\u60a8\u5df2\u767b\u5165\u3002`,
    tr: `Oturum a\u00e7t\u0131n\u0131z.`,
    iw: `\u05e0\u05db\u05e0\u05e1\u05ea `,
    fr: `Vous \u00eates connect\u00e9.`,
    uk: `\u0412\u0438 \u0432\u0432\u0456\u0439\u0448\u043b\u0438 \u0432 \u043e\u0431\u043b\u0456\u043a\u043e\u0432\u0438\u0439 \u0437\u0430\u043f\u0438\u0441.`,
    pt_BR: `Voc\u00ea se conectou.`,
    no: `Du har logget deg p\u00e5.`,
    cs: `Jste p\u0159ihl\u00e1\u0161eni.`,
    fi: `Olet kirjautunut sis\u00e4\u00e4n.`,
    ru: `\u0412\u044b \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u043b\u0438 \u0432\u0445\u043e\u0434 \u0432 \u0441\u0438\u0441\u0442\u0435\u043c\u0443.`,
    el: `\u0388\u03c7\u03b5\u03c4\u03b5 \u03c3\u03c5\u03bd\u03b4\u03b5\u03b8\u03b5\u03af.`,
    hr: `Prijavili ste se.`,
    da: `Du er logget p\u00e5.`,
    de: `Sie sind jetzt angemeldet.`,
    sh: `Prijavljeni ste.`,
    pt: `Iniciou sess\u00e3o.`,
    hu: `Bejelentkezett.`,
    sr: `Prijavljeni ste.`,
    en: enLoginSuccessHeader,
    [this.defaultSuccessHeaderKey]: enLoginSuccessHeader
  }

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

    this.redirectedLoginUrl = this.serverUrl + this.redirectedLoginUrl
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

    let isLoggedIn = this.isLogInSuccessHeaderPresent(
      this.serverType,
      loginResponse
    )

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

  /**
   * Checks if Login success header is present in the response based on language settings of the browser
   * @param serverType - server type
   * @param response - response object
   * @returns - return boolean indicating if Login success header is present
   */
  private isLogInSuccessHeaderPresent(
    serverType: ServerType,
    response: any
  ): boolean {
    if (serverType === ServerType.Sasjs) return response?.loggedin

    // get default success header
    let successHeader = this.successHeaders[this.defaultSuccessHeaderKey]

    // get user language based on language settings of the browser
    const userLang = getUserLanguage()

    if (userLang) {
      // get success header on exact match of the language code
      let userLangSuccessHeader = this.successHeaders[userLang]

      // handle case when there is no exact match of the language code
      if (!userLangSuccessHeader) {
        // get all supported language codes
        const headerLanguages = Object.keys(this.successHeaders)

        // find language code on partial match
        const headerLanguage = headerLanguages.find((language) =>
          new RegExp(language, 'i').test(userLang)
        )

        // reassign success header if partial match was found
        if (headerLanguage) {
          successHeader = this.successHeaders[headerLanguage]
        }
      } else {
        successHeader = userLangSuccessHeader
      }
    }

    return new RegExp(successHeader, 'gm').test(response)
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

export const enLoginSuccessHeader = 'You have signed in.'
