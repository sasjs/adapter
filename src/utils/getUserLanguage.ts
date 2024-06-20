interface IEnavigator {
  userLanguage?: string
}

/**
 * Provides preferred language of the user.
 * @returns A string representing the preferred language of the user, usually the language of the browser UI. Examples of valid language codes include "en", "en-US", "fr", "fr-FR", "es-ES". More info available https://datatracker.ietf.org/doc/html/rfc5646
 */
export const getUserLanguage = () =>
  window.navigator.language || (window.navigator as IEnavigator).userLanguage
