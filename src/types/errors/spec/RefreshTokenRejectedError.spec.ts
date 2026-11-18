import { AxiosResponse } from 'axios'
import { throwIfError } from '../../../request/RequestClient'
import { LoginRequiredError } from '../LoginRequiredError'
import { RefreshTokenRejectedError } from '../RefreshTokenRejectedError'

const response = (status: number, url: string, data: any = 'Unauthorized') =>
  ({ status, data, config: { url } }) as unknown as AxiosResponse

/**
 * A 401 means different things on different routes, and the adapter used to
 * report every one of them as "You must be logged in to access this resource".
 * On the refresh route that sends the reader looking at their login state when
 * the credential that was refused is the refresh token on disk.
 */
describe('RefreshTokenRejectedError', () => {
  it('is raised when the refresh route answers 401', () => {
    expect(() => throwIfError(response(401, '/SASjsApi/auth/refresh'))).toThrow(
      RefreshTokenRejectedError
    )
  })

  it('is still a LoginRequiredError, so callers treating a 401 as "get a session" keep working', () => {
    let error: any
    try {
      throwIfError(response(401, '/SASjsApi/auth/refresh'))
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(LoginRequiredError)
    expect(error.name).toEqual('RefreshTokenRejectedError')
  })

  it('says the refresh token was rejected instead of asking the user to log in', () => {
    let error: any
    try {
      throwIfError(response(401, '/SASjsApi/auth/refresh'))
    } catch (e) {
      error = e
    }

    expect(error.message).toContain('rejected the refresh token')
    expect(error.message).toContain('single use')
    // The old text sent the reader to the wrong place.
    expect(error.message).not.toContain(
      'You must be logged in to access this resource'
    )
  })

  it('carries the server response when there is one', () => {
    let error: any
    try {
      throwIfError(
        response(401, '/SASjsApi/auth/refresh', '{"message":"Unauthorized"}')
      )
    } catch (e) {
      error = e
    }

    expect(error.message).toContain('Server response:')
    expect(error.message).toContain('Unauthorized')
  })

  it('matches a refresh route mounted at a custom api path', () => {
    expect(() => throwIfError(response(401, '/api/auth/refresh'))).toThrow(
      RefreshTokenRejectedError
    )
  })

  it('leaves a 401 from a data route as a plain LoginRequiredError', () => {
    let error: any
    try {
      throwIfError(response(401, '/SASjsApi/drive/deploy'))
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(LoginRequiredError)
    expect(error.name).toEqual('LoginRequiredError')
  })

  it('leaves a 401 from the Viya token route alone - there it means bad client credentials', () => {
    let error: any
    try {
      throwIfError(response(401, '/SASLogon/oauth/token'))
    } catch (e) {
      error = e
    }

    expect(error.name).toEqual('LoginRequiredError')
  })

  it('does not match a route that merely contains the word refresh', () => {
    let error: any
    try {
      throwIfError(response(401, '/SASjsApi/refreshCatalog'))
    } catch (e) {
      error = e
    }

    expect(error.name).toEqual('LoginRequiredError')
  })
})
