export const isLogInRequired = (response: string): boolean => {
  const pattern: RegExp = /<form.+action="(.*(Logon)|(login)[^"]*).*>/gm
  const matches = pattern.test(response)
  return matches
}
