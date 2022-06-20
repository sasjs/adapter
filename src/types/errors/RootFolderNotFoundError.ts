import { decodeToken } from '@sasjs/utils/auth'

export class RootFolderNotFoundError extends Error {
  constructor(
    parentFolderPath: string,
    serverUrl: string,
    accessToken?: string
  ) {
    let message: string =
      `Root folder ${parentFolderPath} was not found.` +
      `\nPlease check ${serverUrl}/SASDrive.` +
      `\nIf the folder DOES exist then it is likely a permission problem.\n`
    if (accessToken) {
      const decodedToken = decodeToken(accessToken)
      let scope = decodedToken.scope
      scope = scope.map(element => '* ' + element)
      message +=
        `Your access token contains the following scopes:\n` + scope.join('\n')
    }
    super(message)
    this.name = 'RootFolderNotFoundError'
    Object.setPrototypeOf(this, RootFolderNotFoundError.prototype)
  }
}
