import { parseSasViyaLog } from '../parseSasViyaLog'

describe('parseSasViyaLog', () => {
  it('should parse sas viya log if environment is Node', () => {
    const logResponse = {
      items: [{ line: 'Line 1' }, { line: 'Line 2' }, { line: 'Line 3' }]
    }

    const expectedLog = 'Line 1\nLine 2\nLine 3'
    const result = parseSasViyaLog(logResponse)
    expect(result).toEqual(expectedLog)
  })

  it('should handle exceptions and return the original logResponse', () => {
    // Create a logResponse that will cause an error in the mapping process.
    const logResponse: any = {
      items: null
    }
    // Since logResponse.items is null, the ternary operator returns the else branch.
    const expectedLog = JSON.stringify(logResponse)
    const result = parseSasViyaLog(logResponse)
    expect(result).toEqual(expectedLog)
  })
})
