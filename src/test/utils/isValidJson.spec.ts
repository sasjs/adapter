import { getValidJson } from '../../utils'

describe('jsonValidator', () => {
  it('should not throw an error with an valid json', () => {
    const json = {
      test: 'test'
    }

    expect(getValidJson(json)).toBe(json)
  })

  it('should not throw an error with an valid json string', () => {
    const json = {
      test: 'test'
    }

    expect(getValidJson(JSON.stringify(json))).toStrictEqual(json)
  })

  it('should throw an error with an invalid json', () => {
    const json = `{\"test\":\"test\"\"test2\":\"test\"}`

    expect(() => {
      try {
        getValidJson(json)
      } catch (err) {
        throw new Error()
      }
    }).toThrowError
  })
})
