import { ServerType } from '@sasjs/utils/types'
import { getTokenRequestErrorPrefix } from '../getTokenRequestErrorPrefix'

describe('getTokenRequestErrorPrefix', () => {
  it('should return error prefix', () => {
    // INFO: Viya with only required attributes
    let operation: 'fetching access token' = 'fetching access token'
    const funcName = 'testFunc'
    const url = '/SASjsApi/auth/token'

    let expectedPrefix = `Error while ${operation} from ${url}
Thrown by the @sasjs/adapter ${funcName} function.

Response from Viya is below.
`

    expect(
      getTokenRequestErrorPrefix(operation, funcName, ServerType.SasViya, url)
    ).toEqual(expectedPrefix)

    // INFO: Sasjs with data and headers
    const data = {
      grant_type: 'authorization_code',
      code: 'testCode'
    }
    const headers = {
      Authorization: 'Basic test=',
      Accept: 'application/json'
    }

    expectedPrefix = `Error while ${operation} from ${url}
Thrown by the @sasjs/adapter ${funcName} function.
Payload:
${JSON.stringify(data, null, 2)}
Headers:
${JSON.stringify(headers, null, 2)}

Response from Sasjs is below.
`

    expect(
      getTokenRequestErrorPrefix(
        operation,
        funcName,
        ServerType.Sasjs,
        url,
        data,
        headers
      )
    ).toEqual(expectedPrefix)

    // INFO: Viya with all attributes
    const clientId = 'testId'
    const clientSecret = 'testSecret'

    expectedPrefix = `Error while ${operation} from ${url}
Thrown by the @sasjs/adapter ${funcName} function.
Payload:
${JSON.stringify(data, null, 2)}
Headers:
${JSON.stringify(headers, null, 2)}
ClientId: ${clientId}
ClientSecret: ${clientSecret}

Response from Viya is below.
`

    expect(
      getTokenRequestErrorPrefix(
        operation,
        funcName,
        ServerType.SasViya,
        url,
        data,
        headers,
        clientId,
        clientSecret
      )
    ).toEqual(expectedPrefix)
  })
})
