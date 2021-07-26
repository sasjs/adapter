import { rootFolderNotFound } from '../../utils'

describe('root folder not found', () => {
  it('when access token is provided, error message should contain scope of accessToken', () => {
    const token =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6WyJzY29wZS0xIiwic2NvcGUtMiJdfQ.ktqPL2ulln-8Asa2jSV9QCfDYmQuNk4tNKopxJR5xZs'
    let error
    try {
      rootFolderNotFound('/myProject', 'https://analytium.co.uk', token)
    } catch (err) {
      error = err.message
    }
    expect(error).toContain('scope-1')
    expect(error).toContain('scope-2')
  })
})
