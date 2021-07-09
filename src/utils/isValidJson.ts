/**
 * Checks if string is in valid JSON format else throw error.
 * @param str - string to check.
 */
export const isValidJson = (str: string | object) => {
  try {
    str = typeof str !== 'string' ? JSON.stringify(str) : str
    JSON.parse(str)
  } catch (e) {
    throw new Error('Invalid JSON response.')
  }
}
