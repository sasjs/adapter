import { delay } from '../utils'

export async function verifySas9Login(loginPopup: Window) {
  let isLoggedIn = false
  let startTime = new Date()
  let elapsedSeconds = 0
  do {
    await delay(1000)
    if (loginPopup.closed) break

    isLoggedIn =
      loginPopup.window.location.href.includes('SASLogon') &&
      loginPopup.window.document.body.innerText.includes('You have signed in.')
    elapsedSeconds = (new Date().valueOf() - startTime.valueOf()) / 1000
  } while (!isLoggedIn && elapsedSeconds < 5 * 60)

  return { isLoggedIn }
}
