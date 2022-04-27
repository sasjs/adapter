export interface LoginOptions {
  onLoggedOut?: () => Promise<boolean>
}

export interface LoginResult {
  isLoggedIn: boolean
  userName: string
}
