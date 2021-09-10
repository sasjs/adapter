import { openLoginPrompt } from '../utils/loginPrompt'

interface WindowFeatures {
  width: number
  height: number
}

const defaultWindowFeatures: WindowFeatures = { width: 500, height: 600 }

export async function openWebPage(
  url: string,
  windowName: string = '',
  WindowFeatures: WindowFeatures = defaultWindowFeatures,
  onLoggedOut?: () => Promise<Boolean>
): Promise<Window | null> {
  const { width, height } = WindowFeatures
  const left = screen.width / 2 - width / 2
  const top = screen.height / 2 - height / 2

  const loginPopup = window.open(
    url,
    windowName,
    `toolbar=0,location=0,menubar=0,width=${width},height=${height},left=${left},top=${top}`
  )

  if (!loginPopup) {
    const getUserAction: () => Promise<Boolean> = onLoggedOut ?? openLoginPrompt

    const doLogin = await getUserAction()
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
