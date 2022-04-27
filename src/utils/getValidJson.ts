import { JsonParseArrayError, InvalidJsonError } from '../types/errors'

/**
 * if string passed then parse the string to json else if throw error for all other types unless it is not a valid json object.
 * @param str - string to check.
 */
export const getValidJson = (str: string | object): object => {
  try {
    if (str === null || str === undefined) throw new InvalidJsonError()

    if (Array.isArray(str)) throw new JsonParseArrayError()

    if (typeof str === 'object') return str

    if (str === '') return {}

    return JSON.parse(str)
  } catch (e) {
    if (e instanceof JsonParseArrayError) throw e
    throw new InvalidJsonError()
  }
}
