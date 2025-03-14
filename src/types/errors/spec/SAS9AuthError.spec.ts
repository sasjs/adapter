import { SAS9AuthError } from '../SAS9AuthError'

describe('SAS9AuthError', () => {
  it('should have the correct error message', () => {
    const error = new SAS9AuthError()
    expect(error.message).toBe(
      'The credentials you provided cannot be authenticated. Please provide a valid set of credentials.'
    )
  })

  it('should have the correct error name', () => {
    const error = new SAS9AuthError()
    expect(error.name).toBe('AuthorizeError')
  })

  it('should be an instance of SAS9AuthError', () => {
    const error = new SAS9AuthError()
    expect(error).toBeInstanceOf(SAS9AuthError)
  })

  it('should be an instance of Error', () => {
    const error = new SAS9AuthError()
    expect(error).toBeInstanceOf(Error)
  })

  it('should set the prototype correctly', () => {
    const error = new SAS9AuthError()
    expect(Object.getPrototypeOf(error)).toBe(SAS9AuthError.prototype)
  })
})
