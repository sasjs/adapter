import { ServerType } from '@sasjs/utils/types'
import { getUserLanguage } from '../utils'

const enLoginSuccessHeader = 'You have signed in.'

export const defaultSuccessHeaderKey = 'default'

// The following headers provided by https://github.com/sasjs/adapter/issues/835#issuecomment-2177818601
export const loginSuccessHeaders: { [key: string]: string } = {
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
  [defaultSuccessHeaderKey]: enLoginSuccessHeader
}

/**
 * Provides expected login header based on language settings of the browser.
 * @returns - expected header as a string.
 */
export const getExpectedLogInSuccessHeader = (): string => {
  // get default success header
  let successHeader = loginSuccessHeaders[defaultSuccessHeaderKey]

  // get user language based on language settings of the browser
  const userLang = getUserLanguage()

  if (userLang) {
    // get success header on exact match of the language code
    let userLangSuccessHeader = loginSuccessHeaders[userLang]

    // handle case when there is no exact match of the language code
    if (!userLangSuccessHeader) {
      // get all supported language codes
      const headerLanguages = Object.keys(loginSuccessHeaders)

      // find language code on partial match
      const headerLanguage = headerLanguages.find((language) =>
        new RegExp(language, 'i').test(userLang)
      )

      // reassign success header if partial match was found
      if (headerLanguage) {
        successHeader = loginSuccessHeaders[headerLanguage]
      }
    } else {
      successHeader = userLangSuccessHeader
    }
  }

  return successHeader
}

/**
 * Checks if Login success header is present in the response based on language settings of the browser.
 * @param serverType - server type.
 * @param response - response object.
 * @returns - boolean indicating if Login success header is present.
 */
export const isLogInSuccessHeaderPresent = (
  serverType: ServerType,
  response: any
): boolean => {
  if (serverType === ServerType.Sasjs) return response?.loggedIn

  return new RegExp(getExpectedLogInSuccessHeader(), 'gm').test(response)
}
