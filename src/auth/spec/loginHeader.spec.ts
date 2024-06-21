/**
 * @jest-environment jsdom
 */

import { ServerType } from '@sasjs/utils/types'
import {
  loginSuccessHeaders,
  isLogInSuccessHeaderPresent,
  defaultSuccessHeaderKey
} from '../'

describe('isLogInSuccessHeaderPresent', () => {
  let languageGetter: any

  beforeEach(() => {
    languageGetter = jest.spyOn(window.navigator, 'language', 'get')
  })

  it('should check SASVIYA and SAS9 login success header based on language preferences of the browser', () => {
    // test SASVIYA server type
    Object.keys(loginSuccessHeaders).forEach((key) => {
      languageGetter.mockReturnValue(key)

      expect(
        isLogInSuccessHeaderPresent(
          ServerType.SasViya,
          loginSuccessHeaders[key]
        )
      ).toBeTruthy()
    })

    // test SAS9 server type
    Object.keys(loginSuccessHeaders).forEach((key) => {
      languageGetter.mockReturnValue(key)

      expect(
        isLogInSuccessHeaderPresent(ServerType.Sas9, loginSuccessHeaders[key])
      ).toBeTruthy()
    })

    // test possible longer language codes
    const possibleLanguageCodes = [
      { short: 'en', long: 'en-US' },
      { short: 'fr', long: 'fr-FR' },
      { short: 'es', long: 'es-ES' }
    ]

    possibleLanguageCodes.forEach((key) => {
      const { short, long } = key
      languageGetter.mockReturnValue(long)

      expect(
        isLogInSuccessHeaderPresent(
          ServerType.SasViya,
          loginSuccessHeaders[short]
        )
      ).toBeTruthy()
    })

    // test falling back to default language code
    languageGetter.mockReturnValue('WRONG-LANGUAGE')

    expect(
      isLogInSuccessHeaderPresent(
        ServerType.Sas9,
        loginSuccessHeaders[defaultSuccessHeaderKey]
      )
    ).toBeTruthy()
  })

  it('should check SASVJS login success header', () => {
    expect(
      isLogInSuccessHeaderPresent(ServerType.Sasjs, { loggedIn: true })
    ).toBeTruthy()

    expect(
      isLogInSuccessHeaderPresent(ServerType.Sasjs, { loggedIn: false })
    ).toBeFalsy()

    expect(isLogInSuccessHeaderPresent(ServerType.Sasjs, undefined)).toBeFalsy()
  })
})
