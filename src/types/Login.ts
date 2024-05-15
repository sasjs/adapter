export interface LoginOptions {
  onLoggedOut?: () => Promise<boolean>
}

export interface LoginResult {
  isLoggedIn: boolean
  userName: string
  userLongName: string
  errorMessage?: string
}
export interface LoginResultInternal {
  isLoggedIn: boolean
  userName: string
  userLongName: string
  loginForm?: any
}
