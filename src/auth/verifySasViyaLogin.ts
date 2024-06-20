import { delay } from '../utils'
import { enLoginSuccessHeader } from './AuthManager'

export async function verifySasViyaLogin(loginPopup: Window): Promise<{
  isLoggedIn: boolean
}> {
  let isLoggedIn = false
  let startTime = new Date()
  let elapsedSeconds = 0
  do {
    await delay(1000)
    if (loginPopup.closed) break
    isLoggedIn = isLoggedInSASVIYA()
    elapsedSeconds = (new Date().valueOf() - startTime.valueOf()) / 1000
  } while (!isLoggedIn && elapsedSeconds < 5 * 60)

  let isAuthorized = false
  startTime = new Date()
  do {
    await delay(1000)
    if (loginPopup.closed) break
    isAuthorized =
      loginPopup.window.location.href.includes('SASLogon') ||
      loginPopup.window.document.body?.innerText?.includes(enLoginSuccessHeader)
    elapsedSeconds = (new Date().valueOf() - startTime.valueOf()) / 1000
  } while (!isAuthorized && elapsedSeconds < 5 * 60)

  return { isLoggedIn: isLoggedIn && isAuthorized }
}

export const isLoggedInSASVIYA = () =>
  document.cookie.includes('Current-User') && document.cookie.includes('userId')
