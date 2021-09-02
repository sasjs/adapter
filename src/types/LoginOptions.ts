export interface LoginOptions {
  onLoggedOut?: () => Promise<boolean>
}
