/**
 * Checks if string is in URI format.
 * @param str - string to check.
 */
export const isUri = (str: string): boolean => /^\/folders\/folders\//.test(str)
