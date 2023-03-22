export interface LoginOptions {
  onLoggedOut?: () => Promise<boolean>
}

export interface LoginResult {
  isLoggedIn: boolean
  userName: string
  userLongName: string
  message?: string
}
export interface LoginResultInternal {
  isLoggedIn: boolean
  userName: string
  userLongName: string
  loginForm?: any
}
