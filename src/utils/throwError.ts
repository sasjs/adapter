import { DecodedToken, decodeToken } from '@sasjs/utils'

export const rootFolderNotFound = (
  parentFolderPath: string,
  serverUrl: string,
  accessToken?: string
) => {
  let error: string = `Root folder ${parentFolderPath} was not found\nPlease check ${serverUrl}/SASDrive\nIf folder DOES exist then it is likely a permission problem\n`
  if (accessToken) {
    const decodedToken: DecodedToken = decodeToken(accessToken)
    let scope = decodedToken.scope
    scope = scope.map((element) => '* ' + element)
    error +=
      `The following scopes are contained in access token:\n` + scope.join('\n')
  }
  throw new Error(error)
}
