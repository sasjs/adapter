export interface LoginOptions {
  onLoggedOut?: () => Promise<boolean>
}

export interface LoginReturn {
  isLoggedIn: boolean
  userName: string
}
