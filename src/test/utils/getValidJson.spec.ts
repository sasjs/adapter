import { getValidJson } from '../../utils'

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
    let errorThrown = false
    try {
      getValidJson(json)
    } catch (error) {
      errorThrown = true
    }
    expect(errorThrown).toBe(true)
  })

  it('should throw an error when an array is passed', () => {
    const array = ['hello', 'world']
    let errorThrown = false
    try {
      getValidJson(array)
    } catch (error) {
      errorThrown = true
    }
    expect(errorThrown).toBe(true)
  })
})
