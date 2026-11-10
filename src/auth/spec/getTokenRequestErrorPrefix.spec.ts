import { ServerType } from '@sasjs/utils/types'
import {
  getTokenRequestErrorPrefix,
  getTokenRequestErrorPrefixResponse,
  tokenRequestErrorMessage
} from '../getTokenRequestErrorPrefix'
import {
  markResponseReceived,
  responseWasReceived
} from '../../request/responseReceived'

describe('getTokenRequestErrorPrefix', () => {
  it('should return error prefix', () => {
    // INFO: Viya with only required attributes
    let operation: 'fetching access token' = 'fetching access token'
    const funcName = 'testFunc'
    const url = '/SASjsApi/auth/token'

    let expectedPrefix = `Error while ${operation} from ${url}\nThrown by the @sasjs/adapter ${funcName} function.\n\nResponse from Viya is below.\n`

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

    expectedPrefix = `Error while ${operation} from ${url}\nThrown by the @sasjs/adapter ${funcName} function.\nPayload:\n${JSON.stringify(
      data,
      null,
      2
    )}\nHeaders:\n${JSON.stringify(headers, null, 2)}\n\nResponse from Sasjs is below.\n`

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

    expectedPrefix = `Error while ${operation} from ${url}\nThrown by the @sasjs/adapter ${funcName} function.\nPayload:\n${JSON.stringify(
      data,
      null,
      2
    )}\nHeaders:\n${JSON.stringify(headers, null, 2)}\nClientId: ${clientId}\nClientSecret: ${clientSecret}\n\nResponse from Viya is below.\n`

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

  it('should say the request did not reach the server when there was no response', () => {
    // sasjs/adapter#895: a transport failure was titled "Response from Viya is
    // below.", which reads as though the target answered with ETIMEDOUT
    expect(
      getTokenRequestErrorPrefix(
        'refreshing tokens',
        'refreshTokensForViya',
        ServerType.SasViya,
        '/SASLogon/oauth/token',
        undefined,
        undefined,
        undefined,
        undefined,
        false
      )
    ).toEqual(
      `Error while refreshing tokens from /SASLogon/oauth/token\nThrown by the @sasjs/adapter refreshTokensForViya function.\n\nNo response from Viya - the request did not reach it.\n`
    )
  })
})

describe('responseWasReceived', () => {
  it('should be true only when the error carries a response', () => {
    expect(responseWasReceived({ response: { status: 401 } })).toBe(true)
    expect(
      responseWasReceived(
        Object.assign(new Error('connect ETIMEDOUT 10.0.0.1:443'), {
          code: 'ETIMEDOUT'
        })
      )
    ).toBe(false)
    expect(responseWasReceived('unable to verify the first certificate')).toBe(
      false
    )
    expect(responseWasReceived(new Error('no response'))).toBe(false)
    expect(responseWasReceived(undefined)).toBe(false)
    expect(responseWasReceived(null)).toBe(false)
  })

  it('should keep the marker invisible to the caller', () => {
    // an error is handed to callers, logged and compared; a new enumerable
    // field would show up in all three
    const error = Object.assign(new Error('connect ETIMEDOUT'), {
      code: 'ETIMEDOUT'
    })

    markResponseReceived(error, false)

    expect(JSON.parse(JSON.stringify(error))).toEqual({ code: 'ETIMEDOUT' })
    expect(Object.keys(error)).not.toContain('responseReceived')
    expect(responseWasReceived(error)).toBe(false)
  })

  it('should leave an error it cannot mark alone', () => {
    // a frozen error takes no mark; the answer falls back to `response`
    const frozen = Object.freeze(
      Object.assign(new Error('etimedout'), { response: { status: 500 } })
    )

    expect(markResponseReceived(frozen, false)).toBe(frozen)
    expect(responseWasReceived(frozen)).toBe(true)
  })

  it('should prefer the marker the request client left', () => {
    // the boundary knows; a rebuilt error may carry `response` by accident, and
    // a response-derived error (a 401 -> LoginRequiredError) carries none at all
    expect(
      responseWasReceived(markResponseReceived(new Error('sent'), true))
    ).toBe(true)
    expect(
      responseWasReceived(
        markResponseReceived(
          Object.assign(new Error('etimedout'), {
            response: { status: 0 }
          }),
          false
        )
      )
    ).toBe(false)
    expect(markResponseReceived(new Error('x'), true)).toBeInstanceOf(Error)
  })
})

describe('tokenRequestErrorMessage', () => {
  it('should prefix the transport message without calling it a response', () => {
    const error = Object.assign(new Error('connect ETIMEDOUT 10.0.0.1:443'), {
      code: 'ETIMEDOUT'
    })

    const message = tokenRequestErrorMessage(
      error,
      'refreshing tokens',
      'refreshTokensForViya',
      ServerType.SasViya,
      '/SASLogon/oauth/token'
    ) as Error

    expect(message.message).toContain(
      'No response from Viya - the request did not reach it.'
    )
    expect(message.message).not.toContain('Response from Viya is below.')
    // the transport's own words are still there, and still say what happened
    expect(message.message).toContain('connect ETIMEDOUT 10.0.0.1:443')
  })

  it('should call the payload a response when one arrived', () => {
    const error = Object.assign(
      new Error('Request failed with status code 401'),
      { response: { status: 401, data: { error: 'invalid_token' } } }
    )

    const message = tokenRequestErrorMessage(
      error,
      'refreshing tokens',
      'refreshTokensForViya',
      ServerType.SasViya,
      '/SASLogon/oauth/token'
    ) as Error

    expect(message.message).toContain('Response from Viya is below.')
    expect(message.message).toContain('Request failed with status code 401')
  })
})

describe('the Sasjs arm', () => {
  it('should print the client id as a client id, and no empty headers section', () => {
    const prefix = getTokenRequestErrorPrefix(
      'fetching access token',
      'getAccessTokenForSasjs',
      ServerType.Sasjs,
      '/SASjsApi/auth/token',
      { clientId: 'testId', code: 'code' },
      undefined,
      'testId'
    )

    // the call passed the client id in the headers slot before this, so the
    // message printed it as a JSON header blob
    expect(prefix).toContain('ClientId: testId')
    expect(prefix).not.toContain('Headers:')
  })
})

describe('getTokenRequestErrorPrefixResponse', () => {
  it('should read the payload after either title', () => {
    const received = `Error while refreshing tokens from /x\nThrown by the @sasjs/adapter f function.\n\nResponse from Viya is below.\n\nAuth error: {"error":"invalid_token"}`

    expect(
      getTokenRequestErrorPrefixResponse(received, ServerType.SasViya)
    ).toEqual('\nAuth error: {"error":"invalid_token"}')

    const unreachable =
      'Error while refreshing tokens from /x\nThrown by the @sasjs/adapter f function.\n\nNo response from Viya - the request did not reach it.\nconnect ETIMEDOUT 10.0.0.1:443'

    expect(
      getTokenRequestErrorPrefixResponse(unreachable, ServerType.SasViya)
    ).toEqual('connect ETIMEDOUT 10.0.0.1:443')
  })
})
