import { RootFolderNotFoundError } from './RootFolderNotFoundError'

describe('RootFolderNotFoundError', () => {
  it('when access token is provided, error message should contain the scopes in the token', () => {
    const token =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6WyJzY29wZS0xIiwic2NvcGUtMiJdfQ.ktqPL2ulln-8Asa2jSV9QCfDYmQuNk4tNKopxJR5xZs'

    const error = new RootFolderNotFoundError(
      '/myProject',
      'https://sas.4gl.io',
      token
    )

    expect(error).toBeInstanceOf(RootFolderNotFoundError)
    expect(error.message).toContain('scope-1')
    expect(error.message).toContain('scope-2')
  })

  it('when access token is not provided, error message should not contain scopes', () => {
    const error = new RootFolderNotFoundError(
      '/myProject',
      'https://sas.4gl.io'
    )

    expect(error).toBeInstanceOf(RootFolderNotFoundError)
    expect(error.message).not.toContain(
      'Your access token contains the following scopes'
    )
  })

  it('should include the folder path and SASDrive URL in the message', () => {
    const folderPath = '/myProject'
    const serverUrl = 'https://sas.4gl.io'
    const error = new RootFolderNotFoundError(folderPath, serverUrl)

    expect(error).toBeInstanceOf(RootFolderNotFoundError)
    expect(error.message).toContain(folderPath)
    expect(error.message).toContain(`${serverUrl}/SASDrive`)
  })
})
