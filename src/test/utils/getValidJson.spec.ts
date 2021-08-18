import { getValidJson } from '../../utils'
import { JsonParseArrayError, InvalidJsonError } from '../../types/errors'

describe('jsonValidator', () => {
  it('should not throw an error with a valid json', () => {
    const json = {
      test: 'test'
    }

    expect(getValidJson(json)).toBe(json)
  })

  it('should not throw an error with a valid json string', () => {
    const json = {
      test: 'test'
    }

    expect(getValidJson(JSON.stringify(json))).toStrictEqual(json)
  })

  it('should throw an error with an invalid json', () => {
    const json = `{\"test\":\"test\"\"test2\":\"test\"}`
    const test = () => {
      getValidJson(json)
    }
    expect(test).toThrowError(InvalidJsonError)
  })

  it('should throw an error when an array is passed', () => {
    const array = ['hello', 'world']
    const test = () => {
      getValidJson(array)
    }
    expect(test).toThrow(JsonParseArrayError)
  })
})
