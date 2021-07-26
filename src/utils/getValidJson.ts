/**
 * if string passed then parse the string to json else if throw error for all other types unless it is not a valid json object.
 * @param str - string to check.
 */
export const getValidJson = (str: string | object) => {
  try {
    if (Array.isArray(str)) {
      throw new Error('Can not parse array object to json.')
    }
    if (typeof str === 'object') return str

    return JSON.parse(str)
  } catch (e) {
    throw new Error('Invalid JSON response.')
  }
}
