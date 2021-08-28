import { openLoginPrompt } from '../utils/loginPrompt'

interface windowFeatures {
  width: number
  height: number
}

export async function openWebPage(
  url: string,
  windowName: string = '',
  { width, height }: windowFeatures
): Promise<Window | null> {
  const left = screen.width / 2 - width / 2
  const top = screen.height / 2 - height / 2

  const loginPopup = window.open(
    url,
    windowName,
    `toolbar=0,location=0,menubar=0,width=${width},height=${height},left=${left},top=${top}`
  )

  if (!loginPopup) {
    const doLogin = await openLoginPrompt()
    return doLogin
      ? window.open(
          url,
          windowName,
          `toolbar=0,location=0,menubar=0,width=${width},height=${height},left=${left},top=${top}`
        )
      : null
  }

  return loginPopup
}
