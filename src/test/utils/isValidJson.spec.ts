import { isValidJson } from '../../utils'

describe('jsonValidator', () => {
  it('should not throw an error with an valid json', () => {
    const json = {
      test: 'test'
    }

    expect(isValidJson(json)).toBe(json)
  })

  it('should not throw an error with an valid json string', () => {
    const json = {
      test: 'test'
    }

    expect(isValidJson(JSON.stringify(json))).toStrictEqual(json)
  })

  it('should throw an error with an invalid json', () => {
    const json = `{\"test\":\"test\"\"test2\":\"test\"}`

    expect(() => {
      try {
        isValidJson(json)
      } catch (err) {
        throw new Error()
      }
    }).toThrowError
  })
})
